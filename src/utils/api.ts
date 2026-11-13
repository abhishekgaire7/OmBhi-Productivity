import { auth } from './firebase';

/**
 * Reusable authenticated fetch utility.
 * Automatically obtains a fresh Firebase ID token via auth.currentUser.getIdToken()
 * and attaches it as Authorization: Bearer <token>.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Authentication Required: Please sign in to access this service.',
        code: 'AUTH_REQUIRED',
      }),
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const token = await currentUser.getIdToken();
    const headers = new Headers(init?.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    return await fetch(input, {
      ...init,
      headers,
    });
  } catch (err: any) {
    console.error('[authenticatedFetch] Failed to retrieve Firebase ID token:', err?.code || 'TOKEN_ERROR');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to authenticate request with Firebase Auth.',
        code: 'TOKEN_ERROR',
      }),
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
