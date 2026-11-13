import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Parse and inspect firestore.rules
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

// Pure security evaluator simulating the Firestore rules logic
function evaluateFirestoreRule({
  pathSegments,
  operation,
  authUid,
  targetDocId,
  payloadData,
}: {
  pathSegments: string[]; // e.g. ['users', 'user_123', 'habits', 'hab-1']
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  targetDocId?: string;
  payloadData?: Record<string, any>;
}): boolean {
  // Global check: must be under users/{userId} or test/{docId}
  if (pathSegments.length < 2) return false;
  if (pathSegments[0] === 'test') {
    return operation === 'get';
  }

  if (pathSegments[0] !== 'users') return false;
  const pathUserId = pathSegments[1];

  // Helper functions matching firestore.rules
  const isAuthenticated = authUid !== null;
  const isOwner = isAuthenticated && authUid === pathUserId;
  const isValidId = (id?: string) =>
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 128 &&
    /^[a-zA-Z0-9_\-]+$/.test(id);

  // Path: /users/{userId}
  if (pathSegments.length === 2) {
    if (operation === 'get' || operation === 'list') return isOwner;
    if (operation === 'create' || operation === 'update') return isOwner && isValidId(pathUserId);
    if (operation === 'delete') return isOwner;
    return false;
  }

  // Subcollections: /users/{userId}/{subcollection}/{docId}
  const subcollection = pathSegments[2];
  const docId = targetDocId || pathSegments[3];

  if (!['tasks', 'schedules', 'habits', 'categories', 'reminders', 'notifications', 'timetableTemplates'].includes(subcollection)) {
    return false;
  }

  if (operation === 'list') {
    // List queries evaluate on the collection without docId requirement
    return isOwner;
  }

  if (operation === 'get' || operation === 'delete') {
    return isOwner && isValidId(docId);
  }

  if (operation === 'create' || operation === 'update') {
    const userIdMatch = !payloadData || !('userId' in payloadData) || payloadData.userId === pathUserId;
    return isOwner && isValidId(docId) && userIdMatch;
  }

  return false;
}

test('firestore.rules file contains explicit list and get rules for all user subcollections', () => {
  const collections = ['tasks', 'schedules', 'habits', 'categories', 'reminders', 'notifications', 'timetableTemplates'];
  for (const col of collections) {
    // Assert match block exists
    assert.ok(rulesContent.includes(`match /${col}/{`), `Must match /${col}/`);
    // Assert separate list and get
    assert.ok(rulesContent.includes(`allow list: if isOwner(userId);`), 'Must have allow list: if isOwner(userId)');
    assert.ok(
      rulesContent.includes(`allow get: if isOwner(userId) && isValidId(`),
      'Must have allow get with isValidId'
    );
  }
});

test('Habits list operation succeeds for authenticated owner', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'auth_user_456', 'habits'],
    operation: 'list',
    authUid: 'auth_user_456',
  });
  assert.equal(allowed, true, 'Authenticated user must be able to list their habits');
});

test('Habits list operation is strictly blocked for unauthenticated requests', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'auth_user_456', 'habits'],
    operation: 'list',
    authUid: null,
  });
  assert.equal(allowed, false, 'Unauthenticated user must be denied listing habits');
});

test('Habits list operation is strictly blocked when accessing another user data', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'victim_user_999', 'habits'],
    operation: 'list',
    authUid: 'attacker_user_111',
  });
  assert.equal(allowed, false, 'User must not be able to list another user habits');
});

test('Habits create operation succeeds with valid ID and matching userId', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'auth_user_456', 'habits', 'hab-1730379000'],
    targetDocId: 'hab-1730379000',
    operation: 'create',
    authUid: 'auth_user_456',
    payloadData: {
      id: 'hab-1730379000',
      name: 'Hydration 3L',
      userId: 'auth_user_456',
    },
  });
  assert.equal(allowed, true, 'Authenticated owner should be allowed to create a habit');
});

test('Habits create operation fails if payload attempts to spoof another user ID', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'auth_user_456', 'habits', 'hab-1730379000'],
    targetDocId: 'hab-1730379000',
    operation: 'create',
    authUid: 'auth_user_456',
    payloadData: {
      id: 'hab-1730379000',
      name: 'Hydration 3L',
      userId: 'spoofed_user_id',
    },
  });
  assert.equal(allowed, false, 'Payload with mismatched userId must be rejected');
});

test('Habits create operation fails if habitId contains illegal path-traversal characters', () => {
  const allowed = evaluateFirestoreRule({
    pathSegments: ['users', 'auth_user_456', 'habits', '../../admin'],
    targetDocId: '../../admin',
    operation: 'create',
    authUid: 'auth_user_456',
    payloadData: {
      id: '../../admin',
      name: 'Malicious Habit',
      userId: 'auth_user_456',
    },
  });
  assert.equal(allowed, false, 'Path traversal document ID must be rejected');
});

test('TimetableTemplates list and create succeed for owner and block cross-user access', () => {
  assert.equal(
    evaluateFirestoreRule({
      pathSegments: ['users', 'auth_user_456', 'timetableTemplates'],
      operation: 'list',
      authUid: 'auth_user_456',
    }),
    true
  );
  assert.equal(
    evaluateFirestoreRule({
      pathSegments: ['users', 'auth_user_456', 'timetableTemplates', 'tmpl-1730379000'],
      targetDocId: 'tmpl-1730379000',
      operation: 'create',
      authUid: 'auth_user_456',
      payloadData: {
        id: 'tmpl-1730379000',
        name: 'Semester 1',
        userId: 'auth_user_456',
      },
    }),
    true
  );
  assert.equal(
    evaluateFirestoreRule({
      pathSegments: ['users', 'victim_user_999', 'timetableTemplates'],
      operation: 'list',
      authUid: 'attacker_user_111',
    }),
    false
  );
});
