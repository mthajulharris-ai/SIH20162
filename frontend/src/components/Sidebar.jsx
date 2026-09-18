import React from 'react';
import {
  LayoutDashboard,
  Route,
  Search,
  Radio,
  ShieldAlert,
  History,
  BarChart3,
  Globe,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export function Sidebar({ currentTab, setCurrentTab, alertCount = 0, isBackendHealthy = false, connectionStatus, onLogout }) {
  const isOnline = connectionStatus === 'online' || (isBackendHealthy && connectionStatus !== 'offline');
  const statusColor = isOnline ? 'var(--success)' : 'var(--critical-red)';
  const statusText = isOnline ? 'CONNECTED' : 'DISCONNECTED';

  const navItems = [
    { id: 'overview', num: '01', label: 'Overview', icon: LayoutDashboard },
    { id: 'path-intel', num: '02', label: 'Path Intelligence', icon: Route },
    { id: 'investigate', num: '03', label: 'Investigate', icon: Search },
    { id: 'live-monitoring', num: '04', label: 'Live Monitoring', icon: Radio },
    { id: 'alerts', num: '05', label: 'Alerts', icon: ShieldAlert, badge: alertCount },
    { id: 'history', num: '06', label: 'History', icon: History },
    { id: 'analytics', num: '07', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', num: '08', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      {/* SATRA Master Brand Header */}
      <div className="sidebar-header">
        <div className="brand-icon">
          <Globe size={22} style={{ color: '#FFFFFF' }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="brand-title">SATRA</div>
          <div className="brand-subtitle">Thermal Risk Analysis</div>
          <div className="brand-tagline">AI Satellite Intelligence</div>
        </div>
      </div>

      {/* Command Modules Navigation Deck */}
      <nav className="nav-section" style={{ gap: '4px', padding: '12px 10px' }}>
        <div className="nav-label">Command Modules</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '11px',
                padding: '9.5px 12px',
                borderRadius: '7px',
              }}
            >
              <span className="nav-num">{item.num}</span>
              <Icon
                size={16}
                style={{
                  color: isActive ? 'var(--primary-cyan)' : 'inherit',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--nav-item-active-color)' : 'inherit',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </span>
              {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>

      {/* System Telemetry Status Footer */}
      <div className="sidebar-footer">
        <div className="telemetry-card">
          <div className="telemetry-row">
            <span className="telemetry-label">
              <Radio size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: statusColor }} />
              FastAPI Core
            </span>
            <span
              className="telemetry-val"
              style={{ color: statusColor }}
            >
              {statusText}
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">
              <Cpu size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Model Version
            </span>
            <span className="telemetry-val" style={{ color: 'var(--primary-cyan)' }}>v2.0.0-sci</span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">
              <Satellite size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Constellation
            </span>
            <span className="telemetry-val" style={{ color: 'var(--ice-blue)' }}>VIIRS / MODIS</span>
          </div>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="sidebar-logout-btn"
            style={{
              marginTop: '10px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'rgba(255, 69, 58, 0.08)',
              border: '1px solid rgba(255, 69, 58, 0.25)',
              borderRadius: '6px',
              color: '#FF6B6B',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 69, 58, 0.18)';
              e.currentTarget.style.borderColor = 'rgba(255, 69, 58, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 69, 58, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 69, 58, 0.25)';
            }}
            title="Sign out of SATRA platform"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
