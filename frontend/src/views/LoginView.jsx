import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
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
    }, 500);
  };

  return (
    <main className="satra-login-page">
      {/* ==================================================================
          LEFT SIDE — 60% GALAXY PANEL (Visual Storytelling & Telemetry)
          ================================================================== */}
      <section className="login-galaxy-panel" aria-label="Deep Space Visual Panel">
        {/* Cinematic Animated Galaxy Background */}
        <div className="galaxy-media-layer">
          <img
            className="galaxy-cinematic-bg"
            src="/dark-galaxy-poster.png"
            alt="Deep Galaxy View"
            aria-hidden="true"
          />
        </div>

        {/* Cinematic Vignette Overlay */}
        <div className="galaxy-vignette-overlay" />

        {/* Subtle Futuristic Corner Line Brackets */}
        <div className="galaxy-corners-frame">
          <span className="galaxy-corner galaxy-corner-tl" />
          <span className="galaxy-corner galaxy-corner-tr" />
          <span className="galaxy-corner galaxy-corner-bl" />
          <span className="galaxy-corner galaxy-corner-br" />
        </div>

        {/* Top Left: Logo + Branding */}
        <div className="galaxy-top-left-brand">
          <div className="galaxy-brand-header">
            <div className="galaxy-logo-icon">
              <div className="galaxy-logo-diamond" />
            </div>
            <div>
              <div className="galaxy-brand-title">SATRA</div>
              <div className="galaxy-brand-subtitle">THERMAL RISK ANALYSIS</div>
            </div>
          </div>
          <div className="galaxy-brand-tagline">AI SATELLITE INTELLIGENCE</div>
        </div>

        {/* Top Right: Live Galaxy Telemetry */}
        <div className="galaxy-top-right-telemetry">
          <div className="galaxy-telemetry-status">
            <span className="galaxy-status-dot-green" />
            <span>LIVE GALAXY TELEMETRY</span>
          </div>
          <div className="galaxy-telemetry-sub">DEEP SPACE MONITORING</div>
        </div>

        {/* Bottom Left: Compact Monitoring HUD Panel */}
        <div className="galaxy-bottom-hud">
          <div className="hud-panel-title">DEEP SPACE MONITORING</div>
          <ul className="hud-panel-list">
            <li className="hud-panel-row">
              <span>GALAXY FEED</span>
              <span className="hud-status-live">LIVE</span>
            </li>
            <li className="hud-panel-row">
              <span>DEEP FIELD SCAN</span>
              <span className="hud-status-active">ACTIVE</span>
            </li>
            <li className="hud-panel-row">
              <span>SATELLITE LINK</span>
              <span className="hud-status-online">ONLINE</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ==================================================================
          RIGHT SIDE — 40% LOGIN PANEL (Authentication)
          ================================================================== */}
      <section className="login-form-panel" aria-label="Sign In Panel">
        <div className="login-form-container">
          {/* Header Brand */}
          <div className="login-brand-header">
            <div className="login-logo-icon">
              <div className="login-logo-diamond" />
            </div>
            <div>
              <div className="login-brand-title">SATRA</div>
              <div className="login-brand-subtitle">THERMAL INTELLIGENCE</div>
            </div>
          </div>

          {/* Heading */}
          <h1 className="login-welcome-title">Welcome Back</h1>
          <p className="login-welcome-desc">
            Sign in to access the SATRA Thermal Intelligence Platform
          </p>

          {/* Error Message */}
          {errorMessage && (
            <div className="login-error-banner" role="alert">
              {errorMessage}
            </div>
          )}

          {/* Login Form */}
          <form className="login-form" onSubmit={handleSubmit}>
            {/* Email / Username */}
            <div className="login-field-group">
              <label className="login-field-label" htmlFor="login-username-input">
                EMAIL / USERNAME
              </label>
              <div className="login-input-wrapper">
                <span className="login-field-icon">
                  <Mail size={16} />
                </span>
                <input
                  id="login-username-input"
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="Enter your email or username"
                  className="login-text-input"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field-group">
              <label className="login-field-label" htmlFor="login-password-input">
                PASSWORD
              </label>
              <div className="login-input-wrapper">
                <span className="login-field-icon">
                  <Lock size={16} />
                </span>
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="login-text-input"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="login-options-row">
              <label className="login-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="login-checkbox"
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Password reset telemetry link dispatched to registered email.')}
                className="login-forgot-btn"
              >
                Forgot password?
              </button>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="login-submit-btn"
            >
              {isLoading ? 'AUTHENTICATING...' : 'SIGN IN'}
            </button>

            {/* OR Divider */}
            <div className="login-divider-row">
              <span className="login-divider-line" />
              <span>OR</span>
              <span className="login-divider-line" />
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleSubmit}
              className="login-google-btn"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.3-.1-2.5-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 15.6 2 8.3 6.8 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 46c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 36.8 26.9 38 24 38c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C8.2 41.1 15.5 46 24 46z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.3 36.4 44 30.7 44 24c0-1.3-.1-2.5-.4-3.5z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>

          {/* Footer Note: Create Account */}
          <p className="login-footer-text">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => alert('Access credentials are provided by the SATRA Flight Directorate.')}
              className="login-create-account-btn"
            >
              Create Account
            </button>
          </p>

          {/* Security Status Badges */}
          <div className="login-security-badges">
            <span className="login-security-badge-item">
              <span className="login-security-dot-cyan" />
              <span>SECURE CONNECTION</span>
            </span>
            <span className="login-security-badge-item">
              <span className="login-security-dot-green" />
              <span>SATRA AI CORE ONLINE</span>
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default LoginView;
