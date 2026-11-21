import { SAFE_ID_REGEX } from '../shared/security';
import { getGoogleAccessToken } from './googleAuth';
import { WorkerEnv } from './types';

const DEFAULT_PROJECT_ID = 'ombhi-a81ae';
const DEFAULT_DATABASE_ID = '(default)';

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export function assertSafeId(id: string, label = 'ID'): string {
  if (!id || !SAFE_ID_REGEX.test(id)) {
    throw new Error(`Invalid ${label} format.`);
  }
  return id;
}

export function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return { nullValue: null };
    }
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => toFirestoreValue(v)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return Array.isArray(val.arrayValue?.values)
      ? val.arrayValue.values.map((v) => fromFirestoreValue(v))
      : [];
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

export function fromFirestoreFields<T = Record<string, unknown>>(
  fields?: Record<string, FirestoreValue>
): T {
  const out: Record<string, unknown> = {};
  if (!fields) return out as T;
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out as T;
}

export function extractDocIdFromName(name?: string): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] || '';
}

export function extractUserIdFromReminderDocName(name?: string): string | null {
  if (!name) return null;
  const match = name.match(/\/documents\/users\/([^/]+)\/reminders\/[^/]+$/);
  return match && SAFE_ID_REGEX.test(match[1]) ? match[1] : null;
}

export interface FirestoreRestWrite {
  update?: FirestoreDocument;
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  currentDocument?: { exists?: boolean; updateTime?: string };
}

export class FirestoreRestClient {
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly serviceAccountJson: string;
  private readonly fetchImpl: typeof fetch;

  constructor(env: WorkerEnv, fetchImpl: typeof fetch = fetch) {
    this.projectId = (env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID).trim();
    this.databaseId = (env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID).trim();
    this.serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    this.fetchImpl = fetchImpl;
  }

  get baseDocumentsPath(): string {
    return `projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }

  private get baseRestUrl(): string {
    return `https://firestore.googleapis.com/v1/${this.baseDocumentsPath}`;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await getGoogleAccessToken(this.serviceAccountJson, this.fetchImpl);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  docResourceName(relativeDocPath: string): string {
    const clean = relativeDocPath.replace(/^\/+/, '');
    return `${this.baseDocumentsPath}/${clean}`;
  }

  userDocPath(userId: string): string {
    assertSafeId(userId, 'userId');
    return `users/${userId}`;
  }

  userSubcollectionDocPath(userId: string, subcollection: string, docId: string): string {
    assertSafeId(userId, 'userId');
    assertSafeId(docId, 'docId');
    return `users/${userId}/${subcollection}/${docId}`;
  }

  async getDocument<T = Record<string, unknown>>(
    relativeDocPath: string
  ): Promise<{ exists: boolean; id: string; data: T | null; updateTime?: string }> {
    const headers = await this.authHeaders();
    const clean = relativeDocPath.replace(/^\/+/, '');
    const res = await this.fetchImpl(`${this.baseRestUrl}/${clean}`, {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      return { exists: false, id: extractDocIdFromName(clean), data: null };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firestore GET failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const doc = (await res.json()) as FirestoreDocument;
    return {
      exists: true,
      id: extractDocIdFromName(doc.name) || extractDocIdFromName(clean),
      data: fromFirestoreFields<T>(doc.fields),
      updateTime: doc.updateTime,
    };
  }

  async patchDocument(
    relativeDocPath: string,
    data: Record<string, unknown>,
    updateMaskFields?: string[]
  ): Promise<FirestoreDocument> {
    const headers = await this.authHeaders();
    const clean = relativeDocPath.replace(/^\/+/, '');
    const url = new URL(`${this.baseRestUrl}/${clean}`);
    if (updateMaskFields && updateMaskFields.length > 0) {
      for (const field of updateMaskFields) {
        url.searchParams.append('updateMask.fieldPaths', field);
      }
    }

    const res = await this.fetchImpl(url.toString(), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        fields: toFirestoreFields(data),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firestore PATCH failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    return (await res.json()) as FirestoreDocument;
  }

  async listUserDocuments<T = Record<string, unknown>>(
    userId: string,
    subcollection: string,
    pageSize = 500
  ): Promise<Array<{ id: string; data: T; updateTime?: string }>> {
    assertSafeId(userId, 'userId');
    const headers = await this.authHeaders();
    const url = `${this.baseRestUrl}/users/${encodeURIComponent(userId)}/${encodeURIComponent(
      subcollection
    )}?pageSize=${Math.min(500, Math.max(1, pageSize))}`;

    const res = await this.fetchImpl(url, { method: 'GET', headers });
    if (res.status === 404) return [];
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firestore LIST failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as { documents?: FirestoreDocument[] };
    return (json.documents || []).map((doc) => ({
      id: extractDocIdFromName(doc.name),
      data: fromFirestoreFields<T>(doc.fields),
      updateTime: doc.updateTime,
    }));
  }

  async runUserQuery<T = Record<string, unknown>>(
    userId: string,
    structuredQuery: Record<string, unknown>
  ): Promise<Array<{ id: string; data: T; updateTime?: string }>> {
    assertSafeId(userId, 'userId');
    const headers = await this.authHeaders();
    const url = `${this.baseRestUrl}/users/${encodeURIComponent(userId)}:runQuery`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ structuredQuery }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firestore runQuery failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
    const results: Array<{ id: string; data: T; updateTime?: string }> = [];
    for (const row of rows) {
      if (row.document) {
        results.push({
          id: extractDocIdFromName(row.document.name),
          data: fromFirestoreFields<T>(row.document.fields),
          updateTime: row.document.updateTime,
        });
      }
    }
    return results;
  }

  async runCollectionGroupQuery<T = Record<string, unknown>>(
    structuredQuery: Record<string, unknown>
  ): Promise<Array<{ id: string; userId: string | null; name: string; data: T; updateTime?: string }>> {
    const headers = await this.authHeaders();
    const url = `${this.baseRestUrl}:runQuery`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ structuredQuery }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firestore collectionGroup runQuery failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
    const results: Array<{ id: string; userId: string | null; name: string; data: T; updateTime?: string }> = [];
    for (const row of rows) {
      if (row.document && row.document.name) {
        results.push({
          id: extractDocIdFromName(row.document.name),
          userId: extractUserIdFromReminderDocName(row.document.name),
          name: row.document.name,
          data: fromFirestoreFields<T>(row.document.fields),
          updateTime: row.document.updateTime,
        });
      }
    }
    return results;
  }

  /**
   * Commits atomic Firestore writes with optional preconditions (e.g. exists: false or updateTime).
   * Returns { committed: true } or { committed: false, conflict: true } when precondition fails (HTTP 409 / 412 / ALREADY_EXISTS).
   */
  async commitWrites(
    writes: FirestoreRestWrite[]
  ): Promise<{ committed: boolean; conflict?: boolean }> {
    if (writes.length === 0) return { committed: true };
    const headers = await this.authHeaders();
    const url = `https://firestore.googleapis.com/v1/${this.baseDocumentsPath}:commit`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ writes }),
    });

    if (res.status === 409 || res.status === 412) {
      return { committed: false, conflict: true };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (
        res.status === 400 &&
        (errText.includes('ALREADY_EXISTS') || errText.includes('FAILED_PRECONDITION'))
      ) {
        return { committed: false, conflict: true };
      }
      throw new Error(`Firestore commit failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    return { committed: true };
  }
}
