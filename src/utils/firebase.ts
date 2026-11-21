import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth with session-only persistence (avoids storing auth tokens in localStorage)
export const auth = getAuth(app);

export const authReady: Promise<void> = (async () => {
  try {
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      await setPersistence(auth, browserSessionPersistence);
    }
  } catch {
    // Fallback gracefully if storage is restricted
  }
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
  } catch {
    // Ignore if authStateReady is unavailable
  }
})();

// Google Sign-In Provider configured for prompt
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Cloud Firestore (using configured database or (default) for ombhi-a81ae)
export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

// Operation types for detailed security/permission error handling
export enum OperationType {
  CREATE = 'create',
  READ = 'read',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
}

export interface FirestoreErrorInfo {
  error: string;
  message: string;
  authenticated: boolean;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo: { providerId?: string | null }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    message: errMsg,
    authenticated: Boolean(auth.currentUser),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
        })) || [],
    },
  };
  console.error('Firestore Security Error:', operationType, path, errInfo.error);
  throw new Error(JSON.stringify(errInfo));
}

// Connection test utility
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Check configuration.');
    }
  }
}
