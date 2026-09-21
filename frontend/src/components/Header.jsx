import React, { useState, useEffect, useRef } from 'react';
import satraLogoDark from '../assets/satra-logo-dark.jpg';
import satraLogoLight from '../assets/satra-logo-light.jpg';
import {
  RefreshCw,
  Search,
  Bell,
  Sliders,
  Shield,
  ExternalLink,
  Flame,
  Globe,
  Radio,
  User,
  Settings,
  UploadCloud,
  Bot,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { StatusBadge, ClassBadge } from './StatusBadge';
import { useLiveClock } from '../services/useLiveClock';
import { useTheme } from '../context/ThemeContext';

export function Header({
  pageTitle,
  isBackendHealthy,
  connectionStatus,
  onRefresh,
  detections = [],
  alerts = [],
  onFocusDetection,
  onNavigate,
  onOpenUploadModal,
  onToggleChatbot,
  onOpenAiAssistant,
  isSidebarOpen = false,
  onToggleSidebar,
}) {
  const { dateStr, timeStr } = useLiveClock();
  const { effectiveTheme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const notifContainerRef = useRef(null);

  // Handle clicking outside of search results or notifications popover
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter search results
  const searchResults = searchQuery.trim()
    ? detections
        .filter((d) => {
          const q = searchQuery.toLowerCase();
          const matchId = String(d.id).includes(q);
          const matchCoord = `${d.latitude},${d.longitude}`.includes(q);
          const matchClass = (d.predicted_class || '').toLowerCase().includes(q);
          const matchSource = (d.source || '').toLowerCase().includes(q);
          const matchDate = (d.acq_date || '').includes(q);
          return matchId || matchCoord || matchClass || matchSource || matchDate;
        })
        .slice(0, 6)
    : [];

  const unverifiedAlerts = alerts.filter(
    (a) => a.verification_status === 'REQUIRES_VERIFICATION' || a.alert_level === 'CRITICAL'
  );

  return (
    <header className="top-header">
      {/* Left: Hamburger Menu Toggle + SATRA Logo & Branding */}
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          onClick={onToggleSidebar}
          className={`satra-hamburger-btn ${isSidebarOpen ? 'active' : ''}`}
          aria-label={isSidebarOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          title={isSidebarOpen ? 'Close Navigation Menu (☰)' : 'Open Navigation Menu (☰)'}
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="header-logo-frame">
          <img
            src={satraLogoDark}
            alt="SATRA Logo"
            className="header-logo-img satra-logo-dark"
          />
          <img
            src={satraLogoLight}
            alt="SATRA Logo"
            className="header-logo-img satra-logo-light"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
              SATRA
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--primary-cyan)',
                letterSpacing: '0.08em',
                background: 'rgba(56, 189, 248, 0.12)',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              THERMAL RISK ANALYSIS
            </span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            AI Satellite Intelligence • Turning satellite data into a safer tomorrow
          </div>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="satra-search-container" ref={searchContainerRef}>
        <Search
          size={14}
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          className="satra-search-input"
          placeholder="Search location, detection ID, or keyword..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsSearchOpen(true);
          }}
          onFocus={() => setIsSearchOpen(true)}
        />
        {isSearchOpen && searchResults.length > 0 && (
          <div className="satra-search-results">
            <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--ice-blue)', textTransform: 'uppercase' }}>
              Matching Thermal Hotspots ({searchResults.length})
            </div>
            {searchResults.map((d) => (
              <div
                key={d.id}
                className="satra-search-item"
                onClick={() => {
                  if (onFocusDetection) onFocusDetection(d);
                  setIsSearchOpen(false);
                  setSearchQuery('');
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Flame size={12} style={{ color: 'var(--thermal-red)' }} />
                    <strong style={{ fontSize: '11.5px', color: '#FFFFFF' }}>#{d.id} {d.predicted_class}</strong>
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}° &bull; {d.source || 'VIIRS'} &bull; {d.frp ? `${parseFloat(d.frp).toFixed(1)} MW` : 'N/A'}
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '10px', gap: '4px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onFocusDetection) onFocusDetection(d);
                    setIsSearchOpen(false);
                    setSearchQuery('');
                  }}
                >
                  <Globe size={11} />
                  <span>Focus</span>
                </button>
              </div>
            ))}
          </div>
        )}
        {isSearchOpen && searchQuery.trim().length > 1 && searchResults.length === 0 && (
          <div
            className="satra-search-results"
            style={{
              padding: '12px 14px',
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            No satellite thermal detections found in the selected area for the selected time range.
          </div>
        )}
      </div>

      {/* Right Controls & Telemetry */}
      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Dynamic Date & Time */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {dateStr}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {timeStr}
          </div>
        </div>

        {/* Real-Time Shared Backend Health Status Pill */}
        {(() => {
          const isChecking = connectionStatus === 'checking' || connectionStatus === 'connecting';
          const isOnline = connectionStatus === 'online';

          let statusColor = '#10B981';
          let statusBg = 'rgba(16, 185, 129, 0.12)';
          let statusBorder = '1px solid rgba(16, 185, 129, 0.35)';
          let headerTitle = 'SYSTEM ONLINE';
          let headerSub = 'FastAPI Connected';

          if (isChecking) {
            statusColor = '#F59E0B';
            statusBg = 'rgba(245, 158, 11, 0.12)';
            statusBorder = '1px solid rgba(245, 158, 11, 0.35)';
            headerTitle = 'SYSTEM CONNECTING...';
            headerSub = 'Checking Connection...';
          } else if (!isOnline) {
            statusColor = '#EF4444';
            statusBg = 'rgba(239, 68, 68, 0.12)';
            statusBorder = '1px solid rgba(239, 68, 68, 0.35)';
            headerTitle = 'SYSTEM OFFLINE';
            headerSub = 'FastAPI Disconnected';
          }

          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: statusBg,
                border: statusBorder,
                borderRadius: '20px',
                padding: '5px 12px',
                boxShadow: isOnline
                  ? '0 0 12px rgba(16, 185, 129, 0.2)'
                  : isChecking
                  ? '0 0 12px rgba(245, 158, 11, 0.2)'
                  : '0 0 12px rgba(239, 68, 68, 0.2)',
                transition: 'all 0.25s ease',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: statusColor,
                  boxShadow: `0 0 8px ${statusColor}`,
                  animation: isChecking ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>
                  {headerTitle}
                </span>
                <span style={{ fontSize: '9px', color: isOnline ? 'var(--text-muted)' : isChecking ? '#FCD34D' : '#F87171' }}>
                  {headerSub}
                </span>
              </div>
            </div>
          );
        })()}



        {/* Notifications Bell */}
        <div style={{ position: 'relative' }} ref={notifContainerRef}>
          <button
            className="satra-icon-btn"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            title="Thermal incident alerts"
          >
            <Bell size={14} />
            {unverifiedAlerts.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--thermal-red)',
                  color: '#FFFFFF',
                  fontSize: '9px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--bg-primary)',
                }}
              >
                {unverifiedAlerts.length}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="satra-notif-popover">
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-heading)' }}>
                  Incident Alerts ({unverifiedAlerts.length})
                </span>
                {onNavigate && (
                  <button
                    onClick={() => {
                      onNavigate('alerts');
                      setIsNotifOpen(false);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '11px', cursor: 'pointer' }}
                  >
                    View Stream &rarr;
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {unverifiedAlerts.length > 0 ? (
                  unverifiedAlerts.slice(0, 4).map((a) => (
                    <div
                      key={a.id}
                      style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      onClick={() => {
                        if (onNavigate) onNavigate('alerts');
                        setIsNotifOpen(false);
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <StatusBadge status={a.alert_level} type="severity" />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>#{a.id}</span>
                      </div>
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-heading)' }}>{a.title}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: 2 }}>{a.message}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                    No pending unverified alerts.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>


        {/* Theme / Light Mode Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="satra-icon-btn"
          title={effectiveTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{ color: effectiveTheme === 'dark' ? '#FDE047' : '#38BDF8' }}
        >
          {effectiveTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* SATRA Copilot Quick Launcher */}
        {onToggleChatbot && (
          <button
            className="satra-icon-btn"
            onClick={onToggleChatbot}
            title="SATRA AI Satellite Copilot"
            style={{ color: 'var(--primary-cyan, #06B6D4)' }}
          >
            <Bot size={15} />
          </button>
        )}

        {/* Settings Navigation Shortcut */}
        {onNavigate && (
          <button
            className="satra-icon-btn"
            onClick={() => onNavigate('settings')}
            title="Flight deck settings"
          >
            <Settings size={14} />
          </button>
        )}

        {/* Sync Refresh Button */}
        {onRefresh && (
          <button onClick={onRefresh} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11.5px' }} title="Sync data from FastAPI backend">
            <RefreshCw size={12} />
          </button>
        )}

        {/* User / Profile Area: SATRA Team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingLeft: '10px',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
          }}
          title="SATRA Team Operator"
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 100%)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 0 10px rgba(2, 132, 199, 0.3)',
            }}
          >
            <User size={15} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#FFFFFF' }}>SATRA</span>
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>Team</span>
          </div>
        </div>
      </div>
    </header>
  );
}
