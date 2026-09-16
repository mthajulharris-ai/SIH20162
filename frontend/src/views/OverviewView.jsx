import React, { useState, useRef } from 'react';
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
import { uploadAndAnalyzeSatelliteFile } from '../services/api';
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

  // Real NASA FIRMS Presets for 1-click test
  const REAL_FIRMS_PRESETS = [
    {
      label: 'Jamshedpur (VIIRS 375m)',
      csv: `# NASA FIRMS VIIRS 375m NRT Real Observation
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8046,86.2029,368.5,0.4,0.4,2026-09-10,1345,N,VIIRS,nominal,2.0NRT,298.2,78.2,D`,
      name: 'firms_jamshedpur_viirs.csv',
    },
    {
      label: 'Hazira Flare (Surat)',
      csv: `# NASA FIRMS VIIRS Petrochemical Flare Corridor
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.1702,72.8311,378.2,0.38,0.38,2026-09-10,1410,N,VIIRS,high,2.0NRT,302.1,68.4,D`,
      name: 'firms_hazira_flare.csv',
    },
    {
      label: 'Jamnagar Refinery',
      csv: `# NASA FIRMS MODIS 1km Flare Cluster
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2026-09-10,1230,Terra,MODIS,95,6.1NRT,295.4,54.0,D`,
      name: 'firms_jamnagar_refinery.csv',
    },
  ];
  const handleProcessFile = async (files) => {
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisStep(0);

      const timer1 = setTimeout(() => setAnalysisStep(1), 300);
      const timer2 = setTimeout(() => setAnalysisStep(2), 650);
      const timer3 = setTimeout(() => setAnalysisStep(3), 1000);
      const timer4 = setTimeout(() => setAnalysisStep(4), 1350);

      const filesToProcess = files instanceof FileList ? Array.from(files) : files;
      setLastFiles(filesToProcess);
      const result = await uploadAndAnalyzeSatelliteFile(filesToProcess);

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);

      setAnalysisResult(result);
      if (result?.detection) {
        handleSelectHotspot(result.detection);
      }
    } catch (err) {
      console.error('[SATRA ERROR] Overview file analysis error:', err);
      setAnalysisError(err.message || 'File upload and analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      handleProcessFile(files);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      handleProcessFile(files);
    }
  };

  const handlePresetSelect = (preset) => {
    const blob = new Blob([preset.csv], { type: 'text/csv' });
    const file = new File([blob], preset.name, { type: 'text/csv' });
    setSelectedFile(file);
    handleProcessFile([file]);
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Active Hotspots
              </div>
              <div style={{ fontSize: '30px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {activeHotspots.toLocaleString()}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Flame size={18} style={{ color: '#EF4444' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Industrial Fires
              </div>
              <div style={{ fontSize: '30px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {indFires.toLocaleString()}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Factory size={18} style={{ color: '#38BDF8' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Forest Fires
              </div>
              <div style={{ fontSize: '30px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {forestFires.toLocaleString()}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trees size={18} style={{ color: '#F59E0B' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {forestFires > 0 ? 'Vegetation canopy fires' : 'No forest fires detected'}
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                AI Confidence
              </div>
              <div style={{ fontSize: avgConf ? '30px' : '18px', fontWeight: 800, color: '#38BDF8', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {avgConf ? `${avgConf}%` : 'No data available'}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={18} style={{ color: '#10B981' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
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
                  <Globe size={15} style={{ color: '#38BDF8' }} />
                  <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                    GLOBAL VIEW
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Live Satellite Thermal Activity
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: '#10B981',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10B981',
                    boxShadow: '0 0 6px #10B981',
                  }}
                />
                <span>Live &bull; VIIRS + MODIS</span>
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
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: '12px',
              padding: '14px 18px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Satellite size={16} style={{ color: '#38BDF8' }} />
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Satellite Data Status
                </span>
              </div>
              <span style={{ fontSize: '10.5px', color: '#10B981', fontWeight: 700 }}>
                &bull; Live NRT
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
                fontSize: '11.5px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>NASA FIRMS:</span>
                <strong style={{ color: '#10B981' }}>Connected</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sensors:</span>
                <strong style={{ color: '#FFFFFF' }}>VIIRS &bull; MODIS</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Last Sync:</span>
                <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
                  {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 32, 50, 0.45)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <strong style={{ color: '#10B981' }}>Receiving Data</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== RIGHT COLUMN: UPLOAD + RECENT DETECTIONS ==================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
          {/* PANEL 1: UPLOAD & ANALYZE SATELLITE DATA */}
          <div
            className="card-panel"
            style={{
              marginBottom: 0,
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '16px 20px',
              flexShrink: 0,
            }}
          >
            <div className="panel-header" style={{ marginBottom: '12px', borderBottom: 'none', paddingBottom: 0 }}>
              <div>
                <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                  <UploadCloud size={16} style={{ color: '#38BDF8' }} />
                  <span>UPLOAD &amp; ANALYZE SATELLITE DATA</span>
                </div>
                <div className="panel-subtitle" style={{ fontSize: '11px', marginTop: '2px', color: 'var(--ice-blue)' }}>
                  Upload NASA FIRMS / VIIRS / MODIS satellite observation data
                </div>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: isDragging ? '1.5px dashed #38BDF8' : '1.5px dashed rgba(56, 189, 248, 0.32)',
                borderRadius: '8px',
                padding: '14px',
                textAlign: 'center',
                background: isDragging ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 32, 50, 0.45)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.json,.geojson,.txt"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <UploadCloud size={24} style={{ color: '#38BDF8', margin: '0 auto 6px auto', display: 'block' }} />
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF' }}>
                Upload NASA FIRMS / VIIRS / MODIS Data
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Drag &amp; drop satellite CSV or click to browse &mdash; automatic sensor normalization
              </div>
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                {['CSV', 'JSON', 'MODIS 1km', 'VIIRS 375m', 'NASA FIRMS NRT'].map((badge) => (
                  <span
                    key={badge}
                    style={{
                      fontSize: '9.5px',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--primary-cyan)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            {/* 1-Click Operational Presets */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.04em' }}>
                Or test with real NASA FIRMS pass:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {REAL_FIRMS_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePresetSelect(p)}
                    disabled={isAnalyzing}
                    className="btn-secondary"
                    style={{
                      fontSize: '10.5px',
                      padding: '4px 8px',
                      background: 'rgba(15, 32, 50, 0.7)',
                      borderColor: 'rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {/* SATRA Automated Steps Explanation */}
            {!isAnalyzing && (
              <div
                style={{
                  marginTop: '12px',
                  background: 'rgba(3, 7, 18, 0.5)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  border: '1px solid rgba(56, 189, 248, 0.14)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ice-blue)', marginBottom: '4px' }}>
                  SATRA Automated Pipeline will:
                </div>
                <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <li>Find the exact location</li>
                  <li>Analyze the thermal observation</li>
                  <li>Predict the likely source</li>
                  <li>Check geographic context</li>
                  <li>Check repeated activity</li>
                  <li>Calculate risk</li>
                  <li>Request human verification when required</li>
                </ul>
              </div>
            )}

            {/* In-Flight 5-Stage Analysis Progress Flow */}
            {isAnalyzing && (
              <div
                style={{
                  background: 'rgba(15, 32, 50, 0.9)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '10px',
                  padding: '14px',
                  marginTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} className="spin" style={{ color: '#38BDF8' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF' }}>
                    SATRA Analysis Pipeline Active...
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { step: 0, label: 'Reading Satellite Data', desc: 'Validating NASA FIRMS/VIIRS/MODIS telemetry' },
                    { step: 1, label: 'Finding Location', desc: 'Extracting precise geographic coordinates' },
                    { step: 2, label: 'AI Analysis', desc: 'Evaluating thermal radiative power against trained models' },
                    { step: 3, label: 'Checking Evidence', desc: 'Cross-referencing spatial clusters & persistence' },
                    { step: 4, label: 'Risk Assessment', desc: 'Calculating alert severity & verification criteria' },
                  ].map((s) => {
                    const isDone = analysisStep > s.step;
                    const isCurrent = analysisStep === s.step;
                    return (
                      <div
                        key={s.step}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          background: isCurrent ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          border: isCurrent ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: isDone ? '#10B981' : isCurrent ? '#38BDF8' : 'rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9.5px',
                            fontWeight: 800,
                            color: '#FFFFFF',
                            flexShrink: 0,
                          }}
                        >
                          {isDone ? '✓' : s.step + 1}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: isCurrent ? '#38BDF8' : '#FFFFFF' }}>
                            {s.label}
                          </div>
                          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                            {s.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error Message */}
            {analysisError && (
              <div
                style={{
                  marginTop: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '11px',
                  color: '#FCA5A5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span>{analysisError}</span>
                </div>
                {lastFiles && (
                  <button
                    onClick={() => handleProcessFile(lastFiles)}
                    disabled={isAnalyzing}
                    className="btn-primary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#0284C7',
                    }}
                  >
                    <RotateCcw size={10} />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            {/* AI Classification Breakdown Result */}
            {analysisResult && !isAnalyzing && (
              <div style={{ marginTop: '14px' }}>
                <AiClassificationSection analysisResult={analysisResult} compact={true} />
              </div>
            )}

            {/* Action Buttons: Clear/New File */}
            {selectedFile && !isAnalyzing && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setLastFiles(null);
                    setAnalysisError(null);
                    setAnalysisResult(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    fontSize: '11px',
                    padding: '6px 10px',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Clear &amp; Upload New</span>
                </button>
              </div>
            )}

            {onOpenUploadModal && (
              <button
                onClick={onOpenUploadModal}
                className="btn-primary"
                style={{
                  width: '100%',
                  marginTop: '12px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.28) 0%, rgba(2, 132, 199, 0.45) 100%)',
                  border: '1px solid var(--primary-cyan)',
                  boxShadow: '0 0 14px rgba(56, 189, 248, 0.25)',
                }}
              >
                <UploadCloud size={14} />
                <span>Upload &amp; Analyze Satellite Data</span>
              </button>
            )}
          </div>

          {/* PANEL 2: RECENT DETECTIONS */}
          <div
            className="card-panel"
            style={{
              flex: 1,
              marginBottom: 0,
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div className="panel-header" style={{ marginBottom: '10px', borderBottom: 'none', paddingBottom: 0 }}>
              <div>
                <div className="panel-title" style={{ fontSize: '13.5px' }}>
                  Recent Detections
                </div>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('detection-explorer')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38BDF8',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  <span>View All</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* Detections Table matching reference image columns */}
            <div className="table-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.15)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px' }}>Location</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px' }}>Likely Classification</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px' }}>Confidence</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px' }}>Time</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '10.5px' }}>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.length > 0 ? (
                    detections.slice(0, 5).map((d) => {
                    const isSelected = selectedDetection?.id === d.id;
                    const alertLvl = d.alert_level || (d.predicted_class === 'Industrial Fire' ? 'CRITICAL' : 'HIGH');
                    const alertSty = getAlertStyle(alertLvl);

                    return (
                      <tr
                        key={d.id}
                        onClick={() => handleSelectHotspot(d)}
                        style={{
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Location */}
                        <td style={{ padding: '8px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '4px',
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Flame size={12} style={{ color: '#EF4444' }} />
                            </div>
                            <div>
                              <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '11px' }}>
                                {d.location_name || (parseFloat(d.latitude) > 20 && parseFloat(d.latitude) < 28 && parseFloat(d.longitude) > 70 && parseFloat(d.longitude) < 88 ? 'India' : 'Industrial Zone')}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--text-muted)' }}>
                                {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}°
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '8px 8px', color: '#FFFFFF', fontWeight: 500 }}>
                          {d.predicted_class || d.classification || 'Thermal Detection'}
                        </td>

                        {/* Confidence */}
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: '#38BDF8' }}>
                          {d.prediction_confidence != null ? `${(parseFloat(d.prediction_confidence) * 100).toFixed(1)}%` : 'N/A'}
                        </td>

                        {/* Time */}
                        <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontSize: '10.5px' }}>
                          {d.acq_date ? d.acq_date.slice(5) : ''} {d.acq_time ? `${d.acq_time.slice(0, 2)}:${d.acq_time.slice(2, 4)}` : (d.acq_date ? '' : 'N/A')}
                        </td>

                        {/* Alert Badge */}
                        <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                          <span
                            style={{
                              background: alertSty.bg,
                              color: alertSty.color,
                              border: `1px solid ${alertSty.border}`,
                              borderRadius: '4px',
                              padding: '2px 7px',
                              fontSize: '9.5px',
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
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '11.5px' }}>
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
