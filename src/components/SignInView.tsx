import React, { useState } from 'react';
import {
  CalendarClock,
  Sparkles,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SignInView() {
  const {
    signInWithGoogle,
    verifyMfaSignIn,
    cancelMfaSignIn,
    mfaPending,
    mfaHint,
    loading,
    authError,
  } = useAuth();
  const [mfaCode, setMfaCode] = useState('');

  return (
    <div className="relative min-h-screen w-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#EDE6FC] via-[#F8F5FF] via-45% to-[#FCEEF5] text-[#18113C] antialiased select-none">
      {/* ============================================================ */}
      {/* 1. BACKGROUND DECORATIVE ELEMENTS: WAVES & TREE ILLUSTRATION */}
      {/* ============================================================ */}

      {/* Top-Left Organic Flowing Waves */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-[500px] h-[420px] sm:w-[620px] sm:h-[500px] opacity-80">
        <svg
          viewBox="0 0 640 520"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Layer 1: Outermost gentle lavender curve */}
          <path
            d="M0 0 L520 0 C420 180 340 280 200 370 C110 430 50 460 0 490 Z"
            fill="#EDE4FD"
            fillOpacity="0.55"
          />
          {/* Layer 2: Middle lavender curve */}
          <path
            d="M0 0 L400 0 C320 150 250 230 140 310 C70 360 30 390 0 410 Z"
            fill="#DFD0FA"
            fillOpacity="0.65"
          />
          {/* Layer 3: Innermost lilac curve */}
          <path
            d="M0 0 L280 0 C220 120 160 180 90 245 C40 285 15 305 0 320 Z"
            fill="#CFBFF8"
            fillOpacity="0.75"
          />
        </svg>
      </div>

      {/* Bottom-Right Organic Flowing Waves */}
      <div className="pointer-events-none absolute -bottom-14 -right-14 w-[580px] h-[500px] sm:w-[780px] sm:h-[650px] opacity-85">
        <svg
          viewBox="0 0 800 680"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Layer 1: Outermost sweeping pink-lavender curve */}
          <path
            d="M800 680 L180 680 C320 540 440 450 560 320 C660 200 730 90 800 0 Z"
            fill="#F5E8FD"
            fillOpacity="0.55"
          />
          {/* Layer 2: Middle lilac curve */}
          <path
            d="M800 680 L320 680 C440 560 540 480 630 360 C710 250 760 150 800 60 Z"
            fill="#E8CEF9"
            fillOpacity="0.65"
          />
          {/* Layer 3: Innermost violet-pink curve */}
          <path
            d="M800 680 L460 680 C550 580 630 510 700 410 C755 330 780 230 800 150 Z"
            fill="#D9B7F5"
            fillOpacity="0.7"
          />
        </svg>
      </div>

      {/* Large Translucent Tree of Life Illustration on the Left */}
      <div className="pointer-events-none absolute top-1/2 -translate-y-[45%] -left-14 sm:-left-10 md:-left-6 lg:left-2 xl:left-8 w-[380px] sm:w-[480px] md:w-[560px] lg:w-[620px] xl:w-[660px] aspect-square select-none">
        <img
          src="/ombhi-tree-bg.png"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-contain opacity-[0.36] filter drop-shadow-[0_10px_20px_rgba(102,87,232,0.06)]"
        />
      </div>

      {/* ============================================================ */}
      {/* 2. CENTRAL LOGIN CARD                                        */}
      {/* ============================================================ */}
      <main className="relative z-10 w-full max-w-[380px] mx-4 sm:mx-6">
        <div className="w-full rounded-[24px] border border-[#ECE5F8]/90 bg-white px-6 py-6 sm:px-7 sm:py-6 shadow-[0_20px_50px_-10px_rgba(105,75,200,0.12),0_4px_12px_rgba(0,0,0,0.02)]">
          {/* Application Icon */}
          <div className="flex justify-center">
            <img
              src="/ombhi-icon.png"
              alt="OmBhi Logo"
              className="h-10 w-10 sm:h-11 sm:w-11 object-contain"
            />
          </div>

          {/* Main Heading & Subtitle */}
          <div className="text-center mt-2.5">
            <h1 className="text-[20px] sm:text-[21px] font-bold tracking-tight text-[#18113C] leading-tight">
              Welcome to OmBhi
            </h1>
            <p className="mt-1 text-[11.5px] sm:text-[12px] font-semibold text-[#523A8C] tracking-tight">
              Plan with purpose. Grow every day.
            </p>
            {/* Screen reader branding anchor */}
            <span className="sr-only">OmBhi — Personal Productivity</span>
            <p className="mt-1.5 text-[10.5px] sm:text-[11px] text-[#706B86] leading-relaxed max-w-[280px] mx-auto">
              Your personal space to plan better, build habits, and make consistent progress.
            </p>
          </div>

          {/* Three Feature Cards Row */}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-2.5">
            {/* Card 1: Plan your days */}
            <div className="flex flex-col items-center justify-between rounded-[13px] bg-[#F2EDFD] border border-[#E7DEFA]/70 px-1.5 py-2.5 text-center min-h-[96px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#E5DBFA] text-[#6E42D3]">
                <CalendarClock className="h-4 w-4 stroke-[2]" />
              </div>
              <div className="mt-1 flex-1 flex flex-col justify-center">
                <span className="text-[10.5px] font-bold text-[#18103A] leading-tight">
                  Plan your days
                </span>
                <span className="mt-0.5 text-[8.5px] sm:text-[9px] text-[#716C88] leading-tight">
                  Organize tasks and schedules.
                </span>
              </div>
            </div>

            {/* Card 2: Work smarter */}
            <div className="flex flex-col items-center justify-between rounded-[13px] bg-[#F2EDFD] border border-[#E7DEFA]/70 px-1.5 py-2.5 text-center min-h-[96px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#E5DBFA] text-[#6E42D3]">
                <Sparkles className="h-4 w-4 stroke-[2]" />
              </div>
              <div className="mt-1 flex-1 flex flex-col justify-center">
                <span className="text-[10.5px] font-bold text-[#18103A] leading-tight">
                  Work smarter
                </span>
                <span className="mt-0.5 text-[8.5px] sm:text-[9px] text-[#716C88] leading-tight">
                  AI-powered planning and rescheduling.
                </span>
              </div>
            </div>

            {/* Card 3: Track your growth */}
            <div className="flex flex-col items-center justify-between rounded-[13px] bg-[#F2EDFD] border border-[#E7DEFA]/70 px-1.5 py-2.5 text-center min-h-[96px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#E5DBFA] text-[#6E42D3]">
                {/* Growth Chart Icon with Upward Trend */}
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2.5" y="11" width="3" height="6.5" rx="0.5" />
                  <rect x="7.5" y="7" width="3" height="10.5" rx="0.5" />
                  <rect x="12.5" y="3" width="3" height="14.5" rx="0.5" />
                  <path d="M10.5 4h5v5" />
                  <path d="m9 9.5 6.5-5.5" />
                </svg>
              </div>
              <div className="mt-1 flex-1 flex flex-col justify-center">
                <span className="text-[10.5px] font-bold text-[#18103A] leading-tight">
                  Track your growth
                </span>
                <span className="mt-0.5 text-[8.5px] sm:text-[9px] text-[#716C88] leading-tight">
                  Build habits and measure progress.
                </span>
              </div>
            </div>
          </div>

          {/* Authentication Error Banner (if any) */}
          {authError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/90 p-2.5 text-xs text-rose-900 space-y-1">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-[10.5px] leading-relaxed text-rose-800">
                  {authError}
                </p>
              </div>
            </div>
          )}

          {/* Google Sign-In or MFA Challenge */}
          <div className="mt-4">
            {mfaPending ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyMfaSignIn(mfaCode);
                }}
                className="space-y-2.5 rounded-2xl border border-[#DFD0FA] bg-[#F8F5FF] p-3.5"
              >
                <div className="flex items-center gap-2 text-[#441C9E]">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-bold">Two-Factor Verification</span>
                </div>
                <p className="text-[11px] text-[#5F597A] leading-relaxed">
                  Enter the 6-digit code from your authenticator app
                  {mfaHint ? ` (${mfaHint})` : ''}.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  aria-label="6-digit authenticator verification code"
                  className="w-full rounded-xl border border-[#D4C5F9] bg-white px-3 py-2 text-center font-mono text-sm font-bold tracking-[0.3em] text-[#18113C] focus:border-[#6657E8] focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading || mfaCode.length !== 6}
                    className="flex-1 flex h-[40px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#3B1595] via-[#4F20B2] to-[#441C9E] px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify Code</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaCode('');
                      cancelMfaSignIn();
                    }}
                    disabled={loading}
                    className="h-[40px] rounded-full border border-[#D4C5F9] bg-white px-3.5 text-[11px] font-semibold text-[#523A8C] hover:bg-[#F2EDFD] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={loading}
                aria-label="Continue with Google"
                className="group relative flex w-full h-[46px] items-center justify-between rounded-full bg-gradient-to-r from-[#3B1595] via-[#4F20B2] to-[#441C9E] px-4 sm:px-5 text-white shadow-[0_8px_20px_rgba(79,32,178,0.36)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6657E8] focus-visible:ring-offset-2"
              >
                {loading ? (
                  <div className="flex w-full items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span className="text-xs font-medium text-white tracking-wide">
                      Connecting to Google...
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Left: Google G Multi-Color Logo + Vertical Divider */}
                    <div className="flex items-center">
                      <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <div className="h-4 w-px bg-white/25 ml-2.5 mr-1" />
                    </div>

                    {/* Center: Button Text */}
                    <span className="text-[12.5px] sm:text-[13px] font-semibold tracking-wide text-white">
                      Continue with Google
                    </span>

                    {/* Right: Small Arrow */}
                    <div className="flex items-center text-white/90 group-hover:translate-x-0.5 transition-transform">
                      <ArrowRight className="h-3.5 w-3.5 stroke-[2.5]" />
                    </div>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Security Footer */}
          <div className="relative mt-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#EAE5F4]" />
            </div>
            <div className="relative bg-white px-3 flex items-center gap-1.5 text-[9.5px] sm:text-[10px] text-[#868098] font-medium">
              <Lock className="h-2.5 w-2.5 text-[#868098]" />
              <span>Your data stays private and secure.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
