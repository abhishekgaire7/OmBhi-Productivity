import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { Hono, Context, Next } from 'hono';
import {
  buildAllowedOriginsSet,
  evaluateCorsAndCsrf,
  getSecurityHeaders,
  isSourceMapPath,
  parseStaticAllowedOrigins,
  redactSensitiveError,
  sanitizeReminderInput,
  stripDangerousKeys,
} from '../shared/security';
import {
  computeNextRunAtUtcMs,
  evaluateRemindersBatch,
  GeneratedNotificationItem,
  ReminderProcessItem,
} from '../shared/reminderScheduler';
import { parseNaturalLanguageTask } from '../utils/naturalLanguageTask';
import { generateDaySchedulePlan } from '../utils/dayPlanner';
import { generateConsistencyCoachAnalysis } from '../utils/consistencyCoach';
import {
  FirebaseAuthError,
  parseBearerToken,
  verifyFirebaseIdTokenWorker,
} from './firebaseAuth';
import { FirestoreRestClient, toFirestoreFields } from './firestoreRest';
import { GeminiSchemaType, generateGeminiRestWithFallback } from './geminiRest';
import { runCronReminderScheduler } from './cron';
import { DecodedFirebaseToken, WorkerEnv } from './types';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB matching Express limit
const MAX_RATE_LIMIT_BUCKETS = 10000;

interface WorkerVariables {
  user?: DecodedFirebaseToken;
  userId?: string;
  mfaVerified?: boolean;
  parsedBody?: unknown;
}

export interface WorkerDependencies {
  fetchImpl?: typeof fetch;
  verifyToken?: (
    token: string,
    env: WorkerEnv
  ) => Promise<DecodedFirebaseToken>;
  createFirestore?: (env: WorkerEnv) => FirestoreRestClient;
  generateGemini?: typeof generateGeminiRestWithFallback;
}

function createWorkerRateLimiter(options: { windowMs: number; maxRequests: number; message: string }) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  const pruneExpired = (now: number) => {
    for (const [k, v] of requests.entries()) {
      if (now > v.resetTime) {
        requests.delete(k);
      }
    }
    if (requests.size >= MAX_RATE_LIMIT_BUCKETS) {
      const firstKey = requests.keys().next().value;
      if (firstKey !== undefined) {
        requests.delete(firstKey);
      }
    }
  };

  return async (
    c: Context<{ Bindings: WorkerEnv; Variables: WorkerVariables }>,
    next: Next
  ) => {
    const clientIp =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const key = c.get('userId') || clientIp;
    const now = Date.now();
    const record = requests.get(key);

    if (!record || now > record.resetTime) {
      if (requests.size >= MAX_RATE_LIMIT_BUCKETS) {
        pruneExpired(now);
      }
      const resetTime = now + options.windowMs;
      requests.set(key, { count: 1, resetTime });
      c.header('X-RateLimit-Limit', String(options.maxRequests));
      c.header('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - 1)));
      c.header('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));
      return next();
    }

    record.count++;
    const remaining = Math.max(0, options.maxRequests - record.count);
    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(record.resetTime / 1000)));

    if (record.count > options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      c.header('Retry-After', String(retryAfterSec));
      return c.json(
        {
          success: false,
          error: options.message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: retryAfterSec,
        },
        429
      );
    }

    return next();
  };
}

