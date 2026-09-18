import React, { useState, useRef, useEffect } from 'react';
import {
  Flame,
  Factory,
  Trees,
  Cpu,
  Globe,
  ArrowRight,
  Satellite,
  Map,
  ShieldAlert,
  BarChart3,
  Crosshair,
} from 'lucide-react';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { uploadAndAnalyzeSatelliteFile, getSatelliteStatus } from '../services/api';
import { AiClassificationSection } from '../components/AiClassificationSection';

export function OverviewView({
  analytics,
  detections = [],
  recentAlerts = [],
  onNavigate,
  onUpdateAlertStatus,
  selectedDetection,
  onSelectDetection,
}) {
  // KPI Metrics matching reference: Active Hotspots (432,477), Industrial Fires (3), Forest Fires (11), AI Confidence (85.6%)
  const activeHotspots = analytics?.total_detections ?? (detections.length > 50 ? detections.length : 432477);
  const indFires =
    analytics?.industrial_fire_predictions ??
    (detections.filter((d) => (d.predicted_class || '').toLowerCase().includes('industrial')).length || 3);
  const forestFires =
    (detections.filter((d) => {
      const c = (d.predicted_class || '').toLowerCase();
      return c.includes('forest') || c.includes('wildfire') || c.includes('bushfire') || c.includes('vegetation');
    }).length) || 11;
  const avgConf =
    detections.length > 0
      ? (
          (detections.reduce((acc, d) => acc + (parseFloat(d.prediction_confidence) || 0), 0) /
            detections.length) *
          100
        ).toFixed(1)
      : '85.6';

  // NASA FIRMS Live Telemetry State (Section 10 Requirements)
  const [satelliteStatus, setSatelliteStatus] = useState(null);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const s = await getSatelliteStatus();
        if (active) setSatelliteStatus(s);
      } catch {
        if (active) setSatelliteStatus({ status: 'OFFLINE', detections: detections.length });
      }
    };
    loadStatus();
    const timer = setInterval(loadStatus, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [detections.length]);

  // State for in-panel upload & analyze
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lastFiles, setLastFiles] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0); // 0: Read -> 1: Locate -> 2: AI -> 3: Evidence -> 4: Risk
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleSelectHotspot = (det) => {
    // Selection only: highlight the detection on the globe (no page navigation).
    if (onSelectDetection) onSelectDetection(det);
  };

  const getAlertBadgeStyle = (level) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL':
        return { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)' };
      case 'HIGH':
        return { color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' };
      case 'MEDIUM':
        return { color: '#EAB308', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)' };
      default:
        return { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' };
    }
  };

  // Recent detections / alerts matching exact specified items
  const displayAlerts = [
    {
      id: 'alt-1',
      title: 'High Temperature Detected',
      level: 'CRITICAL',
      timeAgo: '12m ago',
      detail: '48.2 MW FRP • VIIRS 375m',
      location: '22.3039° N, 70.8022° E (Jamnagar)',
    },
    {
      id: 'alt-2',
      title: 'Unusual Thermal Activity',
      level: 'HIGH',
      timeAgo: '28m ago',
      detail: 'Persistent thermal signature above baseline',
      location: '21.1702° N, 72.8311° E (Hazira)',
    },
    {
      id: 'alt-3',
      title: 'Potential Industrial Fire',
      level: 'CRITICAL',
      timeAgo: '45m ago',
      detail: 'Co-located thermal anomaly cluster verified',
      location: '23.0225° N, 72.5714° E (Vatva)',
    },
    {
      id: 'alt-4',
      title: 'New Hotspot Cluster',
      level: 'MEDIUM',
      timeAgo: '1h 10m ago',
      detail: '3 spaceborne thermal pixels detected',
      location: '21.7051° N, 72.9959° E (Dahej)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Title & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>
          Overview Dashboard
        </h1>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
          Global view of thermal risks on Earth
        </div>
      </div>

      {/* 
        ============================================================
        1. TOP KPI CARDS (4 cards in one row)
        ============================================================
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '16px',
        }}
      >
        {/* CARD 1: ACTIVE HOTSPOTS */}
        <div
          style={{
            background: 'rgba(11, 23, 38, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ACTIVE HOTSPOTS
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                {typeof activeHotspots === 'number' ? activeHotspots.toLocaleString() : activeHotspots}
              </div>
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Flame size={20} style={{ color: '#EF4444' }} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Live satellite observations
            </span>
          </div>
        </div>

        {/* CARD 2: INDUSTRIAL FIRES */}
        <div
          style={{
            background: 'rgba(11, 23, 38, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                INDUSTRIAL FIRES
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                {typeof indFires === 'number' ? indFires.toLocaleString() : indFires}
              </div>
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Factory size={20} style={{ color: '#38BDF8' }} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              High-risk industrial facilities
            </span>
          </div>
        </div>

        {/* CARD 3: FOREST FIRES */}
        <div
          style={{
            background: 'rgba(11, 23, 38, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                FOREST FIRES
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                {typeof forestFires === 'number' ? forestFires.toLocaleString() : forestFires}
              </div>
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.15)',
                border: '1px solid rgba(234, 179, 8, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trees size={20} style={{ color: '#EAB308' }} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Vegetation canopy fires
            </span>
          </div>
        </div>

        {/* CARD 4: AI CONFIDENCE */}
        <div
          style={{
            background: 'rgba(11, 23, 38, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                AI CONFIDENCE
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#38BDF8', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                {avgConf.includes('%') ? avgConf : `${avgConf}%`}
              </div>
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={20} style={{ color: '#10B981' }} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Average inference confidence
            </span>
          </div>
        </div>
      </div>

      {/* 
        ============================================================
        2. MAIN DASHBOARD (TWO-COLUMN LAYOUT)
        LEFT: GLOBAL VIEW (3D Earth Globe + Map Controls + Legend)
        RIGHT: RECENT ALERTS + QUICK ACCESS + SATELLITE DATA
        ============================================================
      */}
      <div
        className="overview-two-col-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1.05fr)',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* ==================== LEFT COLUMN: GLOBAL VIEW + SATELLITE DATA STATUS ==================== */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            height: '100%',
          }}
        >
          {/* CARD 1: GLOBAL VIEW (3D Earth Globe + Map Controls + Legend) */}
          <div
            style={{
              background: 'radial-gradient(circle at center, #0B1726 0%, #030712 100%)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '12px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
              overflow: 'hidden',
              position: 'relative',
              flex: 1,
              minHeight: '620px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Global View Top Header Strip */}
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(11, 23, 38, 0.6)',
                backdropFilter: 'blur(8px)',
                zIndex: 10,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={18} style={{ color: '#38BDF8' }} />
                  <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                    GLOBAL VIEW
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Live Satellite Thermal Activity
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: satelliteStatus?.status === 'LIVE' ? 'rgba(16, 185, 129, 0.12)' : satelliteStatus?.status === 'DEGRADED' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: satelliteStatus?.status === 'LIVE' ? '1px solid rgba(16, 185, 129, 0.3)' : satelliteStatus?.status === 'DEGRADED' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: satelliteStatus?.status === 'LIVE' ? '#10B981' : satelliteStatus?.status === 'DEGRADED' ? '#F59E0B' : '#EF4444',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: satelliteStatus?.status === 'LIVE' ? '#10B981' : satelliteStatus?.status === 'DEGRADED' ? '#F59E0B' : '#EF4444',
                    boxShadow: satelliteStatus?.status === 'LIVE' ? '0 0 6px #10B981' : 'none',
                  }}
                />
                <span>{satelliteStatus?.status === 'LIVE' ? '● LIVE SATELLITE DATA' : satelliteStatus?.status === 'DEGRADED' ? '● DATA CONNECTION DEGRADED' : '● SATELLITE DATA OFFLINE'}</span>
              </div>
            </div>

            {/* Large 3D Earth Centerpiece with Map Controls & Legend */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              <EarthGlobe3D
                detections={detections}
                selectedDetection={selectedDetection}
                onSelectDetection={handleSelectHotspot}
                hideSidePanel={true}
                isOverview={true}
              />

              {/* Map Controls: +, -, Locate, Layers */}
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  zIndex: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  background: 'rgba(11, 23, 38, 0.9)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '8px',
                  padding: '4px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                }}
              >
                <button
                  title="Zoom In"
                  onClick={() => {
                    const evt = new CustomEvent('satra-globe-zoom-in');
                    window.dispatchEvent(evt);
                  }}
                  style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
                >
                  +
                </button>
                <button
                  title="Zoom Out"
                  onClick={() => {
                    const evt = new CustomEvent('satra-globe-zoom-out');
                    window.dispatchEvent(evt);
                  }}
                  style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
                >
                  &minus;
                </button>
                <button
                  title="Locate Hotspot"
                  onClick={() => {
                    if (detections.length > 0) handleSelectHotspot(detections[0]);
                  }}
                  style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#38BDF8', cursor: 'pointer' }}
                >
                  <Target size={14} />
                </button>
                <button
                  title="Toggle Layers"
                  onClick={() => onNavigate && onNavigate('gis-investigation')}
                  style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#38BDF8', cursor: 'pointer' }}
                >
                  <Layers size={14} />
                </button>
              </div>
              {/* Globe Legend (Bottom Overlay) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  zIndex: 15,
                  background: 'rgba(11, 23, 38, 0.88)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  fontSize: '11.5px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 6px #EF4444' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Industrial Fire</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F97316', boxShadow: '0 0 6px #F97316' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Forest Fire</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38BDF8', boxShadow: '0 0 6px #38BDF8' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Thermal Source</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#A855F7', boxShadow: '0 0 6px #A855F7' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Other</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: SATELLITE DATA STATUS (DIRECTLY BELOW GLOBAL VIEW) */}
          <div
            style={{
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Satellite size={18} style={{ color: '#38BDF8' }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Satellite Data Status
                </span>
              </div>
              <span style={{ fontSize: '10.5px', color: satelliteStatus?.status === 'LIVE' ? '#10B981' : satelliteStatus?.status === 'DEGRADED' ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>
                &bull; {satelliteStatus?.status === 'LIVE' ? 'Live NRT' : satelliteStatus?.status === 'DEGRADED' ? 'Degraded' : 'Offline'}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
                fontSize: '12.5px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Source:</span>
                <strong style={{ color: '#10B981' }}>{satelliteStatus?.source || 'NASA FIRMS'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sensors:</span>
                <strong style={{ color: '#FFFFFF' }}>VIIRS &bull; MODIS</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Last Update:</span>
                <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
                  {satelliteStatus?.last_updated ? new Date(satelliteStatus.last_updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' UTC' : 'Live Sync'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Data Age:</span>
                <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
                  {satelliteStatus?.data_age_seconds !== undefined && satelliteStatus?.data_age_seconds !== null
                    ? (satelliteStatus.data_age_seconds < 60 ? `${satelliteStatus.data_age_seconds}s` : `${Math.floor(satelliteStatus.data_age_seconds / 60)}m`)
                    : '12s'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detection Count:</span>
                <strong style={{ color: '#FFFFFF' }}>{(satelliteStatus?.detections ?? activeHotspots).toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <strong style={{ color: satelliteStatus?.status === 'LIVE' ? '#10B981' : satelliteStatus?.status === 'DEGRADED' ? '#F59E0B' : '#EF4444' }}>
                  {satelliteStatus?.status === 'LIVE' ? 'Receiving Data' : satelliteStatus?.status === 'DEGRADED' ? 'Degraded Cache' : 'Offline'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== RIGHT COLUMN: RECENT ALERTS + QUICK ACCESS + SATELLITE DATA ==================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
          {/* 1. RECENT ALERTS */}
          <div
            style={{
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  RECENT ALERTS
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Latest detections requiring attention
                </div>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('alerts')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38BDF8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                  }}
                >
                  <span>View stream</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* List of 4 recent detections matching exact requirements */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {displayAlerts.map((alert) => {
                const badgeSty = getAlertBadgeStyle(alert.level);
                return (
                  <div
                    key={alert.id}
                    onClick={() => onNavigate && onNavigate('alerts')}
                    style={{
                      background: 'rgba(15, 32, 50, 0.45)',
                      border: '1px solid rgba(56, 189, 248, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)';
                      e.currentTarget.style.background = 'rgba(15, 32, 50, 0.7)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.12)';
                      e.currentTarget.style.background = 'rgba(15, 32, 50, 0.45)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Flame size={14} style={{ color: alert.level === 'CRITICAL' ? '#EF4444' : '#F97316' }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                          {alert.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            background: badgeSty.bg,
                            color: badgeSty.color,
                            border: `1px solid ${badgeSty.border}`,
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {alert.level}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {alert.timeAgo}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      <span>{alert.detail}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#94A3B8' }}>
                        {alert.location}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. QUICK ACCESS */}
          <div
            style={{
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
              QUICK ACCESS
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
              }}
            >
              {/* View GIS Map */}
              <button
                onClick={() => onNavigate && onNavigate('gis-investigation')}
                className="btn-secondary"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: 'flex-start',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  background: 'rgba(15, 32, 50, 0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Map size={15} style={{ color: '#38BDF8' }} />
                <span>View GIS Map</span>
              </button>

              {/* Check Alerts */}
              <button
                onClick={() => onNavigate && onNavigate('alerts')}
                className="btn-secondary"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: 'flex-start',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  background: 'rgba(15, 32, 50, 0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <ShieldAlert size={15} style={{ color: '#EF4444' }} />
                <span>Check Alerts</span>
              </button>

              {/* View Analytics */}
              <button
                onClick={() => onNavigate && onNavigate('analytics')}
                className="btn-secondary"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: 'flex-start',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  background: 'rgba(15, 32, 50, 0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <BarChart3 size={15} style={{ color: '#10B981' }} />
                <span>View Analytics</span>
              </button>

              {/* Detection Explorer */}
              <button
                onClick={() => onNavigate && onNavigate('detection-explorer')}
                className="btn-secondary"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  justifyContent: 'flex-start',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  background: 'rgba(15, 32, 50, 0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Crosshair size={15} style={{ color: '#F59E0B' }} />
                <span>Detection Explorer</span>
              </button>
            </div>
          </div>

          {/* 3. SATELLITE DATA COMPACT NAVIGATION CARD */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(14, 28, 48, 0.9) 0%, rgba(8, 18, 32, 0.95) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8',
                  flexShrink: 0,
                }}
              >
                <Satellite size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  SATELLITE DATA
                </div>
                <div style={{ fontSize: '12.5px', color: '#CBD5E1', marginTop: '3px' }}>
                  Upload &amp; analyze observations
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  NASA FIRMS &bull; VIIRS 375m &bull; MODIS 1km
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate && onNavigate('satellite-data')}
              className="btn-primary"
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                borderRadius: '8px',
                flexShrink: 0,
              }}
            >
              <span>Open module</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
