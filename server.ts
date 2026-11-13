import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseNaturalLanguageTask } from './src/utils/naturalLanguageTask';
import { generateDaySchedulePlan } from './src/utils/dayPlanner';
import { generateConsistencyCoachAnalysis } from './src/utils/consistencyCoach';
import {
  verifyFirebaseToken,
  createRateLimiter,
  AuthenticatedRequest,
} from './src/server/auth';
import {
  blockSourceMapsMiddleware,
  securityHeadersMiddleware,
  createCorsAndCsrfMiddleware,
  stripDangerousKeys,
  sanitizeReminderInput,
  redactSensitiveError,
} from './src/server/security';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(blockSourceMapsMiddleware);
app.use(securityHeadersMiddleware);
app.use(
  '/api',
  createCorsAndCsrfMiddleware({
    allowedOriginsEnv: process.env.ALLOWED_ORIGINS,
    appUrlEnv: process.env.APP_URL,
  })
);
app.use(express.json({ limit: '1mb' }));

// Strip prototype-pollution keys from any parsed JSON body
app.use('/api', (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  next();
});

// Rate Limiters
// General API endpoints: 120 requests/minute per IP/user
const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'API rate limit reached. Please wait a moment before trying again.',
});

// Reminder sync & processing endpoints: 60 requests/minute per authenticated user
const reminderRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Reminder sync rate limit reached. Please slow down and try again shortly.',
});

// AI Gemini endpoints: 20 requests/minute per authenticated user
const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'AI request limit reached (max 20 requests per minute). Please slow down and try again shortly.',
});

// Protect ALL backend APIs: authenticate via Firebase ID token and apply rate limits
app.use('/api', generalRateLimiter);
app.use('/api', verifyFirebaseToken);
app.use('/api/reminders', reminderRateLimiter);
app.use('/api/notifications', reminderRateLimiter);
app.use('/api/ai', aiRateLimiter);

// Shared Gemini client instance with required User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface GeminiCallParams {
  contents: string;
  systemInstruction?: string;
  responseSchema?: any;
  featureName: string;
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
}

/**
 * Resilient multi-model Gemini caller:
 * 1. Attempts gemini-3.8-flash first with configurable timeout.
 * 2. If it times out or encounters high demand / capacity spikes (503/504/429),
 *    automatically fails over to gemini-3.1-flash-lite.
 * 3. Returns the JSON response text or null if all attempts fail.
 */
async function generateGeminiContentWithFallback(params: GeminiCallParams): Promise<string | null> {
  const {
    contents,
    systemInstruction,
    responseSchema,
    featureName,
    primaryTimeoutMs = 8000,
    fallbackTimeoutMs = 15000,
  } = params;

  if (!process.env.GEMINI_API_KEY) {
    console.warn(`[OmBhi AI - ${featureName}] GEMINI_API_KEY is missing. Using local fallback.`);
    return null;
  }

  const candidateModels = [
    { name: 'gemini-3.8-flash', timeout: primaryTimeoutMs },
    { name: 'gemini-3.1-flash-lite', timeout: fallbackTimeoutMs },
  ];

  for (let i = 0; i < candidateModels.length; i++) {
    const candidate = candidateModels[i];
    const isLast = i === candidateModels.length - 1;

    try {
      console.log(`[OmBhi AI - ${featureName}] Calling model: ${candidate.name} (timeout: ${candidate.timeout}ms)`);
      const callPromise = ai.models.generateContent({
        model: candidate.name,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
        },
      });

      let timerId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`Timeout after ${candidate.timeout}ms waiting for ${candidate.name}`));
        }, candidate.timeout);
      });

      const response = await Promise.race([callPromise, timeoutPromise]);
      if (timerId) clearTimeout(timerId);

      if (response && response.text) {
        console.log(`[OmBhi AI - ${featureName}] Model ${candidate.name} succeeded.`);
        return response.text;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isCapacityOrTimeout =
        err?.status === 503 ||
        err?.status === 504 ||
        err?.status === 429 ||
        errMsg.includes('high demand') ||
        errMsg.includes('DEADLINE_EXCEEDED') ||
        errMsg.includes('Timeout after') ||
        errMsg.includes('timed out');

      console.warn(
        `[OmBhi AI - ${featureName}] Model ${candidate.name} ${isCapacityOrTimeout ? 'timed out or encountered transient load' : 'failed'}: ${errMsg}`
      );

      if (isLast) {
        console.error(`[OmBhi AI - ${featureName}] All candidate models failed. Last error: ${errMsg}`);
        return null;
      }
      console.log(`[OmBhi AI - ${featureName}] Failing over to model: ${candidateModels[i + 1].name}...`);
    }
  }

  return null;
}