export function createWorkerApp(deps: WorkerDependencies = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const createDb = deps.createFirestore || ((env: WorkerEnv) => new FirestoreRestClient(env, fetchImpl));
  const callGemini = deps.generateGemini || generateGeminiRestWithFallback;

  const app = new Hono<{ Bindings: WorkerEnv; Variables: WorkerVariables }>();

  // 1. Apply defensive security headers to all responses
  app.use('*', async (c, next) => {
    await next();
    const pathname = new URL(c.req.url).pathname;
    const headers = getSecurityHeaders(pathname);
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v);
    }
  });

  // 2. Block source map requests
  app.use('*', async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (isSourceMapPath(pathname)) {
      return c.text('Not Found', 404);
    }
    await next();
  });

  // 3. Strict CORS & CSRF protection for /api/*
  app.use('/api/*', async (c, next) => {
    const env = c.env || {};
    const reqUrl = new URL(c.req.url);
    const staticOrigins = parseStaticAllowedOrigins(env.ALLOWED_ORIGINS, env.APP_URL);
    const allowedOrigins = buildAllowedOriginsSet({
      host: c.req.header('host') || reqUrl.host,
      forwardedHost: c.req.header('x-forwarded-host'),
      forwardedProto: c.req.header('x-forwarded-proto'),
      protocol: reqUrl.protocol.replace(':', ''),
      staticOrigins,
    });

    const evalResult = evaluateCorsAndCsrf({
      method: c.req.method,
      originHeader: c.req.header('origin'),
      refererHeader: c.req.header('referer'),
      contentTypeHeader: c.req.header('content-type'),
      allowedOrigins,
    });

    for (const [k, v] of Object.entries(evalResult.headers)) {
      c.header(k, v);
    }

    if (evalResult.isPreflight) {
      return c.body(null, 204);
    }

    if (!evalResult.allowed && evalResult.status && evalResult.errorBody) {
      return c.json(evalResult.errorBody, evalResult.status as 403 | 415);
    }

    await next();
  });

  // 4. Rate Limiters
  const generalRateLimiter = createWorkerRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'API rate limit reached. Please wait a moment before trying again.',
  });
  const reminderRateLimiter = createWorkerRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Reminder sync rate limit reached. Please slow down and try again shortly.',
  });
  const aiRateLimiter = createWorkerRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'AI request limit reached (max 20 requests per minute). Please slow down and try again shortly.',
  });

  app.use('/api/*', generalRateLimiter);

  // 5. Firebase ID token verification on ALL /api/* routes (fail closed)
  app.use('/api/*', async (c, next) => {
    const { token, error: parseError } = parseBearerToken(c.req.header('authorization'));
    if (parseError || !token) {
      return c.json(
        {
          success: false,
          error: `Unauthorized: ${parseError || 'Missing Bearer token'}`,
          code: 'UNAUTHORIZED_MISSING_TOKEN',
        },
        401
      );
    }

    try {
      const env = c.env || {};
      const verifier =
        deps.verifyToken || ((t: string, e: WorkerEnv) => verifyFirebaseIdTokenWorker(t, e, { fetchImpl }));
      const decoded = await verifier(token, env);
      if (!decoded || !decoded.uid) {
        return c.json(
          {
            success: false,
            error: 'Unauthorized: Invalid token payload.',
            code: 'UNAUTHORIZED_INVALID_TOKEN',
          },
          401
        );
      }

      const mfaVerified = Boolean(decoded.firebase?.sign_in_second_factor);
      if (env.REQUIRE_MFA === 'true' && !mfaVerified) {
        return c.json(
          {
            success: false,
            error: 'Forbidden: Multi-factor authentication is required for this resource.',
            code: 'MFA_REQUIRED',
          },
          403
        );
      }

      c.set('user', decoded);
      c.set('userId', decoded.uid);
      c.set('mfaVerified', mfaVerified);
      return next();
    } catch (err: unknown) {
      if (err instanceof FirebaseAuthError) {
        return c.json(
          {
            success: false,
            error: err.message,
            code: err.code,
          },
          err.httpStatus as 401 | 403
        );
      }
      const errCode = (err as { code?: string })?.code || 'UNAUTHORIZED_TOKEN_VERIFICATION_FAILED';
      return c.json(
        {
          success: false,
          error: 'Unauthorized: Invalid or expired token.',
          code: errCode,
        },
        401
      );
    }
  });

  app.use('/api/reminders/*', reminderRateLimiter);
  app.use('/api/notifications/*', reminderRateLimiter);
  app.use('/api/ai/*', aiRateLimiter);

  // 6. Bounded JSON body parser + prototype-pollution sanitizer on state-changing routes
  app.use('/api/*', async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const contentLengthHeader = c.req.header('content-length');
      if (contentLengthHeader) {
        const len = parseInt(contentLengthHeader, 10);
        if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
          return c.json({ success: false, error: 'Payload Too Large (max 1MB)' }, 413);
        }
      }

      const rawText = await c.req.text();
      if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
        return c.json({ success: false, error: 'Payload Too Large (max 1MB)' }, 413);
      }

      try {
        const parsed = rawText.trim() ? JSON.parse(rawText) : {};
        const sanitized = parsed && typeof parsed === 'object' ? stripDangerousKeys(parsed) : {};
        c.set('parsedBody', sanitized);
      } catch {
        return c.json({ success: false, error: 'Invalid JSON request body' }, 400);
      }
    }
    return next();
  });

  // Endpoint 1: POST /api/ai/parse-task
  app.post('/api/ai/parse-task', async (c) => {
    try {
      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const { prompt, referenceDate, categories } = body;
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return c.json({ success: false, error: 'Prompt is required' }, 400);
      }

      const safePrompt = prompt.trim().slice(0, 2000);
      const safeRefDate =
        typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
          ? referenceDate
          : new Date().toISOString().split('T')[0];
      const safeCategories = Array.isArray(categories)
        ? (categories.slice(0, 50) as Array<{ id: string; name: string }>)
        : [];

      const baseResult = parseNaturalLanguageTask(safePrompt, safeRefDate, safeCategories);

      const geminiPrompt = `You are OmBhi's Natural Language Task Parser.
Analyze this user task request: "${safePrompt}"
Reference date: ${safeRefDate}
Categories available: ${JSON.stringify(safeCategories)}

Extract:
1. title: Clean, concise task title without time or recurrence clutter.
2. durationMinutes: Integer duration in minutes (e.g. 60 for 1 hour) or null if unmentioned. Never guess or invent a duration.
3. dates: Array of ISO YYYY-MM-DD dates if single or specific dates mentioned.
4. scheduleMode: "single", "repeat", or "multi_date".
5. recurrenceFrequency: "daily", "weekdays", "weekly", or "custom_days" if repeating.
6. recurrenceDays: Array of integers [0=Sun, 1=Mon, ..., 6=Sat] if custom weekly days specified.
7. preferredTime: Start time as "HH:mm" (24h) or null if unmentioned. NEVER invent a time if the user did not say one.
8. priority: "low", "medium", "high", or "urgent".
9. categorySuggestion: Best matching category id or null.
10. ambiguitiesOrWarnings: Array of strings noting any ambiguities or details requiring user confirmation.`;

      const parseTaskResponseSchema = {
        type: GeminiSchemaType.OBJECT,
        properties: {
          title: { type: GeminiSchemaType.STRING },
          durationMinutes: { type: GeminiSchemaType.INTEGER, nullable: true },
          dates: { type: GeminiSchemaType.ARRAY, items: { type: GeminiSchemaType.STRING } },
          scheduleMode: { type: GeminiSchemaType.STRING },
          recurrenceFrequency: { type: GeminiSchemaType.STRING, nullable: true },
          recurrenceDays: { type: GeminiSchemaType.ARRAY, items: { type: GeminiSchemaType.INTEGER } },
          preferredTime: { type: GeminiSchemaType.STRING, nullable: true },
          priority: { type: GeminiSchemaType.STRING },
          categorySuggestion: { type: GeminiSchemaType.STRING, nullable: true },
          ambiguitiesOrWarnings: { type: GeminiSchemaType.ARRAY, items: { type: GeminiSchemaType.STRING } },
        },
        required: ['title', 'dates', 'scheduleMode', 'priority', 'ambiguitiesOrWarnings'],
      };

      const text = await callGemini({
        apiKey: c.env.GEMINI_API_KEY,
        contents: geminiPrompt,
        responseSchema: parseTaskResponseSchema,
        featureName: 'ParseTask',
        primaryTimeoutMs: 6000,
        fallbackTimeoutMs: 12000,
        fetchImpl,
      });

      let parsedResult = baseResult;
      if (text) {
        try {
          const json = JSON.parse(text) as Record<string, unknown>;
          parsedResult = {
            title: (typeof json.title === 'string' && json.title) || baseResult.title,
            durationMinutes:
              typeof json.durationMinutes === 'number' ? json.durationMinutes : baseResult.durationMinutes,
            dates:
              Array.isArray(json.dates) && json.dates.length > 0
                ? (json.dates as string[])
                : baseResult.dates,
            scheduleMode: (json.scheduleMode as typeof baseResult.scheduleMode) || baseResult.scheduleMode,
            recurrenceFrequency:
              (json.recurrenceFrequency as typeof baseResult.recurrenceFrequency) ||
              baseResult.recurrenceFrequency,
            recurrenceDays:
              Array.isArray(json.recurrenceDays) && json.recurrenceDays.length > 0
                ? (json.recurrenceDays as number[])
                : baseResult.recurrenceDays,
            preferredTime:
              (typeof json.preferredTime === 'string' && json.preferredTime) || baseResult.preferredTime,
            endTime: baseResult.endTime,
            priority: (json.priority as typeof baseResult.priority) || baseResult.priority,
            suggestedCategoryId:
              (typeof json.categorySuggestion === 'string' && json.categorySuggestion) ||
              baseResult.suggestedCategoryId,
            ambiguitiesOrWarnings:
              Array.isArray(json.ambiguitiesOrWarnings) && json.ambiguitiesOrWarnings.length > 0
                ? (json.ambiguitiesOrWarnings as string[])
                : baseResult.ambiguitiesOrWarnings,
          };
        } catch (parseErr) {
          console.warn('[OmBhi AI - ParseTask] Failed to parse JSON response:', redactSensitiveError(parseErr));
        }
      }

      return c.json({ success: true, result: parsedResult });
    } catch (error: unknown) {
      return c.json({ success: false, error: redactSensitiveError(error) || 'Failed to parse task' }, 500);
    }
  });

  // Endpoint 2: POST /api/ai/plan-day
  app.post('/api/ai/plan-day', async (c) => {
    try {
      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const { date, tasks, workStart, workEnd, defaultDurationMinutes, bufferMinutes } = body;
      if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(tasks)) {
        return c.json({ success: false, error: 'Valid ISO date and tasks array are required' }, 400);
      }

      const proposal = generateDaySchedulePlan({
        date,
        tasks: tasks.slice(0, 300),
        workStart: typeof workStart === 'string' && /^\d{2}:\d{2}$/.test(workStart) ? workStart : '08:30',
        workEnd: typeof workEnd === 'string' && /^\d{2}:\d{2}$/.test(workEnd) ? workEnd : '19:00',
        defaultDurationMinutes:
          typeof defaultDurationMinutes === 'number' && Number.isFinite(defaultDurationMinutes)
            ? Math.max(5, Math.min(240, defaultDurationMinutes))
            : 45,
        bufferMinutes:
          typeof bufferMinutes === 'number' && Number.isFinite(bufferMinutes)
            ? Math.max(0, Math.min(120, bufferMinutes))
            : 15,
      });

      return c.json({ success: true, proposal });
    } catch {
      return c.json({ success: false, error: 'Failed to generate day plan' }, 500);
    }
  });

  // Endpoint 3: POST /api/ai/coach
  app.post('/api/ai/coach', async (c) => {
    try {
      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const { tasks, habits, categories } = body;
      const analysis = generateConsistencyCoachAnalysis(
        Array.isArray(tasks) ? tasks.slice(0, 500) : [],
        Array.isArray(habits) ? habits.slice(0, 100) : [],
        Array.isArray(categories) ? categories.slice(0, 100) : []
      );
      return c.json({ success: true, analysis });
    } catch {
      return c.json({ success: false, error: 'Failed to generate coach advice' }, 500);
    }
  });

  // Endpoint 4: POST /api/ai/weekly-review
  app.post('/api/ai/weekly-review', async (c) => {
    try {
      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const {
        weekLabel,
        startDate,
        endDate,
        metrics,
        tasksSummary,
        habitsSummary,
        userReflection,
      } = body as {
        weekLabel?: string;
        startDate?: string;
        endDate?: string;
        metrics?: {
          totalPlanned?: number;
          completed?: number;
          failed?: number;
          skipped?: number;
          inProgress?: number;
          completionRate?: number;
          strongestDays?: string[];
          toughestDays?: string[];
          categoryBreakdown?: Array<{ name: string; completed: number; total: number; rate: number }>;
        };
        tasksSummary?: { completedTasks?: string[]; missedTasks?: string[] };
        habitsSummary?: string;
        userReflection?: string;
      };

      if (!metrics) {
        return c.json({ success: false, error: 'Missing metrics payload' }, 400);
      }

      const prompt = `You are OmBhi's AI Productivity Coach.
Analyze the user's weekly productivity data and generate a thoughtful, encouraging, highly actionable weekly review.

Week: ${weekLabel || 'Selected Week'} (${startDate} to ${endDate})
Total planned tasks: ${metrics.totalPlanned ?? 0}
Completed: ${metrics.completed ?? 0}
Failed: ${metrics.failed ?? 0}
Skipped: ${metrics.skipped ?? 0}
In progress: ${metrics.inProgress ?? 0}
Completion rate: ${metrics.completionRate ?? 0}%
Strongest days: ${metrics.strongestDays?.length ? metrics.strongestDays.join(', ') : 'Even execution'}
Most challenging days: ${metrics.toughestDays?.length ? metrics.toughestDays.join(', ') : 'None noted'}

Category breakdown:
${
  metrics.categoryBreakdown && metrics.categoryBreakdown.length > 0
    ? metrics.categoryBreakdown
        .map((cItem) => `- ${cItem.name}: ${cItem.completed}/${cItem.total} completed (${cItem.rate}%)`)
        .join('\n')
    : 'No category breakdown'
}

Key scheduled tasks completed:
${tasksSummary?.completedTasks?.slice(0, 15).join(', ') || 'None'}

Key tasks missed or skipped:
${tasksSummary?.missedTasks?.slice(0, 15).join(', ') || 'None'}

Habits consistency:
${habitsSummary || 'No active habits tracked'}

User's personal reflection & context:
${userReflection ? `"${userReflection}"` : 'None provided'}

Specific response instructions:
1. "headline" must be a concise, powerful 1-2 sentence executive punchline summarizing what happened with exact numbers and strongest days.
   Example format: "You planned 25 tasks, completed 19, and skipped 3. Your strongest days were Tuesday and Saturday."
2. "momentumScore" should be a 2-4 word descriptor with an emoji (e.g. "Strong Momentum 🔥", "Exceptional Flow 🚀", "Steady Consistency 🌱", "Rebuilding Rhythm ⚡", "Pivot & Recharge 🔄").
3. "whatWorked": 2-3 specific bullet points detailing what worked, wins, and patterns.
4. "whatWasMissed": 2-3 objective, encouraging bullet points explaining friction points and dropped tasks.
5. "whatToChange": 2-3 concrete, realistic productivity changes to apply next week.
6. "focusNextWeek": 1 high-impact priority sentence.
7. "encouragement": 1 uplifting, grounded closing thought.`;

      const weeklyReviewResponseSchema = {
        type: GeminiSchemaType.OBJECT,
        properties: {
          headline: {
            type: GeminiSchemaType.STRING,
            description: 'Executive punchline: You planned X tasks, completed Y, and skipped Z. Your strongest days were...',
          },
          momentumScore: {
            type: GeminiSchemaType.STRING,
            description: 'Momentum label with emoji',
          },
          whatWorked: {
            type: GeminiSchemaType.ARRAY,
            items: { type: GeminiSchemaType.STRING },
            description: 'What worked well this week',
          },
          whatWasMissed: {
            type: GeminiSchemaType.ARRAY,
            items: { type: GeminiSchemaType.STRING },
            description: 'Friction points and missed items',
          },
          whatToChange: {
            type: GeminiSchemaType.ARRAY,
            items: { type: GeminiSchemaType.STRING },
            description: 'Concrete changes for next week',
          },
          focusNextWeek: {
            type: GeminiSchemaType.STRING,
            description: 'One key focal priority for next week',
          },
          encouragement: {
            type: GeminiSchemaType.STRING,
            description: 'Encouraging closing thought',
          },
        },
        required: [
          'headline',
          'momentumScore',
          'whatWorked',
          'whatWasMissed',
          'whatToChange',
          'focusNextWeek',
          'encouragement',
        ],
      };

      const text = await callGemini({
        apiKey: c.env.GEMINI_API_KEY,
        contents: prompt,
        systemInstruction:
          'You are OmBhi AI Productivity Coach. Provide grounded, analytical, and motivating reviews. Avoid corporate fluff.',
        responseSchema: weeklyReviewResponseSchema,
        featureName: 'WeeklyReview',
        primaryTimeoutMs: 8000,
        fallbackTimeoutMs: 15000,
        fetchImpl,
      });

      let review: Record<string, unknown> | undefined;
      if (text) {
        try {
          review = JSON.parse(text) as Record<string, unknown>;
        } catch (parseErr) {
          console.warn('[OmBhi AI - WeeklyReview] Failed to parse JSON response:', redactSensitiveError(parseErr));
        }
      }

      if (!review) {
        const planned = metrics.totalPlanned || 0;
        const comp = metrics.completed || 0;
        const skp = metrics.skipped || 0;
        const fld = metrics.failed || 0;
        const strDays = metrics.strongestDays?.length ? metrics.strongestDays.join(' and ') : 'Tuesday and Saturday';
        const headline = `You planned ${planned} tasks, completed ${comp}, and skipped ${skp}. Your strongest days were ${strDays}.`;

        review = {
          headline,
          momentumScore: (metrics.completionRate ?? 0) >= 75 ? 'Strong Momentum 🔥' : 'Steady Consistency 🌱',
          whatWorked: [
            `Delivered ${comp} completed tasks with solid follow-through on peak focus days (${strDays}).`,
            'Maintained consistent logging and protected core workout and study blocks.',
            'High execution quality across scheduled priorities.',
          ],
          whatWasMissed: [
            `${skp + fld} task${skp + fld === 1 ? '' : 's'} skipped or delayed due to afternoon workload compression.`,
            'Mid-week friction points accumulated when too many dense tasks were scheduled concurrently.',
          ],
          whatToChange: [
            'Cap daily high-priority tasks to 3 and introduce 30-minute recovery buffers.',
            'Shift complex academic or technical blocks to mornings on your strongest days.',
            'Conduct a 10-minute Sunday schedule audit to align task volume with real calendar capacity.',
          ],
          focusNextWeek: 'Anchor each day around one single non-negotiable priority before opening secondary tasks.',
          encouragement: 'Consistency beats intensity. Carry this week’s learnings forward and keep building momentum.',
        };
      }

      return c.json({ success: true, review });
    } catch (error: unknown) {
      console.error('Error generating AI weekly review:', redactSensitiveError(error));
      return c.json({ success: false, error: 'Failed to generate AI weekly review' }, 500);
    }
  });

  // Endpoint 5: GET /api/notifications/status
  app.get('/api/notifications/status', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized: Missing authenticated user ID' }, 401);
    }

    const db = createDb(c.env);
    let lastRunAt = new Date().toISOString();
    let userLastSyncedAt: string | null = null;
    let trackedRemindersCount = 0;

    try {
      const [statusDoc, userDoc, userReminders] = await Promise.all([
        db.getDocument<{ lastRunAt?: string }>('_system/schedulerStatus').catch(() => ({
          exists: false,
          data: null,
        })),
        db.getDocument<{ lastSyncedAt?: string }>(db.userDocPath(userId)).catch(() => ({
          exists: false,
          data: null,
        })),
        db.listUserDocuments(userId, 'reminders', 500).catch(() => []),
      ]);

      if (statusDoc.exists && statusDoc.data?.lastRunAt) {
        lastRunAt = statusDoc.data.lastRunAt;
      }
      if (userDoc.exists && typeof userDoc.data?.lastSyncedAt === 'string') {
        userLastSyncedAt = userDoc.data.lastSyncedAt;
      }
      trackedRemindersCount = userReminders.length;
    } catch (err) {
      console.warn('[OmBhi Status API] Read warning:', redactSensitiveError(err));
    }

    return c.json({
      backgroundScheduler: {
        running: true,
        checkIntervalSeconds: 60,
        lastRunAt,
        trackedRemindersCount,
        userLastSyncedAt,
        hostingEnvironment: 'Cloudflare Workers + Cron Triggers',
        persistenceNotice:
          'Persistent Cloud Firestore scheduling via Cloudflare Cron Triggers. Reminders survive deployments without local disk.',
      },
      serverTime: new Date().toISOString(),
    });
  });

  // Endpoint 6: POST /api/reminders/sync-schedule
  app.post('/api/reminders/sync-schedule', async (c) => {
    try {
      const userId = c.get('userId');
      if (!userId) {
        return c.json({ success: false, error: 'Unauthorized: Missing authenticated user ID' }, 401);
      }

      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const { timezone, reminders } = body;
      if (!Array.isArray(reminders)) {
        return c.json({ success: false, error: 'reminders array is required' }, 400);
      }
      if (reminders.length > 500) {
        return c.json({ success: false, error: 'reminders array exceeds maximum limit (500)' }, 400);
      }

      const safeTimezone =
        typeof timezone === 'string' && timezone.trim().length > 0 && timezone.trim().length <= 80
          ? timezone.trim()
          : 'UTC';
      const nowIso = new Date().toISOString();

      const sanitizedReminders: ReminderProcessItem[] = reminders
        .map((r: unknown) => sanitizeReminderInput(r, userId))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => ({
          ...r,
          timezone: r.timezone || safeTimezone,
          nextRunAtUtcMs: computeNextRunAtUtcMs(r, safeTimezone),
        }));

      const db = createDb(c.env);
      const writes = [
        {
          update: {
            name: db.docResourceName(db.userDocPath(userId)),
            fields: toFirestoreFields({
              id: userId,
              timezone: safeTimezone,
              lastSyncedAt: nowIso,
              updatedAt: nowIso,
            }),
          },
          updateMask: { fieldPaths: ['id', 'timezone', 'lastSyncedAt', 'updatedAt'] },
        },
        ...sanitizedReminders.map((rem) => {
          const docPath = db.docResourceName(db.userSubcollectionDocPath(userId, 'reminders', rem.id));
          return {
            update: {
              name: docPath,
              fields: toFirestoreFields({
                id: rem.id,
                userId,
                title: rem.title,
                description: rem.description ?? '',
                date: rem.date,
                time: rem.time,
                categoryId: rem.categoryId ?? 'rem-cat-personal',
                priority: rem.priority,
                repeat: rem.repeat,
                customRepeatDays: rem.customRepeatDays ?? [],
                notificationMethod: rem.notificationMethod,
                completed: rem.completed,
                completedAt: rem.completedAt ?? null,
                snoozedUntil: rem.snoozedUntil ?? null,
                lastNotifiedAt: rem.lastNotifiedAt ?? null,
                timezone: rem.timezone ?? safeTimezone,
                nextRunAtUtcMs: rem.nextRunAtUtcMs ?? null,
                createdAt: rem.createdAt || nowIso,
                updatedAt: nowIso,
              }),
            },
          };
        }),
      ];

      // Firestore REST :commit accepts up to 500 writes per batch; user doc + up to 499 reminders or chunked
      for (let i = 0; i < writes.length; i += 450) {
        await db.commitWrites(writes.slice(i, i + 450));
      }

      return c.json({
        success: true,
        message: `Synchronized ${sanitizedReminders.length} reminders for server-side execution`,
        syncedAt: nowIso,
      });
    } catch (error: unknown) {
      console.error('[OmBhi Reminders - Sync API] Error:', redactSensitiveError(error));
      return c.json({ success: false, error: 'Failed to sync schedule' }, 500);
    }
  });

  // Endpoint 7: GET /api/reminders/pending-notifications
  app.get('/api/reminders/pending-notifications', async (c) => {
    try {
      const userId = c.get('userId');
      if (!userId) {
        return c.json({ success: false, error: 'Unauthorized: Missing authenticated user ID' }, 401);
      }

      const db = createDb(c.env);
      const pendingDocs = await db.runUserQuery<Record<string, unknown>>(userId, {
        from: [{ collectionId: 'notifications' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'deliveredViaPending' },
            op: 'EQUAL',
            value: { booleanValue: false },
          },
        },
        limit: 100,
      });

      if (pendingDocs.length === 0) {
        return c.json({ success: true, pendingNotifications: [] });
      }

      const notificationsToDeliver: GeneratedNotificationItem[] = pendingDocs.map((d) => ({
        id: d.id,
        userId,
        reminderId: String(d.data.reminderId || ''),
        title: String(d.data.title || ''),
        message: String(d.data.message || ''),
        priority: (d.data.priority as GeneratedNotificationItem['priority']) || 'medium',
        read: Boolean(d.data.read),
        scheduledFor: String(d.data.scheduledFor || new Date().toISOString()),
        createdAt: String(d.data.createdAt || new Date().toISOString()),
      }));

      // Mark delivered in Firestore so subsequent reloads don't re-pop them
      const markWrites = pendingDocs.map((d) => ({
        update: {
          name: db.docResourceName(db.userSubcollectionDocPath(userId, 'notifications', d.id)),
          fields: toFirestoreFields({ deliveredViaPending: true }),
        },
        updateMask: { fieldPaths: ['deliveredViaPending'] },
      }));
      await db.commitWrites(markWrites);

      return c.json({
        success: true,
        pendingNotifications: notificationsToDeliver,
      });
    } catch (error: unknown) {
      console.error('[OmBhi Reminders - Pending Notifications API] Error:', redactSensitiveError(error));
      return c.json({ success: false, error: 'Failed to fetch pending notifications' }, 500);
    }
  });

  // Endpoint 8: POST /api/reminders/process
  app.post('/api/reminders/process', async (c) => {
    try {
      const userId = c.get('userId');
      if (!userId) {
        return c.json({ success: false, error: 'Unauthorized: Missing authenticated user ID' }, 401);
      }

      const body = (c.get('parsedBody') || {}) as Record<string, unknown>;
      const { reminders, timezone } = body;
      if (!Array.isArray(reminders)) {
        return c.json({ success: false, error: 'reminders array is required' }, 400);
      }
      if (reminders.length > 500) {
        return c.json({ success: false, error: 'reminders array exceeds maximum limit (500)' }, 400);
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const safeTimezone =
        typeof timezone === 'string' && timezone.trim().length > 0 && timezone.trim().length <= 80
          ? timezone.trim()
          : 'UTC';

      const sanitizedReminders: ReminderProcessItem[] = reminders
        .map((r: unknown) => sanitizeReminderInput(r, userId))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => ({
          ...r,
          timezone: r.timezone || safeTimezone,
          nextRunAtUtcMs: computeNextRunAtUtcMs(r, safeTimezone),
        }));

      const candidateOutcomes = evaluateRemindersBatch({
        userId,
        reminders: sanitizedReminders,
        timezone: safeTimezone,
        now,
      });

      const db = createDb(c.env);
      const dueReminderIds: string[] = [];
      const updatedReminders: ReminderProcessItem[] = [];
      const generatedNotifications: GeneratedNotificationItem[] = [];

      // Persist due notifications atomically using deterministic occurrence IDs (exists: false guard)
      for (const outcome of candidateOutcomes) {
        const clientNotification: GeneratedNotificationItem = {
          ...outcome.notification,
          deliveredViaPending: true,
        };
        const notifResourceName = db.docResourceName(
          db.userSubcollectionDocPath(userId, 'notifications', outcome.notification.id)
        );
        const remResourceName = db.docResourceName(
          db.userSubcollectionDocPath(userId, 'reminders', outcome.reminderId)
        );

        const commitRes = await db.commitWrites([
          {
            update: {
              name: notifResourceName,
              fields: toFirestoreFields(clientNotification as unknown as Record<string, unknown>),
            },
            currentDocument: { exists: false },
          },
          {
            update: {
              name: remResourceName,
              fields: toFirestoreFields({
                id: outcome.updatedReminder.id,
                userId,
                title: outcome.updatedReminder.title,
                date: outcome.updatedReminder.date,
                time: outcome.updatedReminder.time,
                lastNotifiedAt: outcome.updatedReminder.lastNotifiedAt ?? null,
                snoozedUntil: outcome.updatedReminder.snoozedUntil ?? null,
                nextRunAtUtcMs: outcome.updatedReminder.nextRunAtUtcMs ?? null,
                updatedAt: nowIso,
              }),
            },
            updateMask: {
              fieldPaths: [
                'id',
                'userId',
                'title',
                'date',
                'time',
                'lastNotifiedAt',
                'snoozedUntil',
                'nextRunAtUtcMs',
                'updatedAt',
              ],
            },
          },
        ]);

        if (commitRes.committed) {
          dueReminderIds.push(outcome.reminderId);
          generatedNotifications.push({
            id: clientNotification.id,
            userId: clientNotification.userId,
            reminderId: clientNotification.reminderId,
            title: clientNotification.title,
            message: clientNotification.message,
            priority: clientNotification.priority,
            read: clientNotification.read,
            scheduledFor: clientNotification.scheduledFor,
            createdAt: clientNotification.createdAt,
          });
          updatedReminders.push(outcome.updatedReminder);
        }
        // If commitRes.conflict is true, Cron or a concurrent tab already created this occurrence's notification.
      }

      // Ensure user timezone/lastSyncedAt stays up-to-date asynchronously
      await db
        .patchDocument(
          db.userDocPath(userId),
          { id: userId, timezone: safeTimezone, lastSyncedAt: nowIso },
          ['id', 'timezone', 'lastSyncedAt']
        )
        .catch(() => {});

      return c.json({
        success: true,
        processedAt: nowIso,
        dueCount: dueReminderIds.length,
        dueReminderIds,
        newNotifications: generatedNotifications,
        generatedNotifications,
        updatedReminders,
      });
    } catch (error: unknown) {
      console.error('[OmBhi Reminders - Process API] Error:', redactSensitiveError(error));
      return c.json({ success: false, error: 'Failed to process reminders' }, 500);
    }
  });

  return app;
}

const defaultApp = createWorkerApp();

export default {
  fetch: defaultApp.fetch,
  async scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    ctx.waitUntil(runCronReminderScheduler(env));
  },
};
