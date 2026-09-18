import React from 'react';
import { ShieldAlert, RotateCcw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SATRA ErrorBoundary Caught]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.hash = '/overview';
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '32px 20px',
            width: '100%',
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(239, 68, 68, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#EF4444',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    margin: 0,
                    letterSpacing: '0.02em',
                  }}
                >
                  Dashboard View Notice
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                  A rendering issue occurred while displaying this module.
                </p>
              </div>
            </div>

            {this.state.error?.message && (
              <div
                style={{
                  background: 'rgba(2, 6, 23, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: '#F87171',
                  fontFamily: 'var(--font-mono, monospace)',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={this.handleReset}
                className="btn-primary"
                style={{
                  padding: '9px 16px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                }}
              >
                <RotateCcw size={14} />
                <span>Reload View</span>
              </button>
              <button
                onClick={() => {
                  window.location.hash = '/overview';
                  this.setState({ hasError: false, error: null });
                }}
                className="btn-secondary"
                style={{
                  padding: '9px 16px',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  color: '#CBD5E1',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Home size={14} />
                <span>Go to Overview</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
