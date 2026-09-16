import React, { useState } from 'react';
import './LoginView.css';

export function LoginView({ onLogin }) {
  const [emailOrUsername, setEmailOrUsername] = useState('admin@satra.io');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!emailOrUsername.trim()) {
      setErrorMessage('Please enter your email or username.');
      return;
    }
    if (!password || password.length < 4) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    setTimeout(() => {
      setIsLoading(false);
      if (onLogin) {
        onLogin({
          email: emailOrUsername,
          name: emailOrUsername.split('@')[0] || 'Operator',
          role: 'SATRA Flight Controller',
          remember: rememberMe,
        });
      }
    }, 600);
  };

  return (
    <main className="satra-login-root flex min-h-screen w-full flex-col bg-[#01030a] text-white lg:flex-row font-sans">
      {/* Left Live Galaxy Deep Space Section */}
      <section className="relative h-[42vh] w-full overflow-hidden border-b border-cyan-400/10 lg:h-auto lg:min-h-screen lg:w-3/5 lg:border-b-0 lg:border-r">
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover"
          src="/dark-galaxy.mp4"
          poster="/dark-galaxy-poster.png"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-[#01030a]/30 via-transparent to-[#01030a]/40" />

        {/* Top Left Brand */}
        <div className="pointer-events-none absolute left-6 top-6 z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
              <div className="h-3.5 w-3.5 rotate-45 rounded-sm bg-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
            </div>
            <div className="leading-tight">
              <p className="text-xl font-semibold tracking-[0.3em] text-cyan-300">SATRA</p>
              <p className="text-[10px] tracking-[0.25em] text-slate-300">THERMAL RISK ANALYSIS</p>
            </div>
          </div>
          <p className="mt-3 text-[10px] tracking-[0.25em] text-slate-400">AI SATELLITE INTELLIGENCE</p>
        </div>

        {/* Top Right Live Telemetry */}
        <div className="pointer-events-none absolute right-6 top-6 z-10 text-right">
          <p className="flex items-center justify-end gap-2 text-[11px] font-medium tracking-[0.2em] text-cyan-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            LIVE GALAXY TELEMETRY
          </p>
          <p className="mt-1 text-[9px] tracking-[0.25em] text-slate-400">DEEP SPACE MONITORING</p>
        </div>

        {/* Bottom Left Telemetry HUD */}
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 rounded-lg border border-cyan-400/15 bg-black/30 px-4 py-3 backdrop-blur-sm">
          <p className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-cyan-300">DEEP SPACE MONITORING</p>
          <ul className="space-y-1 font-mono text-[10px] tracking-wider text-slate-300">
            <li className="flex justify-between gap-6">
              <span>GALAXY FEED</span>
              <span className="text-emerald-400">LIVE</span>
            </li>
            <li className="flex justify-between gap-6">
              <span>DEEP FIELD SCAN</span>
              <span className="text-cyan-300">ACTIVE</span>
            </li>
            <li className="flex justify-between gap-6">
              <span>SATELLITE LINK</span>
              <span className="text-emerald-400">ONLINE</span>
            </li>
          </ul>
        </div>

        {/* Tactical Corner Brackets */}
        <div className="pointer-events-none absolute inset-4 z-[2]">
          <span className="absolute left-0 top-0 h-6 w-6 border-l border-t border-cyan-400/30" />
          <span className="absolute right-0 top-0 h-6 w-6 border-r border-t border-cyan-400/30" />
          <span className="absolute bottom-0 left-0 h-6 w-6 border-b border-l border-cyan-400/30" />
          <span className="absolute bottom-0 right-0 h-6 w-6 border-b border-r border-cyan-400/30" />
        </div>
      </section>

      {/* Right Form Section */}
      <section className="relative flex flex-1 items-center justify-center bg-[#04070f] px-6 py-12 lg:w-2/5">
        <div className="flex w-full max-w-md flex-col">
          {/* Header Brand */}
          <div className="mb-8 flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_20px_rgba(56,189,248,0.35)]">
              <div className="h-4 w-4 rotate-45 rounded-sm bg-cyan-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-[0.25em] text-cyan-300">SATRA</p>
              <p className="text-[10px] tracking-[0.2em] text-slate-400">THERMAL INTELLIGENCE</p>
            </div>
          </div>

          <h1 className="text-3xl font-semibold text-white">Welcome Back</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to access the SATRA Thermal Intelligence Platform</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
            {errorMessage && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                {errorMessage}
              </div>
            )}

            {/* Email / Username Input */}
            <div>
              <label className="mb-2 block text-[11px] font-medium tracking-[0.15em] text-slate-400">
                EMAIL / USERNAME
              </label>
              <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] transition-colors focus-within:border-cyan-400/60 focus-within:shadow-[0_0_18px_rgba(56,189,248,0.25)]">
                <span className="pl-3 text-slate-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="Enter your email or username"
                  className="w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="mb-2 block text-[11px] font-medium tracking-[0.15em] text-slate-400">
                PASSWORD
              </label>
              <div className="group relative flex items-center rounded-lg border border-white/10 bg-white/[0.03] transition-colors focus-within:border-cyan-400/60 focus-within:shadow-[0_0_18px_rgba(56,189,248,0.25)]">
                <span className="pl-3 text-slate-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="pr-3 text-slate-500 hover:text-cyan-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-400"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => alert('Password reset telemetry link dispatched to registered email.')}
                className="text-cyan-400 hover:text-cyan-300"
              >
                Forgot password?
              </button>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 py-3 text-sm font-semibold tracking-[0.15em] text-slate-950 shadow-[0_0_22px_rgba(56,189,248,0.45)] transition-all hover:shadow-[0_0_30px_rgba(56,189,248,0.7)] disabled:opacity-70"
            >
              {isLoading ? 'AUTHENTICATING...' : 'SIGN IN'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <div className="h-px flex-1 bg-white/10" />
              OR
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleSubmit}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] py-3 text-sm text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.3-.1-2.5-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 15.6 2 8.3 6.8 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 46c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 36.8 26.9 38 24 38c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C8.2 41.1 15.5 46 24 46z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.3 36.4 44 30.7 44 24c0-1.3-.1-2.5-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
          </form>

          {/* Footer Note */}
          <p className="mt-8 text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => alert('Access credentials are provided by the SATRA Flight Directorate.')}
              className="font-medium text-cyan-400 hover:text-cyan-300"
            >
              Create Account
            </button>
          </p>

          {/* Security Status Badges */}
          <div className="mt-8 flex items-center justify-center gap-6 text-[10px] tracking-[0.15em] text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
              SECURE CONNECTION
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              SATRA AI CORE ONLINE
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
