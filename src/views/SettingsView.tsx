import { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Check,
  Repeat,
  Pause,
  Play,
  Calendar,
  ShieldCheck,
  LogOut,
  UserCheck,
  Bell,
  Globe,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Server,
  Volume2,
  VolumeX,
  KeyRound,
  Copy,
  Lock,
} from 'lucide-react';
import { Category, Habit, RecurringSchedule, Reminder, Task, UserSettings } from '../types';
import { exportBackupJSON } from '../utils/storage';
import { formatScheduleSummary } from '../utils/recurring';
import { getSystemTimezone, MAJOR_TIMEZONES } from '../utils/reminders';
import { playNotificationChime } from '../utils/sound';
import { authenticatedFetch } from '../utils/api';
import { parseAndValidateBackupJson, validateBackupFileMeta } from '../utils/backupValidation';
import { TotpEnrollmentChallenge, useAuth } from '../context/AuthContext';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => void;
  tasks: Task[];
  schedules: RecurringSchedule[];
  categories: Category[];
  habits: Habit[];
  reminders?: Reminder[];
  onTogglePauseSchedule: (scheduleId: string) => void;
  onDeleteSchedule: (scheduleId: string) => void;
  onImportBackup: (imported: {
    tasks: Task[];
    schedules?: RecurringSchedule[];
    categories: Category[];
    habits: Habit[];
    settings: UserSettings;
    reminders?: Reminder[];
  }) => void;
  onResetDemoData?: () => void;
  onClearAllData: () => void;
  user?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
    uid?: string;
  } | null;
  onSignOut?: () => void;
  onTestInAppNotification?: () => Promise<{ success: boolean; message: string }>;
}

