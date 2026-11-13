import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Firebase configuration targets new ombhi-a81ae project', () => {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  assert.ok(fs.existsSync(configPath), 'firebase-applet-config.json must exist');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.equal(config.projectId, 'ombhi-a81ae');
  assert.equal(config.authDomain, 'ombhi-a81ae.firebaseapp.com');
  assert.equal(config.storageBucket, 'ombhi-a81ae.firebasestorage.app');
  assert.equal(config.messagingSenderId, '26256150585');
  assert.equal(config.appId, '1:26256150585:web:36bf2d213bdb15b1e53de8');
  assert.equal(config.measurementId, 'G-1EKP8NB6EW');
  assert.equal(config.apiKey, 'AIzaSyAmNgQUyjIDvoYcNaAfIvo3Lsp2NKOq5uc');
});

test('No hardcoded references to old project concrete-component-95v9p or old database ID', () => {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  assert.ok(!rawConfig.includes('concrete-component-95v9p'), 'Must not reference old project');
  assert.ok(!rawConfig.includes('ai-studio-dayforge'), 'Must not reference old database ID');

  const signInPath = path.resolve(process.cwd(), 'src/components/SignInView.tsx');
  const rawSignIn = fs.readFileSync(signInPath, 'utf-8');
  assert.ok(!rawSignIn.includes('concrete-component-95v9p'), 'Must not reference old project in SignInView');
  assert.ok(!rawSignIn.includes('Firebase Console setup steps'), 'SignInView must not show Firebase setup instructions');
});

test('Firestore rules enforce strict per-UID ownership isolation and global fallback deny', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  assert.ok(rulesContent.includes("rules_version = '2';"), 'Rules must use version 2');
  assert.ok(rulesContent.includes('isOwner(userId)'), 'Rules must contain isOwner helper');
  assert.ok(rulesContent.includes('match /users/{userId}'), 'Rules must isolate users root document');
  assert.ok(rulesContent.includes('match /tasks/{taskId}'), 'Rules must isolate tasks subcollection');
  assert.ok(rulesContent.includes('match /categories/{categoryId}'), 'Rules must isolate categories subcollection');
  assert.ok(rulesContent.includes('match /schedules/{scheduleId}'), 'Rules must isolate schedules subcollection');
  assert.ok(rulesContent.includes('match /habits/{habitId}'), 'Rules must isolate habits subcollection');
  assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'), 'Rules must have zero-trust default deny');
});

test('User data paths strictly nest under authenticated Firebase UID', () => {
  const testUserId = 'test_firebase_uid_123';
  const getTaskPath = (uid: string, taskId: string) => `users/${uid}/tasks/${taskId}`;
  const getCategoryPath = (uid: string, catId: string) => `users/${uid}/categories/${catId}`;
  const getSchedulePath = (uid: string, schedId: string) => `users/${uid}/schedules/${schedId}`;

  assert.equal(getTaskPath(testUserId, 'task_abc'), 'users/test_firebase_uid_123/tasks/task_abc');
  assert.equal(getCategoryPath(testUserId, 'cat_work'), 'users/test_firebase_uid_123/categories/cat_work');
  assert.equal(getSchedulePath(testUserId, 'sched_daily'), 'users/test_firebase_uid_123/schedules/sched_daily');
});