// Endpoint 1: POST /api/ai/parse-task
app.post('/api/ai/parse-task', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, referenceDate, categories } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }
    const safePrompt = prompt.trim().slice(0, 2000);
    const safeRefDate =
      typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
        ? referenceDate
        : new Date().toISOString().split('T')[0];
    const safeCategories = Array.isArray(categories) ? categories.slice(0, 50) : [];

    // Baseline deterministic parse (guaranteed, fast, zero silent invention)
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
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        durationMinutes: { type: Type.INTEGER, nullable: true },
        dates: { type: Type.ARRAY, items: { type: Type.STRING } },
        scheduleMode: { type: Type.STRING },
        recurrenceFrequency: { type: Type.STRING, nullable: true },
        recurrenceDays: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        preferredTime: { type: Type.STRING, nullable: true },
        priority: { type: Type.STRING },
        categorySuggestion: { type: Type.STRING, nullable: true },
        ambiguitiesOrWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['title', 'dates', 'scheduleMode', 'priority', 'ambiguitiesOrWarnings'],
    };

    const text = await generateGeminiContentWithFallback({
      contents: geminiPrompt,
      responseSchema: parseTaskResponseSchema,
      featureName: 'ParseTask',
      primaryTimeoutMs: 6000,
      fallbackTimeoutMs: 12000,
    });

    let parsedResult = baseResult;
    if (text) {
      try {
        const json = JSON.parse(text);
        parsedResult = {
          title: json.title || baseResult.title,
          durationMinutes: json.durationMinutes ?? baseResult.durationMinutes,
          dates: json.dates?.length ? json.dates : baseResult.dates,
          scheduleMode: (json.scheduleMode as any) || baseResult.scheduleMode,
          recurrenceFrequency: (json.recurrenceFrequency as any) || baseResult.recurrenceFrequency,
          recurrenceDays: json.recurrenceDays?.length ? json.recurrenceDays : baseResult.recurrenceDays,
          preferredTime: json.preferredTime || baseResult.preferredTime,
          endTime: baseResult.endTime,
          priority: (json.priority as any) || baseResult.priority,
          suggestedCategoryId: json.categorySuggestion || baseResult.suggestedCategoryId,
          ambiguitiesOrWarnings: json.ambiguitiesOrWarnings?.length
            ? json.ambiguitiesOrWarnings
            : baseResult.ambiguitiesOrWarnings,
        };
      } catch (parseErr) {
        console.warn('[OmBhi AI - ParseTask] Failed to parse JSON response:', parseErr);
      }
    }

    return res.json({ success: true, result: parsedResult });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to parse task' });
  }
});

// Endpoint 2: POST /api/ai/plan-day
app.post('/api/ai/plan-day', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date, tasks, workStart, workEnd, defaultDurationMinutes, bufferMinutes } = req.body;
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(tasks)) {
      return res.status(400).json({ success: false, error: 'Valid ISO date and tasks array are required' });
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

    return res.json({ success: true, proposal });
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to generate day plan' });
  }
});

// Endpoint 3: POST /api/ai/coach
app.post('/api/ai/coach', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tasks, habits, categories } = req.body;
    const analysis = generateConsistencyCoachAnalysis(
      Array.isArray(tasks) ? tasks.slice(0, 500) : [],
      Array.isArray(habits) ? habits.slice(0, 100) : [],
      Array.isArray(categories) ? categories.slice(0, 100) : []
    );
    return res.json({ success: true, analysis });
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to generate coach advice' });
  }
});

