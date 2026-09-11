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
  const [utcTime, setUtcTime] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const notifContainerRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
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
      {/* Left: Compact Page Title & Mission Identifier */}
      <div className="header-left">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--primary-cyan)' }}>
              SATRA
            </span>
            <span style={{ color: 'var(--border-color)', fontSize: '11px' }}>/</span>
            <h1 className="page-heading">{pageTitle}</h1>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
            AI Satellite Thermal Risk Analysis
          </div>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="satra-search-container" ref={searchContainerRef}>
        <Search
          size={13}
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          className="satra-search-input"
          placeholder="Search ID, Lat/Lon, Class, Satellite..."
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
      <div className="header-right">
        {/* Live UTC Clock */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {utcTime}
        </div>

        {/* AI Model Version Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', background: 'rgba(15, 32, 50, 0.7)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>AI:</span>
          <strong style={{ color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>2.0.0-sci</strong>
        </div>

        {/* Backend Connectivity Status */}
        <div className="live-pill" style={{ padding: '4px 10px', fontSize: '11px' }}>
          <span
            className="live-dot"
            style={{
              backgroundColor: isBackendHealthy ? 'var(--success)' : 'var(--critical-red)',
              boxShadow: isBackendHealthy
                ? '0 0 8px var(--success)'
                : '0 0 8px var(--critical-red)',
            }}
          />
          <span style={{ whiteSpace: 'nowrap' }}>{isBackendHealthy ? 'Active' : 'Offline'}</span>
        </div>

        {/* SATRA Core Pipeline: Upload & Analyze Entry Point */}
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: 700,
              gap: '6px',
              whiteSpace: 'nowrap',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.28) 0%, rgba(2, 132, 199, 0.45) 100%)',
              border: '1px solid var(--primary-cyan)',
              boxShadow: '0 0 14px rgba(56, 189, 248, 0.3)',
            }}
            title="Upload satellite observation file (.csv, .json) & execute AI analysis"
          >
            <UploadCloud size={13} style={{ color: '#FFFFFF' }} />
            <span>Upload & Analyze</span>
          </button>
        )}

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

        {/* Operator Profile Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px 4px 6px',
            borderRadius: '20px',
            background: 'rgba(15, 32, 50, 0.7)',
            border: '1px solid var(--border-color)',
            marginLeft: '4px',
          }}
          title="SATRA Ground Station Operator"
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary-cyan) 0%, var(--earth-blue) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#050B14',
            }}
          >
            <User size={12} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', paddingRight: '4px' }}>
            Ops
          </span>
        </div>
      </div>
    </header>
  );
}