export function SettingsView({
  settings,
  onUpdateSettings,
  tasks,
  schedules,
  categories,
  habits,
  reminders = [],
  onTogglePauseSchedule,
  onDeleteSchedule,
  onImportBackup,
  onResetDemoData,
  onClearAllData,
  user,
  onSignOut,
  onTestInAppNotification,
}: SettingsViewProps) {
  const [serverSchedulerStatus, setServerSchedulerStatus] = useState<{
    running: boolean;
    lastRunAt: string;
    trackedRemindersCount: number;
    trackedUsersCount: number;
  } | null>(null);

  const [isTestingInApp, setIsTestingInApp] = useState(false);
  const [inAppTestResult, setInAppTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Two-Factor Authentication (TOTP MFA) state
  const {
    enrolledMfaFactors,
    startTotpMfaEnrollment,
    completeTotpMfaEnrollment,
    unenrollMfaFactor,
    reauthenticateWithGoogle,
  } = useAuth();
  const [mfaChallenge, setMfaChallenge] = useState<TotpEnrollmentChallenge | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaDeviceLabel, setMfaDeviceLabel] = useState('Authenticator App');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaNeedsReauth, setMfaNeedsReauth] = useState(false);
  const [mfaFeedback, setMfaFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadStatus = () => {
    authenticatedFetch('/api/notifications/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.backgroundScheduler) {
          setServerSchedulerStatus(data.backgroundScheduler);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTestInApp = async () => {
    if (!onTestInAppNotification) return;
    setIsTestingInApp(true);
    setInAppTestResult(null);
    try {
      const res = await onTestInAppNotification();
      setInAppTestResult(res);
    } catch (err: any) {
      setInAppTestResult({
        success: false,
        message: err?.message || 'Failed to generate test in-app notification.',
      });
    } finally {
      setIsTestingInApp(false);
    }
  };

  const handleStartMfa = async () => {
    setMfaFeedback(null);
    setMfaNeedsReauth(false);
    setMfaBusy(true);
    try {
      const challenge = await startTotpMfaEnrollment();
      setMfaChallenge(challenge);
      setMfaVerifyCode('');
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setMfaNeedsReauth(true);
        setMfaFeedback({
          type: 'error',
          message: 'For your security, please re-authenticate with Google before modifying Two-Factor Authentication.',
        });
      } else if (err?.code === 'auth/operation-not-allowed') {
        setMfaFeedback({
          type: 'error',
          message: 'TOTP MFA is not yet enabled on the Firebase Identity Platform project.',
        });
      } else {
        setMfaFeedback({
          type: 'error',
          message: err?.message || 'Could not start Two-Factor Authentication setup.',
        });
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfaEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setMfaFeedback(null);
    setMfaBusy(true);
    try {
      await completeTotpMfaEnrollment(mfaChallenge.secret, mfaVerifyCode, mfaDeviceLabel);
      setMfaChallenge(null);
      setMfaVerifyCode('');
      setMfaFeedback({
        type: 'success',
        message: 'Two-Factor Authentication (TOTP) is now active on your account.',
      });
    } catch (err: any) {
      setMfaFeedback({
        type: 'error',
        message:
          err?.code === 'auth/invalid-verification-code'
            ? 'Invalid 6-digit code. Check your authenticator app and try again.'
            : err?.message || 'Failed to verify authenticator code.',
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleUnenrollMfa = async (factorUid: string) => {
    setMfaFeedback(null);
    setMfaNeedsReauth(false);
    setMfaBusy(true);
    try {
      await unenrollMfaFactor(factorUid);
      setMfaFeedback({
        type: 'success',
        message: 'Authenticator factor removed from your account.',
      });
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        setMfaNeedsReauth(true);
        setMfaFeedback({
          type: 'error',
          message: 'Please re-authenticate with Google before removing a 2FA factor.',
        });
      } else {
        setMfaFeedback({
          type: 'error',
          message: err?.message || 'Failed to remove 2FA factor.',
        });
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const handleReauthForMfa = async () => {
    setMfaBusy(true);
    setMfaFeedback(null);
    try {
      await reauthenticateWithGoogle();
      setMfaNeedsReauth(false);
      setMfaFeedback({
        type: 'success',
        message: 'Re-authenticated successfully. You can now manage Two-Factor Authentication.',
      });
    } catch (err: any) {
      setMfaFeedback({
        type: 'error',
        message: err?.message || 'Re-authentication cancelled or failed.',
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleExport = () => {
    exportBackupJSON(tasks, schedules, categories, habits, settings, reminders);
    setBackupFeedback({ type: 'success', message: 'Backup exported as validated JSON.' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupFeedback(null);

    const metaValidation = validateBackupFileMeta(file);
    if (!metaValidation.valid) {
      setBackupFeedback({
        type: 'error',
        message: metaValidation.error || 'Unsupported backup file.',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      const result = parseAndValidateBackupJson(text, categories, settings);
      if (result.valid) {
        onImportBackup(result.data);
        setBackupFeedback({
          type: 'success',
          message: `Imported ${result.data.tasks.length} tasks, ${result.data.habits.length} habits, and ${result.data.reminders.length} reminders safely.`,
        });
      } else {
        setBackupFeedback({
          type: 'error',
          message: 'error' in result ? result.error : 'Invalid OmBhi backup JSON format.',
        });
      }
    };
    reader.onerror = () => {
      setBackupFeedback({
        type: 'error',
        message: 'Could not read the selected backup file.',
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Google Account & Cloud Synchronization */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-[#6657E8]" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Google Account & Cloud Security
            </h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Zero-Trust Rules Active
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google User'}
                className="h-12 w-12 rounded-full border-2 border-[#6657E8]/20 object-cover shadow-xs"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#6657E8] to-[#9182F3] text-sm font-bold text-white shadow-xs">
                {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'GD'}
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {user?.displayName || 'Google User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {user?.email || 'No email provided'}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                User ID:{' '}
                <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
                  {user?.uid ? `${user.uid.slice(0, 8)}...${user.uid.slice(-4)}` : 'Unknown'}
                </span>
              </p>
            </div>
          </div>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 hover:text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>

        {/* Multi-Factor Authentication (TOTP 2FA) */}
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-[#6657E8]" />
                <p className="text-xs font-bold text-gray-900 dark:text-white">
                  Two-Factor Authentication (TOTP Authenticator)
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                Add a 6-digit authenticator app code as a second verification step when signing in.
              </p>
            </div>
            {enrolledMfaFactors.length > 0 ? (
              <span className="inline-flex items-center gap-1 self-start rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Lock className="h-3 w-3" />
                2FA Enabled ({enrolledMfaFactors.length})
              </span>
            ) : (
              !mfaChallenge && (
                <button
                  type="button"
                  onClick={handleStartMfa}
                  disabled={mfaBusy}
                  className="self-start flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5748d6] disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{mfaBusy ? 'Preparing...' : 'Enable 2FA'}</span>
                </button>
              )
            )}
          </div>

          {enrolledMfaFactors.length > 0 && (
            <div className="space-y-2">
              {enrolledMfaFactors.map((factor) => (
                <div
                  key={factor.uid}
                  className="flex items-center justify-between rounded-xl border border-gray-200/80 bg-gray-50/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/40"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{factor.displayName}</p>
                    <p className="text-[10px] text-gray-400">
                      Factor: {factor.factorId.toUpperCase()}
                      {factor.enrollmentTime ? ` · Added ${new Date(factor.enrollmentTime).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnenrollMfa(factor.uid)}
                    disabled={mfaBusy}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 cursor-pointer disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {mfaChallenge && (
            <form
              onSubmit={handleVerifyMfaEnrollment}
              className="space-y-3 rounded-xl border border-[#6657E8]/25 bg-[#F8F5FF] p-3.5 text-xs dark:border-indigo-900/50 dark:bg-slate-800/60"
            >
              <p className="font-bold text-gray-900 dark:text-white">
                Step 1: Add this setup key to your authenticator app (Google Authenticator, 1Password, or Authy)
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] text-gray-800 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200">
                <span className="break-all select-all">{mfaChallenge.secretKey}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(mfaChallenge.secretKey);
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 2000);
                  }}
                  className="shrink-0 flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-sans font-semibold text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedSecret ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    Device Label
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={mfaDeviceLabel}
                    onChange={(e) => setMfaDeviceLabel(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                    placeholder="My Phone Authenticator"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    Step 2: Enter 6-digit code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaVerifyCode}
                    onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs tracking-widest dark:border-slate-700 dark:bg-slate-900"
                    placeholder="000000"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={mfaBusy || mfaVerifyCode.length !== 6}
                  className="rounded-xl bg-[#6657E8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#5748d6] disabled:opacity-50 cursor-pointer"
                >
                  {mfaBusy ? 'Verifying...' : 'Verify & Activate 2FA'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaVerifyCode('');
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {mfaFeedback && (
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                mfaFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
              }`}
            >
              <span>{mfaFeedback.message}</span>
              {mfaNeedsReauth && (
                <button
                  type="button"
                  onClick={handleReauthForMfa}
                  disabled={mfaBusy}
                  className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 cursor-pointer"
                >
                  Re-authenticate with Google
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recurring Schedules Management Section */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-[#6657E8]" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Recurring & Multi-Day Schedules ({schedules.length})
            </h2>
          </div>
          <span className="text-xs text-gray-400">Independent daily progress</span>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Manage, pause, resume, or remove recurring series templates for gym routines, language studies, and university reviews.
        </p>

        {schedules.length === 0 ? (
          <p className="mt-4 text-xs text-gray-400 text-center py-4">No recurring schedules currently active.</p>
        ) : (
          <div className="mt-4 divide-y divide-gray-100 dark:divide-slate-800">
            {schedules.map((schedule) => {
              const cat = categories.find((c) => c.id === schedule.categoryId);
              const summary = formatScheduleSummary(schedule);

              return (
                <div
                  key={schedule.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat?.color || '#6657E8' }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold ${schedule.isPaused ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                          {schedule.title}
                        </p>
                        {schedule.isPaused && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                            Paused
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {summary} {cat ? `· ${cat.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => onTogglePauseSchedule(schedule.id)}
                      className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                        schedule.isPaused
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}
                    >
                      {schedule.isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                      <span>{schedule.isPaused ? 'Resume' : 'Pause'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSchedule(schedule.id)}
                      className="rounded-xl p-1 text-gray-400 hover:text-rose-500 cursor-pointer"
                      title="Delete entire schedule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preferences Card */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Preferences & Controls
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Tailor time formats, theme, and focus targets to your daily rhythm.
        </p>

        <div className="mt-6 divide-y divide-gray-100 text-xs dark:divide-slate-800">
          {/* Theme */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Interface Theme</p>
              <p className="text-gray-400">Toggle between light and slate dark mode</p>
            </div>
            <select
              value={settings.theme}
              onChange={(e) =>
                onUpdateSettings((s) => ({ ...s, theme: e.target.value as any }))
              }
              aria-label="Select interface theme"
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium dark:border-slate-700 dark:bg-[#1E293B]"
            >
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>

          {/* Time format */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Time Display Format</p>
              <p className="text-gray-400">24-hour military clock vs 12-hour AM/PM</p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings((s) => ({ ...s, timeFormat24h: !s.timeFormat24h }))
              }
              className={`rounded-xl px-3 py-1.5 font-semibold transition ${
                settings.timeFormat24h
                  ? 'bg-[#6657E8] text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-200'
              }`}
            >
              {settings.timeFormat24h ? '24-hour (14:30)' : '12-hour (2:30 PM)'}
            </button>
          </div>

          {/* Start of Week */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">First Day of Week</p>
              <p className="text-gray-400">Calendar column alignment</p>
            </div>
            <select
              value={settings.startOfWeekMonday ? 'monday' : 'sunday'}
              onChange={(e) =>
                onUpdateSettings((s) => ({
                  ...s,
                  startOfWeekMonday: e.target.value === 'monday',
                }))
              }
              aria-label="Select start of week"
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-medium dark:border-slate-700 dark:bg-[#1E293B]"
            >
              <option value="monday">Monday (European standard)</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>

          {/* Daily Focus Goal */}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Daily Focus Target</p>
              <p className="text-gray-400">Target completed tasks each day</p>
            </div>
            <input
              type="number"
              min={1}
              max={25}
              value={settings.dailyFocusGoal}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onUpdateSettings((s) => ({ ...s, dailyFocusGoal: val }));
              }}
              aria-label="Daily focus goal"
              className="w-16 rounded-xl border border-gray-200 bg-white py-1 px-2 text-center font-bold tabular-nums dark:border-slate-700 dark:bg-[#1E293B]"
            />
          </div>

          {/* Celebratory Feedback & Controls */}
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 dark:text-white">Subtle Milestone Celebrations</p>
                <p className="text-gray-400">Micro-animation confetti burst upon completion (stops after 3s max)</p>
              </div>
              <input
                type="checkbox"
                checked={settings.celebratoryAnimations}
                onChange={(e) =>
                  onUpdateSettings((s) => ({
                    ...s,
                    celebratoryAnimations: e.target.checked,
                  }))
                }
                aria-label="Toggle celebratory animations"
                className="h-4 w-4 rounded accent-[#6657E8] cursor-pointer"
              />
            </div>

            {settings.celebratoryAnimations && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-xs">Celebration Scope</p>
                  <p className="text-[11px] text-gray-400">Choose which completed items trigger confetti</p>
                </div>
                <select
                  value={settings.celebrationScope || 'both'}
                  onChange={(e) =>
                    onUpdateSettings((s) => ({
                      ...s,
                      celebrationScope: e.target.value as 'both' | 'tasks' | 'habits',
                    }))
                  }
                  aria-label="Celebration Scope"
                  className="rounded-xl border border-gray-200 bg-white py-1.5 px-3 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200 cursor-pointer"
                >
                  <option value="both">Both Tasks & Habits</option>
                  <option value="tasks">Tasks Only</option>
                  <option value="habits">Habits Only</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reminders & Notifications Configuration */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#6657E8]" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Reminders & Notification Delivery
            </h2>
          </div>
          <span className="text-xs font-medium text-gray-400">
            {reminders.length} reminder{reminders.length === 1 ? '' : 's'} tracked
          </span>
        </div>

        <div className="mt-4 divide-y divide-gray-100 dark:divide-slate-800 text-xs">
          {/* Timezone Setting */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5">
            <div>
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <p className="font-bold text-gray-900 dark:text-white">Active Timezone</p>
              </div>
              <p className="text-gray-400 mt-0.5">
                Used for exact reminder schedules, recurring alerts, and daylight saving time alignment.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={settings.timezone || getSystemTimezone()}
                onChange={(e) => onUpdateSettings((s) => ({ ...s, timezone: e.target.value }))}
                aria-label="Application Timezone"
                className="rounded-xl border border-gray-200 bg-white py-1.5 px-3 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              >
                {MAJOR_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onUpdateSettings((s) => ({ ...s, timezone: getSystemTimezone() }))}
                className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 whitespace-nowrap"
                title="Detect local browser timezone"
              >
                Auto-Detect
              </button>
            </div>
          </div>

          {/* In-App Notification Delivery Status */}
          <div className="py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-[#6657E8]" />
                <span className="font-bold text-gray-900 dark:text-white">In-App Notification Bell</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Active
              </span>
            </div>
            <p className="mt-1 text-gray-400 leading-relaxed text-[11px]">
              All reminders, task milestones, and habit streaks trigger in-app alerts directly on your notification bell with unread badges, history, and deep-linking to items.
            </p>
          </div>

          {/* Notification Chime Sound */}
          <div className="py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  {settings.notificationSound !== false ? (
                    <Volume2 className="h-3.5 w-3.5 text-[#6657E8]" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  <p className="font-bold text-gray-900 dark:text-white">In-App Notification Chime</p>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Subtle harmonic ting sound when a genuinely new in-app notification arrives.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playNotificationChime()}
                  aria-label="Preview chime sound"
                  className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 transition cursor-pointer"
                >
                  Preview Ting
                </button>
                <input
                  type="checkbox"
                  checked={settings.notificationSound !== false}
                  onChange={(e) =>
                    onUpdateSettings((s) => ({
                      ...s,
                      notificationSound: e.target.checked,
                    }))
                  }
                  aria-label="Toggle in-app notification chime"
                  className="h-4 w-4 rounded accent-[#6657E8] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Background Server Scheduler Status */}
          <div className="py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                <span className="font-bold text-gray-900 dark:text-white">Persistent Offline Background Scheduler</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Continuous 30s Loop Active
              </span>
            </div>
            <p className="mt-1 text-gray-400 leading-relaxed text-[11px]">
              The server runs an independent scheduler that evaluates reminders even when your browser tab is closed.
              {serverSchedulerStatus && (
                <span className="block mt-1 text-[10px] text-gray-400">
                  Tracked active schedules: {serverSchedulerStatus.trackedRemindersCount} · Last evaluation heartbeat:{' '}
                  {new Date(serverSchedulerStatus.lastRunAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>

          {/* In-App Verification Diagnostics */}
          <div className="pt-4 pb-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 dark:text-white">In-App Notification Verification</p>
                <p className="text-[11px] text-gray-400">
                  Trigger an immediate test alert to verify Firestore storage and the notification bell.
                </p>
              </div>
              <button
                type="button"
                onClick={loadStatus}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 cursor-pointer"
                title="Refresh system status"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onTestInAppNotification && (
                <button
                  type="button"
                  onClick={handleTestInApp}
                  disabled={isTestingInApp}
                  className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5748d6] cursor-pointer disabled:opacity-50"
                >
                  {isTestingInApp ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating In-App Alert...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="h-3.5 w-3.5" />
                      <span>Test In-App Notification</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* In-App Test Feedback Banner */}
            {inAppTestResult && (
              <div
                className={`rounded-xl border p-3 text-xs leading-relaxed transition animate-in fade-in ${
                  inAppTestResult.success
                    ? 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {inAppTestResult.success ? (
                    <Sparkles className="h-4 w-4 shrink-0 text-[#6657E8] dark:text-[#A59DF7] mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold">
                      {inAppTestResult.success ? 'In-App Notification Stored in Firestore' : 'In-App Test Failed'}
                    </p>
                    <p className="mt-0.5">{inAppTestResult.message}</p>
                    {inAppTestResult.success && (
                      <p className="mt-1 text-[11px] text-[#6657E8] dark:text-[#A59DF7] font-medium">
                        ✓ Look at the notification bell in the top navigation header — your unread count badge has updated.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* System Health Matrix */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2 rounded-xl bg-gray-50/80 p-2.5 text-[11px] text-gray-600 dark:bg-slate-800/40 dark:text-gray-300">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Firebase Zero-Trust Security</p>
                  <p className="text-[10px] text-gray-400">Path: /users/{user?.uid ? `${user.uid.slice(0, 10)}...` : 'auth'}/...</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-gray-50/80 p-2.5 text-[11px] text-gray-600 dark:bg-slate-800/40 dark:text-gray-300">
                <Bell className="h-4 w-4 text-[#6657E8] shrink-0" />
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">In-App Notification Bell</p>
                  <p className="text-[10px] text-gray-400">Unread badge & item deep-linking active</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Backup & Portability */}
      <div className="space-y-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Data Backup & Portability
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed dark:text-gray-400">
          All tasks, habits, and recurring schedules persist locally and in your isolated cloud storage. Export complete JSON snapshots or restore previous backups at any time.
        </p>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON Backup</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Backup</span>
          </button>

          <button
            type="button"
            onClick={onClearAllData}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-800 dark:text-rose-400 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear All Data</span>
          </button>
        </div>

        {backupFeedback && (
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              backupFeedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
            }`}
          >
            {backupFeedback.message}
          </div>
        )}
      </div>
    </div>
  );
}
