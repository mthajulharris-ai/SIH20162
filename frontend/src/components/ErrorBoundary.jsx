import React from 'react';
import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

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
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            width: '100vw',
            backgroundColor: '#050B14',
            color: '#F4F7FA',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '680px',
              width: '100%',
              backgroundColor: '#0B1726',
              border: '1px solid rgba(255, 69, 58, 0.45)',
              borderRadius: '12px',
              padding: '36px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 69, 58, 0.2)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
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
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#F4F7FA', letterSpacing: '0.02em' }}>
                  SATRA Command Telemetry Interruption
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9AAFC2' }}>
                  A UI component encountered an unexpected runtime anomaly.
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div
              style={{
                backgroundColor: 'rgba(5, 11, 20, 0.85)',
                border: '1px solid rgba(120, 200, 240, 0.16)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                fontSize: '12px',
                color: '#FF8A00',
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#6EDCFF' }}>
                <Terminal size={14} />
                <span style={{ fontWeight: 600 }}>Diagnostic Log:</span>
              </div>
              {this.state.error?.toString() || 'Unknown runtime error'}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
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
                Reload Command Deck
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid rgba(120, 200, 240, 0.25)',
                  background: 'rgba(15, 32, 50, 0.6)',
                  color: '#8DE7FF',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Attempt In-Place Recovery
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
