# OmBhi — Personal Productivity Scheduler

> **Plan with purpose. Grow every day.**

OmBhi is a modern, privacy-first personal productivity and daily scheduling application. It combines calendar time-blocking, recurring schedules, habit tracking, in-app reminders, and AI-assisted productivity planning into a cohesive, motivating workspace.

---

## Features

### 📅 Daily Planning & Calendar Time-Blocking
- **My Day**: Focused view of today's schedule, subtasks, and focus targets.
- **Calendar Time-Blocking**: Interactive day and multi-day calendar views for visualizing commitment blocks.
- **Smart Rescheduling**: Move postponed or unfinished items forward with intelligent time-conflict resolution.

### ✍️ Natural Language Quick Add
- Type tasks in plain English (e.g., *"Team retrospective tomorrow at 3 PM (High Priority)"*).
- Automatically parses titles, dates, start times, durations, recurrence frequencies, and category suggestions.

### 🔥 Habit Tracking & Consistency Score
- Track recurring daily habits with streak counters and completion heatmaps.
- **Dynamic Consistency Index**: Transparent completion score computed from real user activity, not arbitrary defaults.

### 🔔 Reminders & In-App Notification Center
- Track critical deadlines and time-sensitive reminders with exact times and custom priority levels.
- Persistent in-app notifications with unread badge indicators and direct item deep-linking.
- Optional subtle harmonic chime for real-time notifications and milestone celebrations with a 3-second cap.

### 🧠 Intelligent Productivity Insights
- **AI Day Planner**: Proactively suggests structured schedules tailored to your energy levels and focus targets.
- **AI Consistency Coach**: Contextual coaching dialogues based on your recent habit momentum and task completion trends.
- **AI Weekly Review**: Synthesizes weekly progress summaries, celebratory wins, and actionable adjustments.

### 🛡️ Zero-Trust Security & Architecture
- **Private Cloud Storage**: All tasks, schedules, habits, and reminders reside under secure per-user paths (`/users/{userId}/...`).
- **Backend Authentication**: Every API endpoint is guarded by Firebase Admin SDK token verification.
- **Zero-Trust User Derivation**: Identity is derived exclusively from verified cryptographic tokens; client-supplied user identifiers are never trusted.
- **Rate-Limiting**: Sliding-window rate limiters prevent API overuse.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Node.js, Express, Firebase Admin SDK
- **Database & Auth**: Google Cloud Firestore, Firebase Authentication
- **AI Services**: Google Gemini API via `@google/genai`
- **Build Tooling**: Vite, TypeScript (`tsc`)

---

## Getting Started

### 1. Prerequisites
- Node.js (v20+ recommended)
- A Firebase project with Firestore and Authentication enabled

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

Set the required environment variables:
- `GEMINI_API_KEY`: API key for Gemini features.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service account credentials (JSON string or file path).

### 3. Development Server
Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### 4. Production Build & Linting
Compile the frontend assets:

```bash
npm run build
```

Run TypeScript validation:

```bash
npm run lint
```

Run test suite:

```bash
npx tsx --test src/server/auth.test.ts src/server/security.test.ts
```

---

## Privacy & Security

OmBhi is architected so that each user has isolated, private data storage. Firestore rules and backend API middleware strictly enforce that users cannot read, write, or access any other user's schedule, habits, or notifications.
