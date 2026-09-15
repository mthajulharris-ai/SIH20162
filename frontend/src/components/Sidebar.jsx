import React from 'react';
import {
  LayoutDashboard,
  Globe,
  Flame,
  Crosshair,
  ShieldAlert,
  BarChart3,
  Map,
  Satellite,
  Cpu,
  Radio,
} from 'lucide-react';

export function Sidebar({ currentTab, setCurrentTab, alertCount = 0, isBackendHealthy = true, connectionStatus }) {
  const status = connectionStatus || (isBackendHealthy ? 'online' : isBackendHealthy === false ? 'offline' : 'checking');
  const isOnline = status === 'online';
  const isChecking = status === 'checking';
  const statusColor = isOnline ? 'var(--success)' : isChecking ? '#F59E0B' : 'var(--critical-red)';
  const statusText = isOnline ? 'CONNECTED' : isChecking ? 'CHECKING...' : 'DISCONNECTED';

  const navItems = [
    { id: 'overview', num: '01', label: 'Overview', icon: LayoutDashboard },
    { id: 'earth-intel', num: '02', label: 'Earth Intelligence', icon: Globe },
    { id: 'thermal-intel', num: '03', label: 'Thermal Intelligence', icon: Flame },
    { id: 'detection-explorer', num: '04', label: 'Detection Explorer', icon: Crosshair },
    { id: 'alerts', num: '05', label: 'Alerts', icon: ShieldAlert, badge: alertCount },
    { id: 'analytics', num: '06', label: 'Analytics', icon: BarChart3 },
    { id: 'gis-investigation', num: '07', label: 'GIS Investigation', icon: Map },
    { id: 'satellite-data', num: '08', label: 'Satellite Data', icon: Satellite },
    { id: 'ai-intelligence', num: '09', label: 'AI Intelligence', icon: Cpu },
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
                  color: isActive ? '#FFFFFF' : 'inherit',
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
      </div>
    </aside>
  );
}
