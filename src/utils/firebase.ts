import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth with session-only persistence (avoids storing auth tokens in localStorage)
export const auth = getAuth(app);
if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
  setPersistence(auth, browserSessionPersistence).catch(() => {
    // Fallback gracefully if storage is restricted
  });
}

// Google Sign-In Provider configured for prompt
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Cloud Firestore (using default database for ombhi-a81ae)
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string): never {
  const errInfo = {
    message: error instanceof Error ? error.message : String(error),
    authenticated: Boolean(auth.currentUser),
    operationType,
    path,
  };
  console.error('Firestore Security Error:', operationType, path, errInfo.message);
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
