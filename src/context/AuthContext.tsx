import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  browserSessionPersistence,
  getMultiFactorResolver,
  multiFactor,
  MultiFactorError,
  MultiFactorInfo,
  MultiFactorResolver,
  onAuthStateChanged,
  reauthenticateWithPopup,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  TotpMultiFactorGenerator,
  TotpSecret,
  User,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, authReady, db, googleProvider, testConnection } from '../utils/firebase';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface EnrolledMfaFactor {
  uid: string;
  displayName: string;
  factorId: string;
  enrollmentTime?: string;
}

export interface TotpEnrollmentChallenge {
  secret: TotpSecret;
  secretKey: string;
  qrCodeUrl: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  authError: string | null;
  mfaPending: boolean;
  mfaHint: string | null;
  enrolledMfaFactors: EnrolledMfaFactor[];
  signInWithGoogle: () => Promise<void>;
  verifyMfaSignIn: (verificationCode: string) => Promise<void>;
  cancelMfaSignIn: () => void;
  startTotpMfaEnrollment: () => Promise<TotpEnrollmentChallenge>;
  completeTotpMfaEnrollment: (
    secret: TotpSecret,
    verificationCode: string,
    displayName?: string
  ) => Promise<void>;
  unenrollMfaFactor: (factorUid: string) => Promise<void>;
  reauthenticateWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const LEGACY_TEST_USER_KEY = 'dayforge_test_user_session_v1';

function mapMfaFactors(firebaseUser: User | null): EnrolledMfaFactor[] {
  if (!firebaseUser) return [];
  try {
    return multiFactor(firebaseUser).enrolledFactors.map((factor: MultiFactorInfo) => ({
      uid: factor.uid,
      displayName: factor.displayName || 'Authenticator App',
      factorId: factor.factorId,
      enrollmentTime: factor.enrollmentTime,
    }));
  } catch {
    return [];
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: null,
  mfaPending: false,
  mfaHint: null,
  enrolledMfaFactors: [],
  signInWithGoogle: async () => {},
  verifyMfaSignIn: async () => {},
  cancelMfaSignIn: () => {},
  startTotpMfaEnrollment: async () => {
    throw new Error('AuthProvider not mounted');
  },
  completeTotpMfaEnrollment: async () => {},
  unenrollMfaFactor: async () => {},
  reauthenticateWithGoogle: async () => {},
  signOut: async () => {},
  clearError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [enrolledMfaFactors, setEnrolledMfaFactors] = useState<EnrolledMfaFactor[]>([]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    // Ensure legacy localStorage test sessions are permanently purged
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(LEGACY_TEST_USER_KEY);
      }
    } catch {
      // Ignore storage access errors
    }

    (async () => {
      await authReady;
      if (!isMounted) return;

      testConnection();

      unsubscribe = onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          if (!isMounted) return;
          if (firebaseUser) {
            const appUser: AppUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
            };

            try {
              await firebaseUser.getIdToken();
            } catch {
              // Proceed and let Firestore handle any token errors
            }

            // Sync / initialize user profile doc before opening workspace queries
            try {
              const userRef = doc(db, 'users', firebaseUser.uid);
              await setDoc(
                userRef,
                {
                  id: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || '',
                  photoURL: firebaseUser.photoURL || '',
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            } catch (err: any) {
              console.warn('Failed to sync user profile document:', err?.code || 'SYNC_WARN');
            }

            if (!isMounted) return;
            setUser(appUser);
            setEnrolledMfaFactors(mapMfaFactors(firebaseUser));
            setMfaResolver(null);
          } else {
            setUser(null);
            setEnrolledMfaFactors([]);
          }
          if (isMounted) {
            setLoading(false);
          }
        },
        (error) => {
          console.error('Auth state error:', (error as any)?.code || 'AUTH_STATE_ERROR');
          if (isMounted) {
            setAuthError(error.message);
            setLoading(false);
          }
        }
      );
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setLoading(true);
    try {
      if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
        await setPersistence(auth, browserSessionPersistence);
      }
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, err as MultiFactorError);
          setMfaResolver(resolver);
          setAuthError(null);
        } catch {
          setAuthError('Multi-factor verification is required. Please try signing in again.');
        }
        return;
      }

      console.error('Google Sign-In Error:', err?.code || 'SIGNIN_ERROR');
      let friendlyMsg = 'Sign in failed. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        friendlyMsg = 'Sign-in popup was closed before completion.';
      } else if (err.code === 'auth/popup-blocked') {
        friendlyMsg = 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
      } else if (err.code === 'auth/unauthorized-domain') {
        friendlyMsg = 'This app domain is not yet authorized in Firebase Console > Authentication > Settings > Authorized domains.';
      } else if (err.code === 'auth/operation-not-allowed') {
        friendlyMsg = 'Google sign-in provider is not enabled in Firebase Console. Please enable it in Firebase Console > Authentication > Sign-in method.';
      } else if (err.message) {
        friendlyMsg = err.message;
      }
      setAuthError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const verifyMfaSignIn = async (verificationCode: string) => {
    if (!mfaResolver) {
      setAuthError('No active multi-factor authentication challenge.');
      return;
    }

    const cleanCode = verificationCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      setAuthError('Please enter a valid 6-digit verification code from your authenticator app.');
      return;
    }

    setAuthError(null);
    setLoading(true);
    try {
      const totpHint =
        mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ||
        mfaResolver.hints[0];

      if (!totpHint) {
        throw new Error('No supported authenticator factor is enrolled on this account.');
      }

      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, cleanCode);
      await mfaResolver.resolveSignIn(assertion);
      setMfaResolver(null);
    } catch (err: any) {
      console.error('MFA Verification Error:', err?.code || 'MFA_VERIFY_ERROR');
      if (err?.code === 'auth/invalid-verification-code') {
        setAuthError('Invalid verification code. Please check your authenticator app and try again.');
      } else if (err?.code === 'auth/code-expired') {
        setAuthError('Verification code expired. Please sign in again.');
        setMfaResolver(null);
      } else {
        setAuthError(err?.message || 'Multi-factor verification failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelMfaSignIn = () => {
    setMfaResolver(null);
    setAuthError(null);
  };

  const reauthenticateWithGoogle = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be signed in to re-authenticate.');
    }
    await reauthenticateWithPopup(currentUser, googleProvider);
  }, []);

  const startTotpMfaEnrollment = useCallback(async (): Promise<TotpEnrollmentChallenge> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in with your Google account before enabling 2FA.');
    }
    const session = await multiFactor(currentUser).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const qrCodeUrl = secret.generateQrCodeUrl(currentUser.email || currentUser.uid, 'OmBhi');
    return {
      secret,
      secretKey: secret.secretKey,
      qrCodeUrl,
    };
  }, []);

  const completeTotpMfaEnrollment = useCallback(
    async (secret: TotpSecret, verificationCode: string, displayName = 'Authenticator App') => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Sign in with your Google account before completing 2FA setup.');
      }
      const cleanCode = verificationCode.replace(/\s+/g, '');
      if (!/^\d{6}$/.test(cleanCode)) {
        throw new Error('Enter the 6-digit code generated by your authenticator app.');
      }
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, cleanCode);
      await multiFactor(currentUser).enroll(assertion, displayName.trim().slice(0, 60) || 'Authenticator App');
      await currentUser.reload();
      setEnrolledMfaFactors(mapMfaFactors(auth.currentUser));
    },
    []
  );

  const unenrollMfaFactor = useCallback(async (factorUid: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required.');
    }
    await multiFactor(currentUser).unenroll(factorUid);
    await currentUser.reload();
    setEnrolledMfaFactors(mapMfaFactors(auth.currentUser));
  }, []);

  const signOut = async () => {
    setAuthError(null);
    setMfaResolver(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setEnrolledMfaFactors([]);
    } catch (err: any) {
      console.error('Sign-Out Error:', err?.code || 'SIGNOUT_ERROR');
      setAuthError(err.message || 'Failed to sign out');
    }
  };

  const clearError = () => setAuthError(null);

  const mfaHint = mfaResolver?.hints?.[0]?.displayName || mfaResolver?.hints?.[0]?.factorId || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        mfaPending: mfaResolver !== null,
        mfaHint,
        enrolledMfaFactors,
        signInWithGoogle,
        verifyMfaSignIn,
        cancelMfaSignIn,
        startTotpMfaEnrollment,
        completeTotpMfaEnrollment,
        unenrollMfaFactor,
        reauthenticateWithGoogle,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
