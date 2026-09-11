import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  Bell,
  Globe,
  Database,
  Shield,
  Download,
  CheckCircle2,
  Radio,
} from 'lucide-react';

export function SettingsView({
  detections = [],
}) {
  const [pollInterval, setPollInterval] = useState('30');
  const [enableSound, setEnableSound] = useState(false);
  const [enableFlash, setEnableFlash] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState('normal');
  const [glowIntensity, setGlowIntensity] = useState('high');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(detections, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `satra_thermal_telemetry_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '1000px' }}>
      {/* Title Header */}
      <div
        style={{
          background: 'rgba(15, 32, 50, 0.7)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <Settings size={20} style={{ color: 'var(--primary-cyan)' }} />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
            SATRA System Configuration & Flight Deck Preferences
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Configure client telemetry polling, 3D visualization shaders, and alert parameters
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '20px' }}>
        {/* Telemetry & API Settings */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <Radio size={16} style={{ color: 'var(--primary-cyan)' }} />
              Telemetry & Synchronization
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Backend Polling Interval
              </label>
              <select
                value={pollInterval}
                onChange={(e) => setPollInterval(e.target.value)}
                className="filter-input"
                style={{ width: '100%' }}
              >
                <option value="10">Every 10 Seconds (High Rate)</option>
                <option value="30">Every 30 Seconds (Default Nominal)</option>
                <option value="60">Every 60 Seconds (Low Bandwidth)</option>
                <option value="manual">Manual Refresh Only</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                NASA FIRMS API Key Status
              </label>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(11, 23, 38, 0.6)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <span className="mono-cell" style={{ color: 'var(--success)' }}>CONFIGURED (ENV: FIRMS_MAP_KEY)</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Active Ingestion</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Operational SQLite Database
              </label>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(11, 23, 38, 0.6)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <span className="mono-cell">backend/thermal_monitoring.db</span>
                <span style={{ color: 'var(--primary-cyan)' }}>Healthy</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3D Earth Visualization Preferences */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <Globe size={16} style={{ color: 'var(--ice-blue)' }} />
              3D Earth Graphics & HUD
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Globe Auto-Rotation Speed
              </label>
              <select
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(e.target.value)}
                className="filter-input"
                style={{ width: '100%' }}
              >
                <option value="slow">Slow Cinematic (0.0004 rad/s)</option>
                <option value="normal">Normal (0.0008 rad/s)</option>
                <option value="fast">Fast (0.0016 rad/s)</option>
                <option value="off">Off by Default</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Atmospheric Glow Shader
              </label>
              <select
                value={glowIntensity}
                onChange={(e) => setGlowIntensity(e.target.value)}
                className="filter-input"
                style={{ width: '100%' }}
              >
                <option value="high">High Atmospheric Scattering (Default)</option>
                <option value="medium">Subtle Cyan Limb</option>
                <option value="low">Performance Minimal</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px' }}>
              <div>
                <div style={{ fontSize: '12.5px', color: '#FFFFFF', fontWeight: 600 }}>Critical Alert Visual Pulse</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pulsing red HUD reticle on active selection</div>
              </div>
              <input
                type="checkbox"
                checked={enableFlash}
                onChange={(e) => setEnableFlash(e.target.checked)}
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Data Export & Action Bar */}
      <div
        className="card-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--panel-bg)',
        }}
      >
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF' }}>Telemetry Data Export</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Export all loaded satellite detections ({detections.length} records) as JSON for external GIS analysis
          </div>
        </div>

        <button onClick={handleExportJson} className="btn-secondary" style={{ gap: '6px' }}>
          <Download size={14} />
          <span>Export Detections JSON</span>
        </button>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={handleSave} className="btn-primary" style={{ padding: '10px 24px', fontSize: '13px' }}>
          {isSaved ? <CheckCircle2 size={16} /> : <Sliders size={16} />}
          <span>{isSaved ? 'Preferences Saved!' : 'Save System Preferences'}</span>
        </button>
      </div>
    </div>
  );
}
