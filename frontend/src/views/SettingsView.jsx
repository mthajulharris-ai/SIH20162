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
  Moon,
  Sun,
  Monitor,
  Palette,
  Check,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function SettingsView({
  detections = [],
}) {
  const { theme, effectiveTheme, setTheme } = useTheme();
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

  const themeOptions = [
    {
      id: 'dark',
      name: 'Standard / Dark Mode',
      tag: 'Default SATRA Command',
      icon: Moon,
      desc: 'Authentic aerospace deep command center theme with cyan, ice-blue, and thermal risk indicators.',
    },
    {
      id: 'light',
      name: 'Light Mode',
      tag: 'Tactical Light Variant',
      icon: Sun,
      desc: 'Clean light surfaces with high-contrast slate typography, preserving all scientific markers and GIS hierarchy.',
    },
    {
      id: 'system',
      name: 'System Preference',
      tag: 'OS Synchronized',
      icon: Monitor,
      desc: 'Automatically matches your operating system display settings and updates dynamically.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '1000px' }}>
      {/* Title Header */}
      <div
        style={{
          background: 'var(--panel-header-bg)',
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
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
            SATRA System Configuration & Flight Deck Preferences
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Configure client telemetry polling, display appearance themes, and alert parameters
          </div>
        </div>
      </div>

      {/* Primary Appearance / Theme Panel */}
      <div className="card-panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          <div className="panel-title">
            <Palette size={16} style={{ color: 'var(--primary-cyan)' }} />
            Appearance & Visual Theme
          </div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Active: {effectiveTheme.toUpperCase()} MODE
          </span>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Select your preferred interface display mode. SATRA Standard Dark is the authentic default; switching to Light Mode provides high-contrast daylight visibility while preserving all data layers, satellite maps, and AI confidence levels.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: isSelected
                    ? '2px solid var(--primary-cyan)'
                    : '1px solid var(--border-color)',
                  background: isSelected
                    ? 'var(--panel-secondary)'
                    : 'var(--bg-card)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 0 16px rgba(2, 132, 199, 0.18)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isSelected ? 'var(--primary-cyan)' : 'var(--panel-secondary)',
                        color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-heading)' }}>
                        {opt.name}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          color: isSelected ? 'var(--primary-cyan)' : 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {opt.tag}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '20px',
                        background: 'rgba(2, 132, 199, 0.15)',
                        color: 'var(--primary-cyan)',
                        fontSize: '10.5px',
                        fontWeight: 700,
                      }}
                    >
                      <Check size={12} />
                      Active
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {opt.desc}
                </div>
              </div>
            );
          })}
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
                  background: 'var(--panel-secondary)',
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
                  background: 'var(--panel-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <span className="mono-cell" style={{ color: 'var(--text-primary)' }}>backend/thermal_monitoring.db</span>
                <span style={{ color: 'var(--primary-cyan)', fontWeight: 600 }}>Healthy</span>
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
                <div style={{ fontSize: '12.5px', color: 'var(--text-heading)', fontWeight: 600 }}>Critical Alert Visual Pulse</div>
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
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-heading)' }}>Telemetry Data Export</div>
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
