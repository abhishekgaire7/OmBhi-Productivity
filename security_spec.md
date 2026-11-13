# Security Specification: OmBhi Scheduler

## 1. Authentication
- Provider: Google Sign-In via Firebase Authentication (`GoogleAuthProvider`).
- Auth state: Monitored via `onAuthStateChanged`.
- Unauthenticated access: Denied from reading or writing any user documents or accessing protected scheduler views.

## 2. Invariants & Access Control
- Zero-trust default: All collections closed by default (`allow read, write: if false;`).
- User Isolation: All tasks, recurring schedules, habits, and custom categories reside under `/users/{userId}/...`.
- Ownership check: A user can read, create, update, or delete data ONLY if `request.auth.uid == userId`.
- ID validation: Document IDs must match regex `^[a-zA-Z0-9_\-]+$`.
- Diagnostic path: `/test/{docId}` permits read to verify database connectivity.

## 3. Attack Vector Analysis (Dirty Dozen)
1. Insecure Default: Closed via fallback `allow read, write: if false;`.
2. Spoofed Auth UID: Firestore guarantees `request.auth.uid` is cryptographically validated from JWT.
3. Cross-User Data Access: Rules enforce `request.auth.uid == userId` at each subcollection level.
4. Dirty / Missing Fields: Validation functions assert string lengths, types, and required identifier integrity.
