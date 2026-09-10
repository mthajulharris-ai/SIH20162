import React from 'react';
import {
  LayoutDashboard,
  MapPin,
  Flame,
  AlertTriangle,
  BarChart3,
  History,
  Satellite,
  Radio,
  Cpu,
  Globe,
} from 'lucide-react';

export function Sidebar({ currentTab, setCurrentTab, alertCount = 0, isBackendHealthy = true }) {
  const navItems = [
    { id: 'gis-map', label: '3D Earth & GIS', icon: Globe },
    { id: 'overview', label: 'Telemetry Overview', icon: LayoutDashboard },
    { id: 'detections', label: 'Thermal Detections', icon: Flame },
    { id: 'alerts', label: 'Active Alerts', icon: AlertTriangle, badge: alertCount },
    { id: 'analytics', label: 'Analytics & KPIs', icon: BarChart3 },
    { id: 'history', label: 'Historical Archive', icon: History },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-icon">
          <Globe size={20} style={{ color: 'var(--accent-cyan)' }} />
        </div>
        <div>
          <div className="brand-title">SENTRIX</div>
          <div className="brand-subtitle">Satellite Thermal Intelligence</div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="nav-section">
        <div className="nav-label">Monitoring System</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
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
              <Radio size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              FastAPI Backend
            </span>
            <span
              className="telemetry-val"
              style={{ color: isBackendHealthy ? 'var(--accent-emerald)' : 'var(--accent-red)' }}
            >
              {isBackendHealthy ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">
              <Cpu size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Database
            </span>
            <span className="telemetry-val">SQLite (Local)</span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">
              <Cpu size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              AI Model
            </span>
            <span className="telemetry-val" style={{ color: 'var(--accent-cyan)' }}>v2.0.0-prototype</span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">
              <Satellite size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Constellation
            </span>
            <span className="telemetry-val">VIIRS / MODIS</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
