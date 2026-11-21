import type { Fetcher, PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';

interface PagesEnv {
  API_WORKER?: Fetcher;
}

/**
 * Same-origin proxy from Cloudflare Pages (/api/*) to the OmBhi API Worker via Service Binding.
 * Preserves existing frontend relative fetch('/api/...') calls with zero CORS friction.
 * Attach Service Binding `API_WORKER -> ombhi-api` in Cloudflare Pages Settings -> Functions.
 */
export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  if (!context.env.API_WORKER) {
    const res = new Response(
      JSON.stringify({
        success: false,
        error: 'Backend API service binding (API_WORKER) is not configured on Cloudflare Pages.',
        code: 'API_SERVICE_BINDING_MISSING',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
    return res as unknown as CfResponse;
  }

  return context.env.API_WORKER.fetch(context.request);
};
