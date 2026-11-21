export interface WorkerEnv {
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  ALLOWED_ORIGINS?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  REQUIRE_MFA?: string;
}

export interface DecodedFirebaseToken {
  uid: string;
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
    sign_in_second_factor?: string;
    identities?: Record<string, unknown>;
  };
}

export interface ServiceAccountCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
}
