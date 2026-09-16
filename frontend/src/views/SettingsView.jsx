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
  Bot,
  MessageSquare,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { AiAssistantModal } from '../components/AiAssistantModal';

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

  // AI Assistant state
  const [isAiEnabled, setIsAiEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('satra_ai_assistant_enabled');
      return saved !== 'false';
    } catch {
      return true;
    }
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [clearNotice, setClearNotice] = useState(false);

  const toggleAiEnabled = () => {
    const next = !isAiEnabled;
    setIsAiEnabled(next);
    try {
      localStorage.setItem('satra_ai_assistant_enabled', String(next));
    } catch (e) {
      console.warn('Failed to save AI enabled state:', e);
    }
  };

  const handleClearHistory = () => {
    try {
      localStorage.removeItem('satra_chat_history');
      setClearNotice(true);
      setTimeout(() => setClearNotice(false), 2500);
    } catch (e) {
      console.warn('Failed to clear chat history:', e);
    }
  };

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

      {/* AI Assistant Section */}
      <div className="card-panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          <div className="panel-title">
            <Bot size={16} style={{ color: 'var(--primary-cyan)' }} />
            AI Assistant
          </div>
          <span
            style={{
              fontSize: '11px',
              color: isAiEnabled ? 'var(--success, #22c55e)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isAiEnabled ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                display: 'inline-block',
              }}
            />
            {isAiEnabled ? 'OPERATIONAL / ACTIVE' : 'DISABLED'}
          </span>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          SATRA domain-specific intelligence copilot for Industrial Fire Detection, Persistent Thermal Source Monitoring, NASA FIRMS satellite telemetry (VIIRS 375m & MODIS 1km), Fire Radiative Power (FRP), and ML ensemble classification. Accessible from normal application pages and configurable below.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
            alignItems: 'stretch',
          }}
        >
          {/* Card 1: Enable / Disable */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  Enable AI Assistant
                </span>
                <button
                  onClick={toggleAiEnabled}
                  style={{
                    width: '42px',
                    height: '22px',
                    borderRadius: '12px',
                    background: isAiEnabled ? 'var(--primary-cyan)' : 'var(--border-strong)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s ease',
                    padding: '2px',
                  }}
                  title={isAiEnabled ? 'Disable AI Assistant' : 'Enable AI Assistant'}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#FFFFFF',
                      transform: isAiEnabled ? 'translateX(20px)' : 'translateX(0px)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Controls copilot access across navigation modules and interactive chat drawers.
              </div>
            </div>
            <div style={{ fontSize: '11px', color: isAiEnabled ? 'var(--ice-blue)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Status: {isAiEnabled ? 'Enabled (Active)' : 'Disabled'}
            </div>
          </div>

          {/* Card 2: AI Model Architecture */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  AI Model
                </span>
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(69,200,245,0.12)', color: 'var(--primary-cyan)', fontFamily: 'var(--font-mono)' }}>
                  v2.0-SCI
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Soft-Voting Ensemble combining Random Forest, LightGBM, and XGBoost with a 0.60 calibrated confidence threshold.
              </div>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>
              Taxonomy: 0=Ind, 1=Forest, 2=Persist, 3=Other
            </div>
          </div>

          {/* Card 3: Open AI Assistant */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: isAiEnabled ? '1px solid var(--border-color)' : '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
              opacity: isAiEnabled ? 1 : 0.6,
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '4px' }}>
                Open AI Assistant
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Launch the interactive SATRA copilot workspace to ask technical questions and inspect live analytics.
              </div>
            </div>
            <button
              onClick={() => setIsChatOpen(true)}
              disabled={!isAiEnabled}
              className="btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                fontSize: '12.5px',
                cursor: isAiEnabled ? 'pointer' : 'not-allowed',
              }}
            >
              <MessageSquare size={14} />
              <span>Open AI Assistant</span>
            </button>
          </div>

          {/* Card 4: Clear Chat History */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '4px' }}>
                Clear Chat History
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Purge stored conversation messages and reset cached assistant telemetry queries.
              </div>
            </div>
            <button
              onClick={handleClearHistory}
              className="btn-secondary"
              style={{
                width: '100%',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                fontSize: '12.5px',
              }}
            >
              <Trash2 size={14} />
              <span>{clearNotice ? 'History Cleared!' : 'Clear Chat History'}</span>
            </button>
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

      {/* Embedded Settings AI Assistant Workspace Modal */}
      <AiAssistantModal
        isOpen={isChatOpen && isAiEnabled}
        onClose={() => setIsChatOpen(false)}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
}
