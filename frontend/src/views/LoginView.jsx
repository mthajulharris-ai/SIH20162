import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Radio,
  Satellite,
  Activity,
} from 'lucide-react';
import './LoginView.css';

export function LoginView({ onLogin }) {
  const [username, setUsername] = useState('admin@satra.ai');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const videoRef = useRef(null);

  // Ensure continuous autoplay and looping on mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        // Handled silently for non-interactive autoplay policy
      });
    }
  }, []);

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const trimmed = (username || '').trim();
    if (!trimmed) {
      setErrorMessage('Please enter your SATRA username or email.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      if (onLogin) {
        onLogin({
          email: trimmed,
          name: trimmed.includes('@') ? trimmed.split('@')[0] : trimmed,
          role: 'SATRA Flight Deck Commander',
          remember: rememberMe,
        });
      }
    }, 450);
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onLogin) {
        onLogin({
          email: 'operator@satra.ai',
          name: 'SATRA Operator',
          role: 'SATRA Flight Deck Commander',
          remember: true,
        });
      }
    }, 450);
  };

  const handleForgotPassword = () => {
    alert('SATRA Authentication Notice:\n\nPassword reset requests must be authorized through the Flight Deck Administrator. Please contact security@satra.ai.');
  };

  const handleCreateAccount = () => {
    alert('SATRA Access Registration:\n\nOperator clearance requires system administrator provisioning. Please contact operations@satra.ai.');
  };

  return (
    <div className="satra-login-root">
      {/* ==================================================================
          1. BACKGROUND: CONTINUOUS MOVING DARK GALAXY VIDEO (MotionBGS)
          ================================================================== */}
      <video
        ref={videoRef}
        className="satra-bg-video"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        <source src="/backgrounds/dark-galaxy.mp4" type="video/mp4" />
        <source src="/dark-galaxy.mp4" type="video/mp4" />
      </video>

      {/* Subtle Dark Overlay to preserve galaxy motion while boosting text contrast */}
      <div className="satra-bg-overlay" aria-hidden="true" />

      {/* ==================================================================
          2. 60 / 40 SPLIT LAYOUT WRAPPER
          ================================================================== */}
      <main className="satra-login-wrapper" aria-label="SATRA System Authentication">
        {/* LEFT SIDE (60%): Moving Galaxy + SATRA Branding & Monitoring Info */}
        <section className="satra-visual-panel" aria-labelledby="satra-hero-title">
          {/* Top subtle eyebrow */}
          <div className="satra-visual-eyebrow">
            <Globe size={18} aria-hidden="true" />
            <span>AI SATELLITE INTELLIGENCE &bull; DEEP SPACE MONITORING</span>
          </div>

          {/* Central Hero Branding */}
          <div className="satra-visual-branding">
            <span className="satra-brand-rule" aria-hidden="true" />
            <h1 id="satra-hero-title" className="satra-hero-title">SATRA</h1>
            <p className="satra-hero-subtitle">THERMAL RISK ANALYSIS</p>
            <p className="satra-hero-description">
              AI-based detection, thermal anomaly classification, and continuous spaceborne monitoring of industrial infrastructure and wildfires.
            </p>

            {/* Subtle monitoring telemetry chips */}
            <div className="satra-telemetry-chips">
              <span className="satra-telemetry-chip">
                <Radio size={12} style={{ color: '#10B981' }} />
                <span>LIVE GALAXY TELEMETRY</span>
              </span>
              <span className="satra-telemetry-chip">
                <Satellite size={12} style={{ color: '#38BDF8' }} />
                <span>VIIRS &bull; MODIS ACTIVE</span>
              </span>
              <span className="satra-telemetry-chip">
                <Activity size={12} style={{ color: '#F59E0B' }} />
                <span>REAL-TIME ANALYSIS</span>
              </span>
            </div>
          </div>

          {/* Bottom subtle monitoring status */}
          <div className="satra-visual-footer">
            <div className="satra-telemetry-status-tag">
              <span className="satra-pulse-dot" aria-hidden="true" />
              <span>DEEP SPACE MONITORING ACTIVE &bull; ORBITAL FEED NOMINAL</span>
            </div>
            <span className="satra-build-tag">SATRA v2.0.0-sci</span>
          </div>
        </section>

        {/* RIGHT SIDE (40%): Dark SATRA Login Panel */}
        <section className="satra-login-panel" aria-labelledby="satra-login-title">
          {/* Header Brand */}
          <header className="satra-panel-brand">
            <div className="satra-emblem-badge" aria-hidden="true">
              <Globe className="satra-emblem-icon" size={24} />
            </div>
            <div>
              <p className="satra-brand-title">SATRA</p>
              <p className="satra-brand-caption">THERMAL INTELLIGENCE</p>
            </div>
          </header>

          <div className="satra-login-content">
            <header className="satra-form-header">
              <h2 id="satra-login-title" className="satra-welcome-title">Welcome Back</h2>
              <p className="satra-brand-tagline">
                Sign in to access the SATRA Thermal Intelligence Platform
              </p>
            </header>

            {/* Error Alert Banner */}
            {errorMessage && (
              <div className="satra-error-alert" role="alert">
                <AlertCircle size={16} className="satra-error-icon" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form className="satra-form" onSubmit={handleSubmit} noValidate>
              {/* Username / Email Input */}
              <div className="satra-field-group">
                <label htmlFor="satra-username" className="satra-field-label">
                  EMAIL / USERNAME
                </label>
                <div className="satra-input-box">
                  <User size={16} className="satra-input-icon" aria-hidden="true" />
                  <input
                    id="satra-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter email or username"
                    className="satra-input-field"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="satra-field-group">
                <label htmlFor="satra-password" className="satra-field-label">
                  PASSWORD
                </label>
                <div className="satra-input-box">
                  <Lock size={16} className="satra-input-icon" aria-hidden="true" />
                  <input
                    id="satra-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="satra-input-field satra-password-field"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="satra-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="satra-password"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Options Row */}
              <div className="satra-options-row">
                <label className="satra-remember-wrap">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="satra-checkbox"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="satra-forgot-link"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="satra-submit-btn"
              >
                {isLoading ? (
                  <span className="satra-btn-loading">
                    <span className="satra-btn-spinner" aria-hidden="true" />
                    <span>AUTHENTICATING...</span>
                  </span>
                ) : (
                  <>
                    <span>SIGN IN</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>

              {/* OR Divider */}
              <div className="satra-divider">
                <span className="satra-divider-line" />
                <span className="satra-divider-text">OR</span>
                <span className="satra-divider-line" />
              </div>

              {/* Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="satra-google-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Create Account Link */}
              <div className="satra-create-account-wrap">
                <span className="satra-no-account-text">Don't have an account?</span>{' '}
                <button
                  type="button"
                  onClick={handleCreateAccount}
                  className="satra-signup-link"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Status Footer */}
          <footer className="satra-panel-footer">
            <div className="satra-gateway-status">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>SECURE CONNECTION</span>
            </div>
            <div className="satra-system-indicator">
              <span className="satra-status-dot" aria-hidden="true" />
              <span>SATRA AI CORE ONLINE</span>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default LoginView;
