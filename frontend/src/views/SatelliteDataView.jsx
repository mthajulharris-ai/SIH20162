import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  Satellite,
  Radio,
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Layers,
  UploadCloud,
  RefreshCw,
  KeyRound,
  AlertTriangle,
  Globe,
  Flame,
  RotateCcw,
  FileText,
  Check,
  Loader2,
  ChevronRight,
  Info,
  Cpu,
  MapPin,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { getSatelliteStatus, syncSatelliteFirms, uploadAndAnalyzeSatelliteFile } from '../services/api';
import { AiClassificationSection } from '../components/AiClassificationSection';

export function SatelliteDataView({
  detections = [],
  isBackendHealthy = true,
  onRefresh,
  onOpenUploadModal,
  onNavigate,
  onFocusDetection,
  onSelectDetection,
  onAnalysisSuccess,
}) {
  const [satelliteStatus, setSatelliteStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  const [selectedSatellite, setSelectedSatellite] = useState('VIIRS_NOAA20_NRT');
  const [selectedDays, setSelectedDays] = useState(1);

  // Upload workspace state
  const fileInputRef = useRef(null);
  const uploadCardRef = useRef(null);
  const [uploadCardHeight, setUploadCardHeight] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lastFiles, setLastFiles] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0); // 0: Read -> 1: Locate -> 2: AI -> 3: Evidence -> 4: Risk
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Measure natural content height of the left card and apply to the right workflow card
  useLayoutEffect(() => {
    if (!uploadCardRef.current) return;
    const measure = () => {
      if (uploadCardRef.current) {
        const rect = uploadCardRef.current.getBoundingClientRect();
        if (rect.height > 100) {
          setUploadCardHeight(Math.round(rect.height));
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(uploadCardRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter actual detection records by sensor
  const noaa20Count = detections.filter((d) => {
    const s = ((d.source || '') + ' ' + (d.satellite || '') + ' ' + (d.instrument || '')).toUpperCase();
    return s.includes('NOAA-20') || s.includes('NOAA20') || s.includes('JPSS-1') || d.source === 'N' || d.satellite === 'N';
  }).length;

  const snppCount = detections.filter((d) => {
    const s = ((d.source || '') + ' ' + (d.satellite || '') + ' ' + (d.instrument || '')).toUpperCase();
    return s.includes('SNPP') || s.includes('S-NPP') || s.includes('SUOMI');
  }).length;

  const noaa21Count = detections.filter((d) => {
    const s = ((d.source || '') + ' ' + (d.satellite || '') + ' ' + (d.instrument || '')).toUpperCase();
    return s.includes('NOAA-21') || s.includes('NOAA21') || s.includes('JPSS-2') || d.source === '21' || d.satellite === '21';
  }).length;

  const modisCount = detections.filter((d) => {
    const s = ((d.source || '') + ' ' + (d.satellite || '') + ' ' + (d.instrument || '')).toUpperCase();
    return s.includes('MODIS') || s.includes('TERRA') || s.includes('AQUA');
  }).length;

  const realFirmsCount = detections.filter((d) => d.data_provenance === 'REAL_FIRMS').length;

  // Fetch real-time NASA FIRMS connection status from backend
  const loadStatus = useCallback(async () => {
    try {
      const res = await getSatelliteStatus();
      setSatelliteStatus(res);
    } catch (e) {
      console.warn('Failed to fetch NASA FIRMS status:', e);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus, isBackendHealthy]);

  // Handle live synchronization trigger
  const handleSyncFirms = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await syncSatelliteFirms({
        satellite: selectedSatellite,
        days: selectedDays,
      });
      setSyncFeedback(res);
      await loadStatus();
      if (onRefresh) onRefresh();
    } catch (err) {
      setSyncFeedback({
        status: 'API ERROR',
        message: err.message || 'NASA FIRMS synchronization failed.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Real NASA FIRMS Presets for 1-click test
  const REAL_FIRMS_PRESETS = [
    {
      label: 'Jamshedpur (VIIRS 375m)',
      region: 'Tata Steel Industrial Cluster',
      sensor: 'VIIRS 375m NRT',
      csv: `# NASA FIRMS VIIRS 375m NRT Real Observation
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8046,86.2029,368.5,0.4,0.4,2026-09-10,1345,N,VIIRS,nominal,2.0NRT,298.2,78.2,D`,
      name: 'firms_jamshedpur_viirs.csv',
    },
    {
      label: 'Hazira Flare (Surat)',
      region: 'LNG & Petrochemical Terminal',
      sensor: 'VIIRS 375m NRT',
      csv: `# NASA FIRMS VIIRS Petrochemical Flare Corridor
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.1702,72.8311,378.2,0.38,0.38,2026-09-10,1410,N,VIIRS,high,2.0NRT,302.1,68.4,D`,
      name: 'firms_hazira_flare.csv',
    },
    {
      label: 'Jamnagar Refinery',
      region: 'World Largest Refining Hub',
      sensor: 'MODIS 1km NRT',
      csv: `# NASA FIRMS MODIS 1km Flare Cluster
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2026-09-10,1230,Terra,MODIS,95,6.1NRT,295.4,54.0,D`,
      name: 'firms_jamnagar_refinery.csv',
    },
  ];

  // Process uploaded satellite files
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
        if (onAnalysisSuccess) onAnalysisSuccess(result.detection);
        if (onSelectDetection) onSelectDetection(result.detection);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[SATRA ERROR] Satellite file analysis error:', err);
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

  // Determine Connection Status Display
  const getConnectionStatusInfo = () => {
    if (!isBackendHealthy) {
      return {
        label: 'OFFLINE',
        color: 'red',
        badge: '503 ERR',
        subtext: 'Backend service offline',
        statusType: 'error',
      };
    }

    const st = satelliteStatus?.status || 'OFFLINE';

    if (st === 'API KEY REQUIRED') {
      return {
        label: 'API KEY REQUIRED',
        color: 'amber',
        badge: 'CONFIG .ENV',
        subtext: 'Configure NASA_FIRMS_MAP_KEY',
        statusType: 'warning',
      };
    }

    if (st === 'API ERROR') {
      return {
        label: 'API ERROR',
        color: 'red',
        badge: 'HTTP ERR',
        subtext: satelliteStatus?.message || 'NASA FIRMS connection error',
        statusType: 'error',
      };
    }

    if (st === 'NO DATA') {
      return {
        label: 'NO DATA',
        color: 'cyan',
        badge: '0 DETECTIONS',
        subtext: '0 hotspots in target window',
        statusType: 'info',
      };
    }

    return {
      label: 'CONNECTED',
      color: 'emerald',
      badge: '200 OK',
      subtext: 'NASA LANCE / FIRMS Active',
      statusType: 'success',
    };
  };

  const connInfo = getConnectionStatusInfo();

  const displayLastSync = satelliteStatus?.last_sync
    ? new Date(satelliteStatus.last_sync).toUTCString().replace('GMT', 'UTC')
    : 'STANDBY (No sync performed yet)';

  const satellites = [
    {
      id: 'viirs-noaa20',
      name: 'NOAA-20 (JPSS-1)',
      instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
      operator: 'NOAA / NASA',
      resolution: '375m (I-Band I4/I5)',
      orbit: 'Sun-synchronous, 824 km altitude, 50-min orbital separation from S-NPP',
      crossing: '13:30 Ascending / 01:30 Descending',
      activeDetections: noaa20Count,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 3 hours latency (NASA FIRMS NRT)',
    },
    {
      id: 'viirs-snpp',
      name: 'Suomi NPP (S-NPP)',
      instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
      operator: 'NASA / NOAA',
      resolution: '375m (I-Band I4/I5)',
      orbit: 'Sun-synchronous, 824 km altitude, 98.7° inclination',
      crossing: '13:30 Ascending / 01:30 Descending (Local Solar Time)',
      activeDetections: snppCount,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 3 hours latency (NASA FIRMS NRT)',
    },
    {
      id: 'viirs-noaa21',
      name: 'NOAA-21 (JPSS-2)',
      instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
      operator: 'NOAA / NASA',
      resolution: '375m (I-Band I4/I5)',
      orbit: 'Sun-synchronous, 824 km altitude',
      crossing: '13:30 Ascending / 01:30 Descending',
      activeDetections: noaa21Count,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 3 hours latency (NASA FIRMS NRT)',
    },
    {
      id: 'modis-terra-aqua',
      name: 'Terra & Aqua Constellation',
      instrument: 'MODIS (Moderate Resolution Imaging Spectroradiometer)',
      operator: 'NASA GSFC',
      resolution: '1 km Thermal Bands (21, 22, 31, 32)',
      orbit: 'Sun-synchronous, 705 km altitude',
      crossing: '10:30 (Terra) / 13:30 (Aqua)',
      activeDetections: modisCount,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 4 hours latency (NASA FIRMS NRT)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* 
        ======================================================================
        SECTION 1: PURPOSE BANNER & CONTROLS
        ======================================================================
      */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(14, 28, 48, 0.95) 0%, rgba(8, 18, 32, 0.98) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '12px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
          boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '300px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38BDF8',
              flexShrink: 0,
              boxShadow: '0 0 16px rgba(56, 189, 248, 0.25)',
            }}
          >
            <Satellite size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '0.02em' }}>
                Satellite Data Ingestion &amp; Analysis Workspace
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38BDF8',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                08 MODULE
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8', lineHeight: 1.45 }}>
              Ingest, validate, and analyze NASA FIRMS spaceborne radiometry (VIIRS 375m &amp; MODIS 1km) or upload custom telemetry archives.
            </p>
          </div>
        </div>

        {/* Action Controls & Satellite Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedSatellite}
            onChange={(e) => setSelectedSatellite(e.target.value)}
            disabled={isSyncing}
            style={{
              background: 'rgba(5, 11, 20, 0.85)',
              color: 'var(--text-primary)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Select NASA FIRMS NRT Satellite Sensor"
          >
            <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 (NRT 375m)</option>
            <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21 (NRT 375m)</option>
            <option value="VIIRS_SNPP_NRT">VIIRS S-NPP (NRT 375m)</option>
            <option value="MODIS_NRT">MODIS Terra/Aqua (NRT 1km)</option>
          </select>

          <button
            onClick={handleSyncFirms}
            disabled={isSyncing}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.35) 0%, rgba(16, 185, 129, 0.35) 100%)',
              border: '1px solid var(--primary-cyan)',
              color: '#FFFFFF',
              boxShadow: '0 0 16px rgba(56, 189, 248, 0.25)',
              fontWeight: 700,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              opacity: isSyncing ? 0.7 : 1,
              borderRadius: '8px',
            }}
            title="Trigger live NASA FIRMS Area API query"
          >
            <RefreshCw size={15} className={isSyncing ? 'spin' : ''} style={{ color: 'var(--primary-cyan)' }} />
            <span>{isSyncing ? 'Syncing FIRMS...' : 'Sync NASA FIRMS'}</span>
          </button>

          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: '12.5px',
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '8px',
              }}
              title="Open multi-file upload modal"
            >
              <Layers size={15} style={{ color: 'var(--ice-blue)' }} />
              <span>Batch Modal</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Feedback Message Banner (if triggered) */}
      {syncFeedback && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background:
              syncFeedback.status === 'CONNECTED'
                ? 'rgba(69, 212, 131, 0.12)'
                : syncFeedback.status === 'NO DATA'
                ? 'rgba(56, 189, 248, 0.12)'
                : 'rgba(255, 69, 58, 0.12)',
            border: `1px solid ${
              syncFeedback.status === 'CONNECTED'
                ? 'rgba(69, 212, 131, 0.35)'
                : syncFeedback.status === 'NO DATA'
                ? 'rgba(56, 189, 248, 0.35)'
                : 'rgba(255, 69, 58, 0.35)'
            }`,
            color:
              syncFeedback.status === 'CONNECTED'
                ? '#45D483'
                : syncFeedback.status === 'NO DATA'
                ? '#38BDF8'
                : '#FF6B6B',
          }}
        >
          {syncFeedback.status === 'CONNECTED' ? (
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          ) : (
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <strong>NASA FIRMS Ingestion Status ({syncFeedback.status}):</strong> {syncFeedback.message}
            {syncFeedback.new_detections_count > 0 && (
              <span style={{ marginLeft: '8px', color: '#FFFFFF', fontWeight: 600 }}>
                ({syncFeedback.new_detections_count} new thermal detections committed to DB)
              </span>
            )}
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* 
        ======================================================================
        SECTION 2: KPI ROW
        ======================================================================
      */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: 0 }}>
        <KpiCard
          title="NASA FIRMS Pipe"
          value={connInfo.label}
          subtext={connInfo.subtext}
          icon={connInfo.statusType === 'success' ? CheckCircle2 : connInfo.statusType === 'warning' ? KeyRound : AlertCircle}
          accentColor={connInfo.color}
          badgeText={connInfo.badge}
        />

        <KpiCard
          title="NASA FIRMS Records"
          value={
            satelliteStatus?.total_real_firms_records !== undefined
              ? `${satelliteStatus.total_real_firms_records} HOTSPOTS`
              : `${realFirmsCount} HOTSPOTS`
          }
          subtext="Verified spaceborne observations"
          icon={Radio}
          accentColor="ice"
          badgeText="REAL_FIRMS"
        />

        <KpiCard
          title="Last Synchronized"
          value={displayLastSync}
          subtext={satelliteStatus?.last_sync ? 'Automated telemetry sync' : 'Latest observation timestamp'}
          icon={Clock}
          accentColor="amber"
          badgeText="UTC SYNC"
        />

        <KpiCard
          title="Constellation Sensors"
          value="VIIRS / MODIS"
          subtext="NOAA-20, S-NPP, Terra & Aqua"
          icon={Satellite}
          accentColor="cyan"
          badgeText="Operational"
        />
      </div>

      {/* 
        ======================================================================
        SECTION 3: FULL DEDICATED UPLOAD & AI ANALYSIS WORKSPACE (SPACIOUS)
        ======================================================================
      */}
      <div className="satellite-top-workspace">
        {/* LEFT COLUMN: DRAG & DROP ZONE, PRESETS, PROGRESS, AND RESULTS */}
        <div
          ref={uploadCardRef}
          className="card-panel satellite-upload-card"
          style={{
            marginBottom: 0,
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: '14px',
            padding: '24px 28px',
            boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            height: 'auto',
            alignSelf: 'start',
          }}
        >
          <div className="panel-header" style={{ marginBottom: '16px', borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>
                <UploadCloud size={20} style={{ color: '#38BDF8' }} />
                <span>UPLOAD &amp; ANALYZE SATELLITE DATA</span>
              </div>
              <div className="panel-subtitle" style={{ fontSize: '12.5px', marginTop: '4px', color: '#94A3B8' }}>
                Support for NASA FIRMS VIIRS 375m, MODIS 1km, NRT archives, and custom telemetry
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
              border: isDragging ? '2px dashed #38BDF8' : '2px dashed rgba(56, 189, 248, 0.35)',
              borderRadius: '12px',
              padding: '28px 20px',
              textAlign: 'center',
              background: isDragging ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 32, 50, 0.5)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.json,.geojson,.txt,.zip"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                color: '#38BDF8',
                boxShadow: '0 0 16px rgba(56, 189, 248, 0.2)',
              }}
            >
              <UploadCloud size={28} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
              Drag &amp; drop satellite observations here, or click to browse
            </div>
            <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '4px', maxWidth: '480px', margin: '4px auto 0 auto' }}>
              Supports NASA FIRMS CSV, JSON, GeoJSON, and large ZIP archives with automated sensor band calibration.
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
              {['CSV', 'JSON', 'MODIS 1km', 'VIIRS 375m', 'NASA FIRMS NRT', 'ZIP ARCHIVE'].map((badge) => (
                <span
                  key={badge}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    color: '#38BDF8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Selected File Details (if any) */}
          {selectedFile && (
            <div
              style={{
                marginTop: '14px',
                background: 'rgba(15, 32, 50, 0.7)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <FileText size={20} style={{ color: '#38BDF8', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB &bull; Ready for SATRA AI Core
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setLastFiles(null);
                  setAnalysisError(null);
                  setAnalysisResult(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RotateCcw size={12} />
                <span>Clear</span>
              </button>
            </div>
          )}

          {/* 1-Click Operational Test Presets */}
          <div style={{ marginTop: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
              Or test with real NASA FIRMS satellite pass:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {REAL_FIRMS_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePresetSelect(p)}
                  disabled={isAnalyzing}
                  className="btn-secondary"
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(15, 32, 50, 0.75)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderRadius: '8px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>{p.label}</div>
                  <div style={{ fontSize: '11px', color: '#38BDF8' }}>{p.sensor}</div>
                  <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{p.region}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Button */}
          <div style={{ marginTop: '18px', display: 'flex', gap: '12px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="btn-primary"
              style={{
                flex: 1,
                padding: '12px 18px',
                fontSize: '14px',
                fontWeight: 700,
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(2, 132, 199, 0.5) 100%)',
                border: '1px solid var(--primary-cyan)',
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)',
                borderRadius: '8px',
              }}
            >
              <UploadCloud size={16} />
              <span>Upload &amp; Analyze Satellite Data</span>
            </button>
          </div>

          {/* In-Flight 5-Stage Analysis Progress Flow */}
          {isAnalyzing && (
            <div
              style={{
                background: 'rgba(15, 32, 50, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '10px',
                padding: '16px 18px',
                marginTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Loader2 size={18} className="spin" style={{ color: '#38BDF8' }} />
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF' }}>
                  SATRA AI Pipeline Processing Satellite Telemetry...
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { step: 0, label: 'Reading Satellite Data', desc: 'Validating NASA FIRMS/VIIRS/MODIS telemetry schema' },
                  { step: 1, label: 'Finding Location', desc: 'Extracting precise WGS-84 coordinates & spatial index' },
                  { step: 2, label: 'AI Thermal Radiometry', desc: 'Evaluating brightness temperatures and FRP against ML models' },
                  { step: 3, label: 'Checking Context & Evidence', desc: 'Cross-referencing GIS land use, industrial facilities, and persistence' },
                  { step: 4, label: 'Risk Assessment & Classification', desc: 'Generating multi-class prediction and alert severity' },
                ].map((s) => {
                  const isDone = analysisStep > s.step;
                  const isCurrent = analysisStep === s.step;
                  return (
                    <div
                      key={s.step}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: isCurrent ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        border: isCurrent ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: isDone ? '#10B981' : isCurrent ? '#38BDF8' : 'rgba(255,255,255,0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          color: '#FFFFFF',
                          flexShrink: 0,
                        }}
                      >
                        {isDone ? '✓' : s.step + 1}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: isCurrent ? '#38BDF8' : '#FFFFFF' }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>
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
                marginTop: '14px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12.5px',
                color: '#FCA5A5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span>{analysisError}</span>
              </div>
              {lastFiles && (
                <button
                  onClick={() => handleProcessFile(lastFiles)}
                  disabled={isAnalyzing}
                  className="btn-primary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#0284C7',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* AI Classification Breakdown Result */}
          {analysisResult && !isAnalyzing && (
            <div
              style={{
                marginTop: '18px',
                padding: '16px',
                background: 'rgba(15, 32, 50, 0.85)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} style={{ color: '#10B981' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                    AI Analysis Completed
                  </span>
                </div>
                {analysisResult?.detection && (
                  <button
                    onClick={() => {
                      if (onFocusDetection) onFocusDetection(analysisResult.detection);
                      if (onNavigate) onNavigate('earth-intel');
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      color: '#38BDF8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>View on 3D Earth</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <AiClassificationSection analysisResult={analysisResult} compact={false} />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SATRA AUTOMATED PIPELINE WORKFLOW EXPLANATION */}
        <div
          className="card-panel satellite-workflow-card"
          style={{
            marginBottom: 0,
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: '14px',
            padding: '24px 28px',
            boxShadow: '0 10px 32px rgba(0, 0, 0, 0.45)',
            height: uploadCardHeight ? `${uploadCardHeight}px` : 'auto',
            maxHeight: uploadCardHeight ? `${uploadCardHeight}px` : 'none',
            boxSizing: 'border-box',
            alignSelf: 'start',
          }}
        >
          <div className="panel-header" style={{ marginBottom: '16px', borderBottom: 'none', paddingBottom: 0, flexShrink: 0 }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>
                <Cpu size={20} style={{ color: '#38BDF8' }} />
                <span>SATRA AUTOMATED PIPELINE WORKFLOW</span>
              </div>
              <div className="panel-subtitle" style={{ fontSize: '12.5px', marginTop: '4px', color: '#94A3B8' }}>
                End-to-end processing pipeline from spaceborne sensor to actionable alert
              </div>
            </div>
          </div>

          <div className="satellite-workflow-scroll">
            {[
              {
                num: '01',
                title: 'Precision Geocoding & Coordinate Extraction',
                desc: 'Reads raw satellite telemetry, validates WGS-84 coordinates, and accounts for scan/track spatial distortion.',
                tag: 'GEODETIC INGESTION',
              },
              {
                num: '02',
                title: 'Sensor Radiometry & FRP Normalization',
                desc: 'Calibrates 375m VIIRS I-Bands and 1km MODIS thermal channels, computing normalized Fire Radiative Power (MW).',
                tag: 'RADIOMETRY',
              },
              {
                num: '03',
                title: 'Multi-Class AI Thermal Inference',
                desc: 'Evaluates FRP, brightness temperatures, and background differentials against trained AI classification models.',
                tag: 'AI CLASSIFICATION',
              },
              {
                num: '04',
                title: 'Geographic Context & Asset Buffering',
                desc: 'Cross-references high-resolution OpenStreetMap industrial boundaries, petrochemical flare stacks, and forest reserves.',
                tag: 'GIS OVERLAY',
              },
              {
                num: '05',
                title: 'Temporal Persistence & Recurrence Scoring',
                desc: 'Checks multi-pass historical cluster history to differentiate continuous industrial flaring from sudden wildfire outbreaks.',
                tag: 'PERSISTENCE',
              },
              {
                num: '06',
                title: 'Dynamic Risk & Severity Calculation',
                desc: 'Synthesizes FRP, asset proximity, and confidence to assign CRITICAL, HIGH, or MEDIUM risk alert statuses.',
                tag: 'RISK SCORING',
              },
              {
                num: '07',
                title: 'Human Verification & Flight Controller Routing',
                desc: 'Generates automated telemetry briefs, escalating ambiguous or severe anomalies for human-in-the-loop review.',
                tag: 'MISSION CONTROL',
              },
            ].map((step) => (
              <div
                key={step.num}
                style={{
                  background: 'rgba(15, 32, 50, 0.55)',
                  border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#38BDF8',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    lineHeight: 1.2,
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {step.num}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                      {step.title}
                    </div>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        color: 'var(--ice-blue)',
                        background: 'rgba(56, 189, 248, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {step.tag}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px', lineHeight: 1.45 }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 
        ======================================================================
        SECTION 4: SATELLITE CONSTELLATIONS SPECIFICATIONS & STATUS
        ======================================================================
      */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe size={18} style={{ color: '#38BDF8' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '0.02em' }}>
            Active Spaceborne Constellations &amp; Sensors
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '18px' }}>
          {satellites.map((sat) => (
            <div
              key={sat.id}
              className="card-panel"
              style={{
                marginBottom: 0,
                background: 'rgba(11, 23, 38, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                borderRadius: '12px',
                padding: '18px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>{sat.name}</div>
                    <div style={{ fontSize: '12px', color: '#38BDF8', letterSpacing: '0.02em', marginTop: '2px' }}>{sat.instrument}</div>
                  </div>
                  <div
                    style={{
                      padding: '4px 9px',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: sat.status === 'OPERATIONAL' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: sat.status === 'OPERATIONAL' ? '#10B981' : '#EF4444',
                      border: `1px solid ${sat.status === 'OPERATIONAL' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                    }}
                  >
                    {sat.status}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', letterSpacing: '0.04em' }}>
                      Agency / Operator
                    </span>
                    <strong style={{ color: '#F8FAFC' }}>{sat.operator}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', letterSpacing: '0.04em' }}>
                      Spatial Resolution
                    </span>
                    <span className="mono-cell" style={{ color: '#38BDF8', fontWeight: 600 }}>{sat.resolution}</span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', letterSpacing: '0.04em' }}>
                      Orbital Regime
                    </span>
                    <span>{sat.orbit}</span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', display: 'block', letterSpacing: '0.04em' }}>
                      Equatorial Crossing Time
                    </span>
                    <span className="mono-cell">{sat.crossing}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '18px',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{sat.freshness}</span>
                <strong className="mono-cell" style={{ color: 'var(--primary-cyan)', fontSize: '12.5px' }}>
                  {sat.activeDetections} observations logged
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
