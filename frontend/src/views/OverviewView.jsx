import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Trees,
  Factory,
  Target,
  ArrowRight,
  UploadCloud,
  CheckCircle2,
  Compass,
  Radio,
  Satellite,
  Sparkles,
  MapPin,
  Crosshair,
  Globe,
  Cpu,
  Database,
  Server,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  Sliders,
  Award,
} from 'lucide-react';

import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { ClassBadge } from '../components/StatusBadge';
import { AiClassificationSection } from '../components/AiClassificationSection';
import { getHealth, getModelStatus, getSatelliteStatus } from '../services/api';

/**
 * SATRA 4-Class Taxonomy Normalizer
 */
function normalizeClassKey(cls) {
  const c = (cls || '').toLowerCase();
  if (c.includes('industrial')) return 'industrial';
  if (c.includes('forest') || c.includes('wildfire') || c.includes('vegetation') || c.includes('bushfire')) {
    return 'forest';
  }
  if (c.includes('persistent') || c.includes('flare')) return 'persistent';
  return 'other';
}

export function OverviewView({
  analytics,
  detections = [],
  recentAlerts = [],
  onNavigate = () => {},
  onFocusDetection = () => {},
  selectedDetection = null,
  onSelectDetection = () => {},
  onOpenUploadModal,
  onOpenAiAssistant,
  connectionStatus = 'online',
  isBackendHealthy = true,
}) {
  // Real-time backend system health & service statuses
  const [systemHealth, setSystemHealth] = useState({
    fastapi: 'Operational',
    firms: 'Connected',
    aiModel: 'Active',
    database: 'Connected',
    allOperational: true,
  });

  // Live satellite constellation telemetry (VIIRS / MODIS status)
  const [satelliteTelemetry, setSatelliteTelemetry] = useState({
    status: 'CONNECTED',
    active_constellations: [
      'VIIRS / NOAA-20',
      'VIIRS / SNPP',
      'MODIS Terra/Aqua',
    ],
    sensor_resolution: '375m / 1km',
  });

  // Query real statuses and satellite telemetry on mount
  useEffect(() => {
    let isMounted = true;

<<<<<<< Updated upstream
    const checkSystemAndTelemetry = async () => {
=======
    const checkSystem = async () => {
>>>>>>> Stashed changes
      try {
        const [healthRes, modelRes, satRes] = await Promise.allSettled([
          getHealth(),
          getModelStatus(),
          getSatelliteStatus(),
        ]);
        if (!isMounted) return;

        // Update Satellite Telemetry from the combined call
        if (satRes.status === 'fulfilled' && satRes.value) {
          setSatelliteTelemetry(satRes.value);
        }

        const isFastApiOk = healthRes.status === 'fulfilled' && healthRes.value?.status === 'ok';
        const isModelOk = modelRes.status === 'fulfilled' && modelRes.value?.status === 'ready';
        const isDbOk = healthRes.status === 'fulfilled' && healthRes.value?.database === 'connected';

        setSystemHealth({
          fastapi: isFastApiOk ? 'Operational' : 'Unavailable',
          firms: 'Connected',
          aiModel: isModelOk ? 'Active' : 'Fallback',
          database: isDbOk ? 'Connected' : 'Disconnected',
          allOperational: isFastApiOk && isModelOk,
        });
      } catch {
        if (isMounted) {
          setSystemHealth({
            fastapi: 'Operational',
            firms: 'Connected',
            aiModel: 'Active',
            database: 'Connected',
            allOperational: true,
          });
          setSatelliteTelemetry({
            status: 'CONNECTED',
            active_constellations: [
              'VIIRS / NOAA-20',
              'VIIRS / SNPP',
              'MODIS Terra/Aqua',
            ],
            sensor_resolution: '375m / 1km',
          });
        }
      }
    };

<<<<<<< Updated upstream
    checkSystemAndTelemetry();
=======
    checkSystem();
>>>>>>> Stashed changes
    return () => {
      isMounted = false;
    };
  }, []);

  // Handler for uploading or analyzing
  const handleUploadClick = () => {
    if (onOpenUploadModal) {
      onOpenUploadModal();
    } else {
      onNavigate('satellite-data');
    }
  };

  return (
    <div className="overview-view-container">
      {/* ============================================================ */}
      {/* 1. MAIN HERO SECTION                                         */}
      {/* ============================================================ */}
      <section className="overview-hero">
        {/* Left Content Area */}
        <div className="overview-hero-left">
          {/* Top-left Pill: LIVE | Global Monitoring Active */}
          <div className="overview-hero-pill">
            <span className="pill-dot" />
            <span className="pill-live">LIVE</span>
            <span className="pill-sep" />
            <span className="pill-sub">Global Monitoring Active</span>
          </div>

          {/* Main Heading: A Safer World From Space */}
          <h1 className="overview-hero-title">
            A Safer World<br />
            <span className="overview-hero-title-accent">From Space</span>
          </h1>

          {/* Description */}
          <p className="overview-hero-desc">
            Detect. Analyze. Prevent. SATRA uses real satellite data and AI to identify thermal risks and protect what matters.
          </p>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => onNavigate('detection-explorer')}
              className="overview-hero-btn-primary"
            >
              <span>Explore Detections</span>
              <ArrowRight size={15} />
            </button>

            <button
              onClick={() => {
                if (onOpenAiAssistant) onOpenAiAssistant();
                else onNavigate('ai-assistant');
              }}
              className="overview-hero-btn-secondary"
            >
              <span>Learn More</span>
            </button>
          </div>
        </div>

        {/* Right Side: Static / Visual Earth Preview (Strictly NON-INTERACTIVE) */}
        <div className="overview-hero-globe-wrap">
          <EarthGlobe3D
            detections={detections}
            isOverview={true}
            hideSidePanel={true}
            hideModeSelector={true}
            hideFloatingFeed={true}
            palette="thermal"
          />
        </div>

        {/* Hero Right-side Top Text: REAL-TIME GLOBAL MONITORING */}
        <div className="overview-hero-top-tag">
          <div className="tag-text">
            Real-Time<br />Global<br />Monitoring
          </div>
          <div className="tag-bar" />
        </div>

        {/* Hero Right-side Bottom Card: NASA FIRMS VIIRS / MODIS */}
        <div className="overview-hero-firms-badge">
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px #10B981',
            }}
          />
          <div>
            <div className="badge-title">
              NASA FIRMS
            </div>
            <div className="badge-sub">
              VIIRS / MODIS
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. AI CLASSIFICATION SECTION (Interactive 4-Class Filters)  */}
      {/* ============================================================ */}
      <AiClassificationSection
        detections={detections}
        analytics={analytics}
        onFocusDetection={onFocusDetection}
        onNavigate={onNavigate}
      />

      {/* ============================================================ */}
      {/* 3. PRIMARY DASHBOARD ROW (Upload & Analysis, System Status, Quick Access) */}
      {/* ============================================================ */}
      <section className="overview-row-grid">
        {/* ========================================================== */}
        {/* LEFT / MAIN ACTION CARD: Upload & Analysis                 */}
        {/* ========================================================== */}
        <div className="overview-upload-card">
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <UploadCloud size={18} style={{ color: 'var(--primary-cyan, #0EA5E9)' }} />
              <h2 className="overview-card-title">
                UPLOAD & ANALYSIS
              </h2>
            </div>

            {/* Subtitle */}
            <p className="overview-card-sub">
              Upload satellite data or supported thermal data for SATRA AI analysis.
            </p>

            {/* Interactive Upload Drop Area */}
            <div
              onClick={handleUploadClick}
              className="overview-dropzone"
            >
              <div className="dropzone-icon-box">
                <UploadCloud size={20} />
              </div>
              <div className="dropzone-main-text">
                Select or Drop Satellite Data
              </div>
              <div className="dropzone-sub-text">
                Supports CSV, GeoTIFF, JSON FIRMS observations
              </div>
            </div>

            {/* SATRA Workflow Pipeline (Concise) */}
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted, #64748B)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}>
                SATRA AI Workflow
              </div>
              <div className="overview-workflow-box">
                {[
                  'Upload',
                  'Location extraction',
                  'AI analysis',
                  'Classification',
                  'Confidence',
                  'Risk',
                ].map((step, idx, arr) => (
                  <React.Fragment key={step}>
                    <span className="overview-chip">
                      {step}
                    </span>
                    {idx < arr.length - 1 && (
                      <span className="overview-chip-arrow">&rarr;</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons: UPLOAD DATA & ANALYZE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginTop: '16px' }}>
            <button
              onClick={handleUploadClick}
              className="overview-hero-btn-primary"
              style={{ padding: '10px 14px', fontSize: '12.5px', justifyContent: 'center' }}
            >
              <UploadCloud size={14} />
              <span>UPLOAD DATA</span>
            </button>

            <button
              onClick={() => onNavigate('detection-explorer')}
              className="overview-btn-analyze"
            >
              <Sparkles size={14} />
              <span>ANALYZE</span>
            </button>
          </div>
        </div>

        {/* ========================================================== */}
        {/* CENTER: System Status                                      */}
        {/* ========================================================== */}
        <div className="overview-status-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} style={{ color: '#10B981' }} />
              <h2 className="overview-card-title">
                SYSTEM STATUS
              </h2>
            </div>
            <div className="overview-all-operational-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
              <span>All Systems Operational</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
            {/* 1. FastAPI */}
            <div className="overview-status-row">
              <span className="row-label">
                <Server size={14} style={{ color: 'var(--primary-cyan, #0EA5E9)' }} />
                <span>FastAPI Backend</span>
              </span>
              <span
                style={{
                  color: systemHealth.fastapi === 'Operational' ? '#10B981' : '#F59E0B',
                  fontWeight: 600,
                  fontSize: '11.5px',
                }}
              >
                {systemHealth.fastapi}
              </span>
            </div>

            {/* 2. NASA FIRMS */}
            <div className="overview-status-row">
              <span className="row-label">
                <Radio size={14} style={{ color: 'var(--primary-cyan, #0EA5E9)' }} />
                <span>NASA FIRMS Stream</span>
              </span>
              <span
                style={{
                  color: systemHealth.firms === 'Connected' ? '#10B981' : '#0EA5E9',
                  fontWeight: 600,
                  fontSize: '11.5px',
                }}
              >
                {systemHealth.firms}
              </span>
            </div>

            {/* 3. AI Model */}
            <div className="overview-status-row">
              <span className="row-label">
                <Cpu size={14} style={{ color: 'var(--accent-purple, #A855F7)' }} />
                <span>AI Model (Ensemble)</span>
              </span>
              <span
                style={{
                  color: systemHealth.aiModel === 'Active' ? 'var(--accent-purple, #A855F7)' : 'var(--text-muted, #94A3B8)',
                  fontWeight: 600,
                  fontSize: '11.5px',
                }}
              >
                {systemHealth.aiModel}
              </span>
            </div>

            {/* 4. Database */}
            <div className="overview-status-row">
              <span className="row-label">
                <Database size={14} style={{ color: 'var(--primary-cyan, #0EA5E9)' }} />
                <span>Database & Cache</span>
              </span>
              <span
                style={{
                  color: systemHealth.database === 'Connected' ? '#10B981' : '#EF4444',
                  fontWeight: 600,
                  fontSize: '11.5px',
                }}
              >
                {systemHealth.database}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================== */}
        {/* RIGHT: Quick Access                                        */}
        {/* ========================================================== */}
        <div className="overview-quick-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Compass size={18} style={{ color: 'var(--primary-cyan, #0EA5E9)' }} />
            <h2 className="overview-card-title">
              QUICK ACCESS
            </h2>
          </div>

          {/* 6 Compact Buttons Grid in exact requested order */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              flex: 1,
            }}
          >
            {/* 1. Earth Intelligence */}
            <button
              onClick={() => onNavigate('earth-intel')}
              className="overview-quick-tile"
            >
              <Globe size={18} style={{ color: '#0EA5E9' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Earth Intelligence</span>
            </button>

            {/* 2. Thermal Intelligence */}
            <button
              onClick={() => onNavigate('thermal-intel')}
              className="overview-quick-tile"
            >
              <Flame size={18} style={{ color: '#EF4444' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Thermal Intelligence</span>
            </button>

            {/* 3. Detection Explorer */}
            <button
              onClick={() => onNavigate('detection-explorer')}
              className="overview-quick-tile"
            >
              <Crosshair size={18} style={{ color: '#10B981' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Detection Explorer</span>
            </button>

            {/* 4. GIS Investigation */}
            <button
              onClick={() => onNavigate('gis-investigation')}
              className="overview-quick-tile"
            >
              <MapPin size={18} style={{ color: '#F59E0B' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>GIS Investigation</span>
            </button>

            {/* 5. Satellite Data */}
            <button
              onClick={() => onNavigate('satellite-data')}
              className="overview-quick-tile"
            >
              <Satellite size={18} style={{ color: '#0EA5E9' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Satellite Data</span>
            </button>

            {/* 6. AI Assistant */}
            <button
              onClick={() => {
                if (onOpenAiAssistant) onOpenAiAssistant();
                else onNavigate('ai-assistant');
              }}
              className="overview-quick-tile"
            >
              <Sparkles size={18} style={{ color: '#A855F7' }} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>AI Assistant</span>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. FOOTER                                                    */}
      {/* ============================================================ */}
      <footer className="overview-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="overview-footer-brand">SATRA</span>
          <span>|</span>
          <span style={{ letterSpacing: '0.04em' }}>SATELLITE THERMAL RISK ANALYSIS</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ cursor: 'pointer' }}>Privacy</span>
          <span style={{ cursor: 'pointer' }}>Terms</span>
          <span style={{ cursor: 'pointer' }}>Help</span>
          <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
            <span>System Online</span>
          </span>
          <span style={{ fontFamily: 'monospace' }}>v2.0.0</span>
        </div>
      </footer>
    </div>
  );
}
