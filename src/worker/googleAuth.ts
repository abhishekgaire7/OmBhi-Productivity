import { ServiceAccountCredentials } from './types';

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
].join(' ');

interface CachedSigningKey {
  rawJson: string;
  creds: ServiceAccountCredentials;
  cryptoKey: CryptoKey;
}

interface CachedAccessToken {
  clientEmail: string;
  accessToken: string;
  expiresAtMs: number;
}

let cachedSigningKey: CachedSigningKey | null = null;
let cachedToken: CachedAccessToken | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, '')
    .replace(/-----END [A-Z0-9 ]+-----/g, '')
    .replace(/\s+/g, '');

  if (!body) {
    throw new Error('Invalid service account private_key PEM format.');
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function parseServiceAccountJson(rawJson?: string): ServiceAccountCredentials {
  if (!rawJson || !rawJson.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  }
  const trimmed = rawJson.trim();
  if (!trimmed.startsWith('{')) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be an inline JSON string in Cloudflare Workers.');
  }

  const parsed = JSON.parse(trimmed) as Partial<ServiceAccountCredentials>;
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields (project_id, client_email, private_key).');
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
    private_key_id: parsed.private_key_id,
    token_uri: parsed.token_uri || DEFAULT_TOKEN_URI,
  };
}

async function getImportedSigningKey(rawJson: string): Promise<CachedSigningKey> {
  if (cachedSigningKey && cachedSigningKey.rawJson === rawJson) {
    return cachedSigningKey;
  }

  const creds = parseServiceAccountJson(rawJson);
  const pkcs8Buffer = pemToArrayBuffer(creds.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  cachedSigningKey = { rawJson, creds, cryptoKey };
  return cachedSigningKey;
}

/**
 * Generates and caches a short-lived Google OAuth2 access token using Web Crypto RS256 JWT assertion.
 * Compatible with Cloudflare Workers (zero Node.js crypto/fs).
 */
export async function getGoogleAccessToken(
  rawServiceAccountJson?: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!rawServiceAccountJson || !rawServiceAccountJson.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing.');
  }

  const { creds, cryptoKey } = await getImportedSigningKey(rawServiceAccountJson);
  const nowMs = Date.now();

  if (
    cachedToken &&
    cachedToken.clientEmail === creds.client_email &&
    cachedToken.expiresAtMs - 300_000 > nowMs
  ) {
    return cachedToken.accessToken;
  }

  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const tokenUri = creds.token_uri || DEFAULT_TOKEN_URI;

      const header = base64UrlEncodeString(
        JSON.stringify({
          alg: 'RS256',
          typ: 'JWT',
          ...(creds.private_key_id ? { kid: creds.private_key_id } : {}),
        })
      );

      const claimSet = base64UrlEncodeString(
        JSON.stringify({
          iss: creds.client_email,
          sub: creds.client_email,
          aud: tokenUri,
          scope: GOOGLE_SCOPES,
          iat: nowSec,
          exp: nowSec + 3600,
        })
      );

      const signingInput = `${header}.${claimSet}`;
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(signingInput)
      );

      const jwt = `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;

      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      });

      const response = await fetchImpl(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Google OAuth2 token exchange failed (${response.status}): ${errText.slice(0, 200)}`);
      }

      const tokenJson = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!tokenJson.access_token) {
        throw new Error('Google OAuth2 response omitted access_token.');
      }

      const expiresInMs = Math.max(60, Number(tokenJson.expires_in || 3600)) * 1000;
      cachedToken = {
        clientEmail: creds.client_email,
        accessToken: tokenJson.access_token,
        expiresAtMs: Date.now() + expiresInMs,
      };

      return cachedToken.accessToken;
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}

export function resetGoogleAuthCachesForTests(): void {
  cachedSigningKey = null;
  cachedToken = null;
  inFlightTokenPromise = null;
}
