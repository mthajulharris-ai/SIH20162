import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Terminal, Home } from 'lucide-react';

/**
 * SATRA Mission Flight Controller Error Boundary
 * Catches runtime React render exceptions and renders a diagnostic recovery UI
 * rather than a completely blank dark screen.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SATRA UNHANDLED REACT ERROR]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoOverview = () => {
    window.location.hash = '/overview';
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
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
            minHeight: '420px',
            width: '100%',
            padding: '32px 20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '640px',
              width: '100%',
              backgroundColor: '#0B1726',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 69, 58, 0.45)',
              borderRadius: '12px',
              padding: '32px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 69, 58, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 69, 58, 0.15)',
                  border: '1px solid rgba(255, 69, 58, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={26} color="#FF453A" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#F4F7FA', letterSpacing: '0.02em' }}>
                  SATRA Command Telemetry Interruption
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9AAFC2' }}>
                  A UI component encountered an unexpected runtime anomaly.
                </p>
              </div>
            </div>

            {/* Diagnostic Log Box */}
            <div
              style={{
                backgroundColor: 'rgba(5, 11, 20, 0.85)',
                border: '1px solid rgba(120, 200, 240, 0.16)',
                borderRadius: '8px',
                padding: '14px 16px',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                fontSize: '12px',
                color: '#FF8A00',
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#6EDCFF' }}>
                <Terminal size={14} />
                <span style={{ fontWeight: 600 }}>Diagnostic Log:</span>
              </div>
              {this.state.error?.message || this.state.error?.toString() || 'Unknown runtime error'}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)',
                }}
              >
                <RefreshCw size={15} />
                <span>Reload Command Deck</span>
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid rgba(120, 200, 240, 0.25)',
                  background: 'rgba(15, 32, 50, 0.6)',
                  color: '#8DE7FF',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={15} />
                <span>Attempt In-Place Recovery</span>
              </button>
              <button
                onClick={this.handleGoOverview}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#CBD5E1',
                  fontWeight: 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <Home size={15} />
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

export default ErrorBoundary;
