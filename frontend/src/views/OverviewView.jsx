import React, { useState, useRef, useEffect } from 'react';
import {
  Flame,
  Factory,
  Trees,
  Cpu,
  Zap,
  Globe,
  Radio,
  UploadCloud,
  ArrowRight,
  Target,
  Crosshair,
  Compass,
  Satellite,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Loader2,
  X,
  RotateCcw,
  MapPin,
  Layers,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { uploadAndAnalyzeSatelliteFile, getSatelliteStatus } from '../services/api';
import { AiClassificationSection } from '../components/AiClassificationSection';

export function OverviewView({
  analytics,
  detections = [],
  recentAlerts = [],
  onNavigate,
  onUpdateAlertStatus,
  onFocusDetection,
  selectedDetection,
  onSelectDetection,
  onOpenUploadModal,
}) {
  // Real data metrics
  const activeHotspots = analytics?.total_detections ?? detections.length;
  const indFires =
    analytics?.industrial_fire_predictions ??
    detections.filter((d) => (d.predicted_class || '').toLowerCase().includes('industrial')).length;

  const forestFires =
    detections.filter((d) => {
      const c = (d.predicted_class || '').toLowerCase();
      return c.includes('forest') || c.includes('wildfire') || c.includes('bushfire') || c.includes('vegetation');
    }).length;

  const avgConf =
    detections.length > 0
      ? (
          (detections.reduce((acc, d) => acc + (parseFloat(d.prediction_confidence) || 0), 0) /
            detections.length) *
          100
        ).toFixed(1)
      : null;

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
    if (onSelectDetection) onSelectDetection(det);
    if (onFocusDetection) onFocusDetection(det);
  };

  const handleInvestigateLocation = (det) => {
    if (onSelectDetection) onSelectDetection(det);
    if (onFocusDetection) onFocusDetection(det);
    if (onNavigate) onNavigate('gis-investigation');
  };

  // Helper for alert colors
  const getAlertStyle = (level) => {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 
        ============================================================
        SECTION: FOUR LARGE KPI CARDS — TOP ROW
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
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Active Hotspots
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {activeHotspots.toLocaleString()}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {activeHotspots > 0 ? 'Live satellite observations' : 'No active hotspots detected'}
              </span>
            </div>
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
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Industrial Fires
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {indFires.toLocaleString()}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {indFires > 0 ? 'High-risk industrial facilities' : 'No industrial incidents detected'}
              </span>
            </div>
          </div>
        </div>

        {/* CARD 3: FOREST FIRES / VEGETATION */}
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
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Forest Fires
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {forestFires.toLocaleString()}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {forestFires > 0 ? 'Active wildfire perimeters' : 'No wildfire activity detected'}
              </span>
            </div>
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
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                AI Confidence
              </div>
              <div style={{ fontSize: avgConf ? '32px' : '18px', fontWeight: 800, color: '#38BDF8', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {avgConf ? `${avgConf}%` : 'No data available'}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {avgConf ? 'Average inference confidence' : 'Awaiting satellite observations'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 
        ============================================================
        SECTION 3: MAIN TWO-COLUMN CONTENT
        LEFT: GLOBAL VIEW (LARGE EARTH) + SATELLITE DATA STATUS
        RIGHT: UPLOAD & ANALYZE + RECENT DETECTIONS
        ============================================================
      */}
      <div
        className="overview-two-col-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.42fr) minmax(0, 1.08fr)',
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
          {/* CARD 1: GLOBAL VIEW (LARGER) */}
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

            {/* Large 3D Earth Centerpiece */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              <EarthGlobe3D
                detections={detections}
                selectedDetection={selectedDetection}
                onSelectDetection={handleSelectHotspot}
                hideSidePanel={true}
                isOverview={true}
              />
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

        {/* ==================== RIGHT COLUMN: SATELLITE DATA SHORTCUT + RECENT DETECTIONS ==================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
          {/* COMPACT SATELLITE DATA SHORTCUT CARD */}
          <div
            onClick={() => onNavigate && onNavigate('satellite-data')}
            className="satellite-shortcut-card card-panel"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigate) onNavigate('satellite-data');
              }
            }}
            style={{
              marginBottom: 0,
              background: 'linear-gradient(135deg, rgba(14, 28, 48, 0.9) 0%, rgba(8, 18, 32, 0.95) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '12px',
              padding: '16px 20px',
              flexShrink: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              transition: 'all 0.25s ease',
              boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.65)';
              e.currentTarget.style.boxShadow = '0 8px 28px rgba(56, 189, 248, 0.22)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="Open Satellite Data Command Module"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.25)',
                }}
              >
                <Satellite size={22} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em' }}>
                    Satellite Data
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38BDF8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    08 COMMAND MODULE
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '3px', lineHeight: 1.35 }}>
                  Upload &amp; analyze observations (NASA FIRMS &bull; VIIRS 375m &bull; MODIS 1km)
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#38BDF8',
                fontSize: '12.5px',
                fontWeight: 600,
                background: 'rgba(56, 189, 248, 0.1)',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              <span>Open module</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* PANEL 2: RECENT DETECTIONS (SPACIOUS) */}
          <div
            className="card-panel"
            style={{
              flex: 1,
              marginBottom: 0,
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div className="panel-header" style={{ marginBottom: '12px', borderBottom: 'none', paddingBottom: 0 }}>
              <div>
                <div className="panel-title" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.02em', color: '#FFFFFF' }}>
                  Recent Detections
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Real-time spaceborne thermal observations and classified risks
                </div>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('detection-explorer')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38BDF8',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                  }}
                >
                  <span>View All</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>

            {/* Detections Table with enhanced readability */}
            <div className="table-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.15)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Likely Classification</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time (UTC)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.length > 0 ? (
                    detections.slice(0, 8).map((d) => {
                    const isSelected = selectedDetection?.id === d.id;
                    const alertLvl = d.alert_level || (d.predicted_class === 'Industrial Fire' ? 'CRITICAL' : 'HIGH');
                    const alertSty = getAlertStyle(alertLvl);

                    return (
                      <tr
                        key={d.id}
                        onClick={() => handleSelectHotspot(d)}
                        style={{
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Location */}
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '6px',
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Flame size={13} style={{ color: '#EF4444' }} />
                            </div>
                            <div>
                              <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '12px' }}>
                                {d.location_name || (parseFloat(d.latitude) > 20 && parseFloat(d.latitude) < 28 && parseFloat(d.longitude) > 70 && parseFloat(d.longitude) < 88 ? 'India' : 'Industrial Zone')}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                                {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}°
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '10px 10px', color: '#F1F5F9', fontWeight: 500, fontSize: '12px' }}>
                          {d.predicted_class || d.classification || 'Thermal Detection'}
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: '#38BDF8', fontWeight: 600, fontSize: '12px' }}>
                          {d.prediction_confidence != null ? `${(parseFloat(d.prediction_confidence) * 100).toFixed(1)}%` : 'N/A'}
                        </td>

                        {/* Time */}
                        <td style={{ padding: '10px 10px', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                          {d.acq_date ? d.acq_date.slice(5) : ''} {d.acq_time ? `${d.acq_time.slice(0, 2)}:${d.acq_time.slice(2, 4)}` : (d.acq_date ? '' : 'N/A')}
                        </td>

                        {/* Alert Badge */}
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                          <span
                            style={{
                              background: alertSty.bg,
                              color: alertSty.color,
                              border: `1px solid ${alertSty.border}`,
                              borderRadius: '5px',
                              padding: '3px 8px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                            }}
                          >
                            {alertLvl}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                      No real data available
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