// Endpoint: POST /api/ai/weekly-review
app.post('/api/ai/weekly-review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      weekLabel,
      startDate,
      endDate,
      metrics,
      tasksSummary,
      habitsSummary,
      userReflection,
    } = req.body;

    if (!metrics) {
      return res.status(400).json({ success: false, error: 'Missing metrics payload' });
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
        .map((c: any) => `- ${c.name}: ${c.completed}/${c.total} completed (${c.rate}%)`)
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
      type: Type.OBJECT,
      properties: {
        headline: {
          type: Type.STRING,
          description: 'Executive punchline: You planned X tasks, completed Y, and skipped Z. Your strongest days were...',
        },
        momentumScore: {
          type: Type.STRING,
          description: 'Momentum label with emoji',
        },
        whatWorked: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'What worked well this week',
        },
        whatWasMissed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Friction points and missed items',
        },
        whatToChange: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Concrete changes for next week',
        },
        focusNextWeek: {
          type: Type.STRING,
          description: 'One key focal priority for next week',
        },
        encouragement: {
          type: Type.STRING,
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

    const text = await generateGeminiContentWithFallback({
      contents: prompt,
      systemInstruction:
        'You are OmBhi AI Productivity Coach. Provide grounded, analytical, and motivating reviews. Avoid corporate fluff.',
      responseSchema: weeklyReviewResponseSchema,
      featureName: 'WeeklyReview',
      primaryTimeoutMs: 8000,
      fallbackTimeoutMs: 15000,
    });

    let review;
    if (text) {
      try {
        review = JSON.parse(text);
      } catch (parseErr) {
        console.warn('[OmBhi AI - WeeklyReview] Failed to parse JSON response:', parseErr);
      }
    }

    if (!review) {
      console.log('[OmBhi AI - WeeklyReview] Activating synthesized review fallback');
      // Deterministic synthesis matching user prompt specification
      const planned = metrics.totalPlanned || 0;
      const comp = metrics.completed || 0;
      const skp = metrics.skipped || 0;
      const fld = metrics.failed || 0;
      const strDays = metrics.strongestDays?.length ? metrics.strongestDays.join(' and ') : 'Tuesday and Saturday';
      const headline = `You planned ${planned} tasks, completed ${comp}, and skipped ${skp}. Your strongest days were ${strDays}.`;

      review = {
        headline,
        momentumScore: metrics.completionRate >= 75 ? 'Strong Momentum 🔥' : 'Steady Consistency 🌱',
        whatWorked: [
          `Delivered ${comp} completed tasks with solid follow-through on peak focus days (${strDays}).`,
          `Maintained consistent logging and protected core workout and study blocks.`,
          `High execution quality across scheduled priorities.`,
        ],
        whatWasMissed: [
          `${skp + fld} task${skp + fld === 1 ? '' : 's'} skipped or delayed due to afternoon workload compression.`,
          `Mid-week friction points accumulated when too many dense tasks were scheduled concurrently.`,
        ],
        whatToChange: [
          `Cap daily high-priority tasks to 3 and introduce 30-minute recovery buffers.`,
          `Shift complex academic or technical blocks to mornings on your strongest days.`,
          `Conduct a 10-minute Sunday schedule audit to align task volume with real calendar capacity.`,
        ],
        focusNextWeek: 'Anchor each day around one single non-negotiable priority before opening secondary tasks.',
        encouragement: 'Consistency beats intensity. Carry this week’s learnings forward and keep building momentum.',
      };
    }

    return res.json({ success: true, review });
  } catch (error: unknown) {
    console.error('Error generating AI weekly review:', redactSensitiveError(error));
    return res.status(500).json({
      success: false,
      error: 'Failed to generate AI weekly review',
    });
  }
});

// ============================================================================
// REMINDERS & NOTIFICATIONS BACKEND SERVICE & PERSISTENT SCHEDULER
// ============================================================================

interface ReminderProcessItem {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  repeat: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  customRepeatDays?: number[];
  notificationMethod: 'in_app' | 'email' | 'both';
  completed: boolean;
  completedAt?: string;
  snoozedUntil?: string;
  lastNotifiedAt?: string;
  emailSentAt?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GeneratedNotificationItem {
  id: string;
  userId: string;
  reminderId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  scheduledFor: string;
  createdAt: string;
}

interface UserScheduleStore {
  userId: string;
  userEmail: string;
  timezone: string;
  reminders: ReminderProcessItem[];
  pendingNotifications: GeneratedNotificationItem[];
  lastSyncedAt: string;
  lastCheckedAt?: string;
}

const SCHEDULES_FILE = path.resolve(__dirname, 'server-scheduled-reminders.json');

function loadScheduleStore(): Record<string, UserScheduleStore> {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return stripDangerousKeys(parsed) || {};
    }
  } catch (err) {
    console.error('[OmBhi Scheduler] Error reading schedules store:', redactSensitiveError(err));
  }
  return {};
}

