import React, { useState, useRef, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';
import './LoginView.css';

export function LoginView({ onLogin }) {
  const [username, setUsername] = useState('admin@sentrix.edu');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [videoError, setVideoError] = useState(false);

  const videoRef = useRef(null);

  // Ensure seamless autoplay on mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        // Autoplay may be restricted in non-user-interacted contexts
        console.log('Video autoplay note:', err);
      });
    }
  }, []);

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const trimmed = (username || '').trim();
    if (!trimmed) {
      setErrorMessage('Please enter your username or email.');
      return;
    }
    if (!password || password.length < 4) {
      setErrorMessage('Please enter your access password (min 4 characters).');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    setTimeout(() => {
      setIsLoading(false);
      if (onLogin) {
        onLogin({
          email: trimmed,
          name: trimmed.includes('@') ? trimmed.split('@')[0] : trimmed,
          role: 'SENTRIX Security Controller',
          remember: rememberMe,
        });
      }
    }, 450);
  };

  return (
    <div className={`sentrix-login-root ${videoError ? 'fallback-bg' : ''}`}>
      {/* ==================================================================
          1. BACKGROUND: EXACT DARK GALAXY VIDEO (MotionBGS)
          ================================================================== */}
      {!videoError && (
        <video
          ref={videoRef}
          className="sentrix-bg-video"
          autoPlay
          loop
          muted
          playsInline
          poster="/dark-galaxy-poster.png"
          onError={() => setVideoError(true)}
          aria-hidden="true"
        >
          <source src="/backgrounds/dark-galaxy.mp4" type="video/mp4" />
          <source src="/dark-galaxy.mp4" type="video/mp4" />
        </video>
      )}

      {/* ==================================================================
          2. VERY SUBTLE DARK TRANSPARENT OVERLAY
          ================================================================== */}
      <div className="sentrix-bg-overlay" aria-hidden="true" />

      {/* ==================================================================
          3. SENTRIX LOGIN CARD (Centered Glassmorphism)
          ================================================================== */}
      <div className="sentrix-login-wrapper">
        <main className="sentrix-login-card" aria-label="SENTRIX System Authentication">
          {/* Card Header & Branding */}
          <header className="sentrix-card-header">
            <div className="sentrix-emblem-badge" aria-hidden="true">
              <Shield className="sentrix-emblem-icon" size={22} />
            </div>
            <h1 className="sentrix-brand-title">SENTRIX</h1>
            <p className="sentrix-brand-tagline">
              Smart College Entrance Substance Screening & Safety Alert System
            </p>
          </header>

          {/* Error Banner */}
          {errorMessage && (
            <div className="sentrix-error-alert" role="alert">
              <AlertCircle size={16} className="sentrix-error-icon" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form className="sentrix-form" onSubmit={handleSubmit} noValidate>
            {/* Username Input */}
            <div className="sentrix-field-group">
              <label htmlFor="sentrix-username" className="sentrix-field-label">
                USERNAME / OPERATOR ID
              </label>
              <div className="sentrix-input-box">
                <User size={16} className="sentrix-input-icon" aria-hidden="true" />
                <input
                  id="sentrix-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username or email"
                  className="sentrix-input-field"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="sentrix-field-group">
              <label htmlFor="sentrix-password" className="sentrix-field-label">
                PASSWORD
              </label>
              <div className="sentrix-input-box">
                <Lock size={16} className="sentrix-input-icon" aria-hidden="true" />
                <input
                  id="sentrix-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="sentrix-input-field"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="sentrix-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Options Row */}
            <div className="sentrix-options-row">
              <label className="sentrix-remember-wrap">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sentrix-checkbox"
                />
                <span>Remember session</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Access credentials are provided by the SENTRIX Safety Administration.')}
                className="sentrix-forgot-link"
              >
                Help / Access?
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="sentrix-submit-btn"
            >
              {isLoading ? (
                <span className="sentrix-btn-loading">
                  <span className="sentrix-btn-spinner" aria-hidden="true" />
                  <span>AUTHENTICATING...</span>
                </span>
              ) : (
                <span>SIGN IN TO SENTRIX</span>
              )}
            </button>
          </form>

          {/* Status Telemetry Footer */}
          <footer className="sentrix-card-footer">
            <div className="sentrix-telemetry-status">
              <span className="sentrix-status-dot" aria-hidden="true" />
              <span>SECURE ENCRYPTED GATEWAY</span>
            </div>
            <div className="sentrix-system-indicator">
              <span>SYSTEM READY</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default LoginView;
