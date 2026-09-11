import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  PlusCircle,
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
} from 'lucide-react';
import { StatusBadge, ClassBadge } from './StatusBadge';

export function Header({
  pageTitle,
  isBackendHealthy,
  onRefresh,
  onIngestSample,
  isIngesting = false,
  detections = [],
  alerts = [],
  onFocusDetection,
  onNavigate,
  onOpenUploadModal,
}) {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const notifContainerRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setDateStr(now.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
      setTimeStr(`${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

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
      {/* Left: Page Title & Global View Identity */}
      <div className="header-left">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 className="page-heading" style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
            {pageTitle}
          </h1>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Global view of thermal risks on Earth
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
          placeholder="Search location (e.g., city, coordinates)"
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

        {/* System Online / All Services Operational Pill (Reference Match) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isBackendHealthy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: isBackendHealthy ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '20px',
            padding: '5px 12px',
            boxShadow: isBackendHealthy ? '0 0 12px rgba(16, 185, 129, 0.2)' : 'none',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isBackendHealthy ? '#10B981' : '#EF4444',
              boxShadow: isBackendHealthy ? '0 0 8px #10B981' : '0 0 8px #EF4444',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: isBackendHealthy ? '#10B981' : '#EF4444' }}>
              System Online
            </span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              {isBackendHealthy ? 'All Services Operational' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Quick Sample Ingest for Live Testing */}
        {onIngestSample && (
          <button
            onClick={onIngestSample}
            disabled={isIngesting}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '11.5px', gap: '5px', whiteSpace: 'nowrap' }}
            title="Ingests a real test hotspot via POST /api/v1/inference/predict-and-store"
          >
            <PlusCircle size={13} />
            <span>{isIngesting ? 'Ingesting...' : 'Test Hotspot'}</span>
          </button>
        )}

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
                <span style={{ fontWeight: 700, fontSize: '12px', color: '#FFFFFF' }}>
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
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#FFFFFF' }}>{a.title}</div>
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

        {/* Operator Profile Badge (SK - Reference Match) */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            boxShadow: '0 0 12px rgba(2, 132, 199, 0.4)',
            cursor: 'pointer',
            marginLeft: '4px',
          }}
          title="Operator: SK"
        >
          SK
        </div>
      </div>
    </header>
  );
}