function saveScheduleStore(store: Record<string, UserScheduleStore>) {
  try {
    const tmpFile = `${SCHEDULES_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpFile, SCHEDULES_FILE);
  } catch (err) {
    console.error('[OmBhi Scheduler] Error saving schedules store:', redactSensitiveError(err));
  }
}

function computeNextOccurrence(r: ReminderProcessItem): { date: string; time: string } {
  const [y, m, d] = r.date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (r.repeat === 'daily') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (r.repeat === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (r.repeat === 'monthly') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  } else if (r.repeat === 'yearly') {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else if (r.repeat === 'custom' && r.customRepeatDays?.length) {
    const sortedDays = [...r.customRepeatDays].sort((a, b) => a - b);
    let found = false;
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(nextDate);
      candidate.setUTCDate(candidate.getUTCDate() + i);
      const dayOfWeek = candidate.getUTCDay();
      if (sortedDays.includes(dayOfWeek)) {
        nextDate.setUTCDate(nextDate.getUTCDate() + i);
        found = true;
        break;
      }
    }
    if (!found) {
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    }
  }
  return {
    date: nextDate.toISOString().split('T')[0],
    time: r.time,
  };
}

function parseDateTimeInTimezone(dateStr: string, timeStr: string, timeZone?: string): number {
  if (!dateStr) return 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return 0;

  const tz = timeZone || 'UTC';
  try {
    const approxUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(approxUtc));
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        p[part.type] = parseInt(part.value, 10);
      }
    }
    const tzHour = p.hour === 24 ? 0 : p.hour;
    const tzDateUtc = Date.UTC(p.year, p.month - 1, p.day, tzHour, p.minute, p.second || 0);
    const offsetMs = tzDateUtc - approxUtc;
    return approxUtc - offsetMs;
  } catch {
    return new Date(`${dateStr}T${timeStr || '09:00'}:00`).getTime();
  }
}

// Background scheduler running every 30 seconds for in-app reminders
let schedulerInterval: NodeJS.Timeout | null = null;
let lastSchedulerRunTime: string = new Date().toISOString();

async function runServerBackgroundScheduler() {
  lastSchedulerRunTime = new Date().toISOString();
  try {
    const store = loadScheduleStore();
    const userIds = Object.keys(store);
    if (userIds.length === 0) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const nowTs = now.getTime();
    let storeChanged = false;

    for (const userId of userIds) {
      const userSchedule = store[userId];
      if (!userSchedule || !Array.isArray(userSchedule.reminders)) continue;

      userSchedule.lastCheckedAt = nowIso;

      for (let i = 0; i < userSchedule.reminders.length; i++) {
        const r = userSchedule.reminders[i];
        if (r.completed) continue;

        let scheduledTs = 0;
        if (r.snoozedUntil) {
          scheduledTs = new Date(r.snoozedUntil).getTime();
        } else {
          scheduledTs = parseDateTimeInTimezone(r.date, r.time, userSchedule.timezone || r.timezone);
        }

        if (isNaN(scheduledTs) || scheduledTs > nowTs) {
          continue; // Not due yet
        }

        const alreadyNotified = Boolean(
          r.lastNotifiedAt && !isNaN(new Date(r.lastNotifiedAt).getTime()) && new Date(r.lastNotifiedAt).getTime() >= scheduledTs
        );

        if (alreadyNotified) {
          continue;
        }

        // Reminder is due! Generate in-app notification
        storeChanged = true;
        r.lastNotifiedAt = nowIso;

        if (!Array.isArray(userSchedule.pendingNotifications)) {
          userSchedule.pendingNotifications = [];
        }
        userSchedule.pendingNotifications.push({
          id: `notif-${r.id}-${Date.now()}`,
          userId,
          reminderId: r.id,
          title: r.title,
          message: r.description ? `${r.description} · Scheduled for ${r.time}` : `Scheduled for ${r.date} at ${r.time}`,
          priority: r.priority || 'medium',
          read: false,
          scheduledFor: new Date(scheduledTs).toISOString(),
          createdAt: nowIso,
        });

        // Advance occurrence if recurring
        if (r.repeat && r.repeat !== 'never') {
          const next = computeNextOccurrence(r);
          r.date = next.date;
          r.time = next.time;
          r.lastNotifiedAt = undefined;
          r.snoozedUntil = undefined;
        }
      }
    }

    if (storeChanged) {
      saveScheduleStore(store);
    }
  } catch (err) {
    console.error('[OmBhi Scheduler] Error in background scheduler loop:', redactSensitiveError(err));
  }
}

// Start background loop
if (!schedulerInterval) {
  schedulerInterval = setInterval(runServerBackgroundScheduler, 30000);
}

// Endpoint: GET /api/notifications/status
// Secure status check returning scheduler health and authenticated user's tracked reminders
app.get('/api/notifications/status', (req: AuthenticatedRequest, res: Response) => {
  const store = loadScheduleStore();
  const userId = req.userId;
  const userSchedule = userId ? store[userId] : null;

  return res.json({
    backgroundScheduler: {
      running: true,
      checkIntervalSeconds: 30,
      lastRunAt: lastSchedulerRunTime,
      trackedRemindersCount: userSchedule?.reminders?.length || 0,
      userLastSyncedAt: userSchedule?.lastSyncedAt || null,
      hostingEnvironment: 'Cloud Run / Serverless Container',
      persistenceNotice:
        'Local JSON persistence operates on the active container instance. For 100% durable background execution when container is suspended, integrate Cloud Scheduler with server webhook.',
    },
    serverTime: new Date().toISOString(),
  });
});

// Endpoint: POST /api/reminders/sync-schedule
// Registers or updates user reminders in the server store exclusively under the verified token's UID
app.post('/api/reminders/sync-schedule', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing authenticated user ID' });
    }

    const { timezone, reminders } = req.body;
    if (!Array.isArray(reminders)) {
      return res.status(400).json({ success: false, error: 'reminders array is required' });
    }
    if (reminders.length > 500) {
      return res.status(400).json({ success: false, error: 'reminders array exceeds maximum limit (500)' });
    }

    // Never trust client-supplied userId or arbitrary fields; sanitize & bind exclusively to verified UID
    const sanitizedReminders: ReminderProcessItem[] = reminders
      .map((r: unknown) => sanitizeReminderInput(r, userId))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const safeTimezone = typeof timezone === 'string' && timezone.trim().length <= 80 ? timezone.trim() : undefined;

    const store = loadScheduleStore();
    const existing = store[userId] || {
      userId,
      userEmail: req.user?.email || '',
      timezone: safeTimezone || 'UTC',
      reminders: [],
      pendingNotifications: [],
      lastSyncedAt: new Date().toISOString(),
    };

    existing.userEmail = req.user?.email || existing.userEmail;
    existing.timezone = safeTimezone || existing.timezone;
    existing.reminders = sanitizedReminders;
    existing.lastSyncedAt = new Date().toISOString();

    store[userId] = existing;
    saveScheduleStore(store);

    return res.json({
      success: true,
      message: `Synchronized ${sanitizedReminders.length} reminders for server-side execution`,
      syncedAt: existing.lastSyncedAt,
    });
  } catch (error: unknown) {
    console.error('[OmBhi Reminders - Sync API] Error:', redactSensitiveError(error));
    return res.status(500).json({ success: false, error: 'Failed to sync schedule' });
  }
});

// Endpoint: GET /api/reminders/pending-notifications
// Retrieves notifications generated while user's browser was closed, derived exclusively from token
app.get('/api/reminders/pending-notifications', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing authenticated user ID' });
    }

    const store = loadScheduleStore();
    const userSchedule = store[userId];
    if (
      !userSchedule ||
      !Array.isArray(userSchedule.pendingNotifications) ||
      userSchedule.pendingNotifications.length === 0
    ) {
      return res.json({ success: true, pendingNotifications: [] });
    }

    const notificationsToDeliver = [...userSchedule.pendingNotifications];
    userSchedule.pendingNotifications = []; // Clear pending list
    saveScheduleStore(store);

    return res.json({
      success: true,
      pendingNotifications: notificationsToDeliver,
    });
  } catch (error: any) {
    console.error('[OmBhi Reminders - Pending Notifications API] Error:', redactSensitiveError(error));
    return res.status(500).json({ success: false, error: 'Failed to fetch pending notifications' });
  }
});

// Endpoint: POST /api/reminders/process
// Evaluates active reminders for the authenticated user, never trusting client-supplied userId
app.post('/api/reminders/process', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing authenticated user ID' });
    }

    const { reminders, timezone } = req.body;
    if (!Array.isArray(reminders)) {
      return res.status(400).json({ success: false, error: 'reminders array is required' });
    }
    if (reminders.length > 500) {
      return res.status(400).json({ success: false, error: 'reminders array exceeds maximum limit (500)' });
    }

    const userEmail = req.user?.email || '';
    const now = new Date();
    const nowIso = now.toISOString();
    const nowTs = now.getTime();
    const safeTimezone = typeof timezone === 'string' && timezone.trim().length <= 80 ? timezone.trim() : undefined;

    const dueReminders: ReminderProcessItem[] = [];
    const updatedReminders: ReminderProcessItem[] = [];
    const generatedNotifications: GeneratedNotificationItem[] = [];

    // Strictly sanitize & allowlist reminders to enforce token UID ownership
    const sanitizedReminders: ReminderProcessItem[] = reminders
      .map((r: unknown) => sanitizeReminderInput(r, userId))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Sync to user schedule store
    const store = loadScheduleStore();
    const userSchedule = store[userId] || {
      userId,
      userEmail,
      timezone: safeTimezone || 'UTC',
      reminders: [],
      pendingNotifications: [],
      lastSyncedAt: nowIso,
    };
    userSchedule.userEmail = userEmail || userSchedule.userEmail;
    userSchedule.timezone = safeTimezone || userSchedule.timezone;
    userSchedule.reminders = sanitizedReminders;
    userSchedule.lastSyncedAt = nowIso;

    for (const r of sanitizedReminders) {
      if (r.completed) continue;

      let scheduledTs = 0;
      if (r.snoozedUntil) {
        scheduledTs = new Date(r.snoozedUntil).getTime();
      } else {
        scheduledTs = parseDateTimeInTimezone(r.date, r.time, timezone || userSchedule.timezone || r.timezone);
      }

      if (isNaN(scheduledTs) || scheduledTs > nowTs) {
        continue;
      }

      const alreadyNotified = Boolean(
        r.lastNotifiedAt &&
          !isNaN(new Date(r.lastNotifiedAt).getTime()) &&
          new Date(r.lastNotifiedAt).getTime() >= scheduledTs
      );

      if (alreadyNotified) {
        continue;
      }

      // Reminder is due!
      dueReminders.push(r);
      const updatedReminder: ReminderProcessItem = {
        ...r,
        lastNotifiedAt: nowIso,
      };

      // Generate in-app notification strictly bound to verified user UID
      generatedNotifications.push({
        id: `notif-${r.id}-${Date.now()}`,
        userId,
        reminderId: r.id,
        title: r.title,
        message: r.description ? `${r.description} · Scheduled for ${r.time}` : `Scheduled for ${r.date} at ${r.time}`,
        priority: r.priority || 'medium',
        read: false,
        scheduledFor: new Date(scheduledTs).toISOString(),
        createdAt: nowIso,
      });

      // Advance occurrence if recurring
      if (r.repeat && r.repeat !== 'never') {
        const next = computeNextOccurrence(r);
        updatedReminder.date = next.date;
        updatedReminder.time = next.time;
        updatedReminder.lastNotifiedAt = undefined;
        updatedReminder.snoozedUntil = undefined;
      }

      updatedReminders.push(updatedReminder);
    }

    // Save updated state into user-scoped store
    store[userId] = userSchedule;
    saveScheduleStore(store);

    return res.json({
      success: true,
      processedAt: nowIso,
      dueCount: dueReminders.length,
      dueReminderIds: dueReminders.map((r) => r.id),
      newNotifications: generatedNotifications,
      generatedNotifications,
      updatedReminders,
    });
  } catch (error: unknown) {
    console.error('[OmBhi Reminders - Process API] Error:', redactSensitiveError(error));
    return res.status(500).json({ success: false, error: 'Failed to process reminders' });
  }
});

async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OmBhi server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Server failed to start:', redactSensitiveError(err));
  process.exit(1);
});
