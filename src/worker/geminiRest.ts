import { redactSensitiveError } from '../shared/security';

export const GeminiSchemaType = {
  OBJECT: 'OBJECT',
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
} as const;

export interface GeminiRestCallParams {
  apiKey?: string;
  contents: string;
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  featureName: string;
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GeminiCandidateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Native fetch Gemini REST API client for Cloudflare Workers.
 * 1. Attempts gemini-3.8-flash first with configurable AbortController timeout.
 * 2. Fails over to gemini-3.1-flash-lite on timeout or transient capacity/rate-limit errors (429/503/504).
 * 3. Returns raw JSON string text or null if all attempts fail (allowing deterministic fallback).
 */
export async function generateGeminiRestWithFallback(params: GeminiRestCallParams): Promise<string | null> {
  const {
    apiKey,
    contents,
    systemInstruction,
    responseSchema,
    featureName,
    primaryTimeoutMs = 8000,
    fallbackTimeoutMs = 15000,
    fetchImpl = fetch,
  } = params;

  if (!apiKey || !apiKey.trim()) {
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
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), candidate.timeout);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        candidate.name
      )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

      const body: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [{ text: contents }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
        },
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timerId);

      if (!response.ok) {
        const errPayload = await response.text().catch(() => '');
        const isTransient = response.status === 429 || response.status === 503 || response.status === 504;
        console.warn(
          `[OmBhi AI - ${featureName}] Model ${candidate.name} HTTP ${response.status}${
            isTransient ? ' (transient capacity)' : ''
          }: ${redactSensitiveError(errPayload.slice(0, 200))}`
        );
        if (isLast) return null;
        continue;
      }

      const json = (await response.json()) as GeminiCandidateResponse;
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      if (text) {
        return text;
      }

      if (isLast) return null;
    } catch (err: unknown) {
      clearTimeout(timerId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errMsg = isAbort ? `Timeout after ${candidate.timeout}ms` : redactSensitiveError(err);
      console.warn(`[OmBhi AI - ${featureName}] Model ${candidate.name} failed: ${errMsg}`);
      if (isLast) {
        return null;
      }
    }
  }

  return null;
}
