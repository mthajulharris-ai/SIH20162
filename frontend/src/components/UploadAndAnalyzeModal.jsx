import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Globe,
  Compass,
  Cpu,
  ShieldAlert,
  Clock,
  Radio,
  Zap,
  Check,
  ChevronRight,
  Database,
} from 'lucide-react';
import { uploadAndAnalyzeSatelliteFile, predictAndStoreObservation } from '../services/api';

/**
 * Built-in real satellite test records for immediate operator analysis
 */
const BUILT_IN_SATELLITE_SAMPLES = [
  {
    id: 'firms-viirs-1',
    name: 'NASA FIRMS VIIRS 375m — Jamshedpur Industrial Belt',
    desc: 'Real VIIRS I-Band satellite detection near Jamshedpur steelworks',
    csvContent: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8046,86.2029,335.4,0.39,0.36,2024-03-01,0730,N,VIIRS,high,2.0NRT,298.2,18.5,D`,
    lat: 22.8046,
    lon: 86.2029,
    date: '2024-03-01',
    time: '0730',
    satellite: 'VIIRS (S-NPP)',
    frp: 18.5,
    temp: 335.4,
  },
  {
    id: 'hazira-petrochem',
    name: 'VIIRS 375m — Hazira Petrochemical Refinery Flare Cluster',
    desc: 'High radiative energy industrial hydrocarbon flare, Surat coastal zone',
    csvContent: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.1702,72.8311,378.2,0.37,0.35,2024-03-02,1845,N,VIIRS,high,2.0NRT,312.0,68.4,N`,
    lat: 21.1702,
    lon: 72.8311,
    date: '2024-03-02',
    time: '1845',
    satellite: 'VIIRS (NOAA-20)',
    frp: 68.4,
    temp: 378.2,
  },
  {
    id: 'jamnagar-cluster',
    name: 'MODIS 1km — Jamnagar Refinery Complex',
    desc: 'Persistent multi-day thermal source observation',
    csvContent: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2024-03-03,1030,Aqua,MODIS,nominal,6.1NRT,305.8,54.0,D`,
    lat: 22.4707,
    lon: 70.0577,
    date: '2024-03-03',
    time: '1030',
    satellite: 'MODIS (Aqua)',
    frp: 54.0,
    temp: 362.5,
  },
];

export function UploadAndAnalyzeModal({
  isOpen,
  onClose,
  onAnalysisSuccess,
  onViewExactLocation,
}) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'samples' | 'manual'

  // Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedPreview, setParsedPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    latitude: '22.8046',
    longitude: '86.2029',
    brightness: '345.2',
    bright_t31: '298.0',
    frp: '35.4',
    satellite: 'VIIRS_SNPP_NRT',
    confidence: 'high',
    acq_date: new Date().toISOString().slice(0, 10),
    acq_time: '1200',
    daynight: 'D',
  });

  // Pipeline Status & Results
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  if (!isOpen) return null;

  // Handle client-side parsing & preview of uploaded file
  const handleFileSelect = (file) => {
    setErrorMsg(null);
    setAnalysisResult(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));

        if (lines.length < 2) {
          setErrorMsg('Uploaded file has no data rows. Must contain headers and at least 1 observation row.');
          setParsedPreview(null);
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const latIdx = headers.findIndex((h) => h === 'latitude' || h === 'lat');
        const lonIdx = headers.findIndex((h) => h === 'longitude' || h === 'lon' || h === 'long');
        const brightIdx = headers.findIndex((h) => h === 'brightness' || h === 'bright_ti4' || h === 'temp');
        const frpIdx = headers.findIndex((h) => h === 'frp');
        const dateIdx = headers.findIndex((h) => h === 'acq_date' || h === 'date');
        const timeIdx = headers.findIndex((h) => h === 'acq_time' || h === 'time');
        const satIdx = headers.findIndex((h) => h === 'satellite' || h === 'source');

        if (latIdx === -1 || lonIdx === -1) {
          setErrorMsg('Missing required location columns: "latitude" and "longitude" must be present in the CSV.');
          setParsedPreview(null);
          return;
        }

        // Preview first row
        const firstRow = lines[1].split(',').map((v) => v.trim());
        const rawLat = parseFloat(firstRow[latIdx]);
        const rawLon = parseFloat(firstRow[lonIdx]);

        if (isNaN(rawLat) || rawLat < -90.0 || rawLat > 90.0) {
          setErrorMsg(`Invalid latitude coordinate ${firstRow[latIdx]}. Range must be between -90° and +90°.`);
          setParsedPreview(null);
          return;
        }
        if (isNaN(rawLon) || rawLon < -180.0 || rawLon > 180.0) {
          setErrorMsg(`Invalid longitude coordinate ${firstRow[lonIdx]}. Range must be between -180° and +180°.`);
          setParsedPreview(null);
          return;
        }

        setParsedPreview({
          recordCount: lines.length - 1,
          latitude: rawLat,
          longitude: rawLon,
          brightness: brightIdx !== -1 ? parseFloat(firstRow[brightIdx]) : null,
          frp: frpIdx !== -1 ? parseFloat(firstRow[frpIdx]) : null,
          acq_date: dateIdx !== -1 ? firstRow[dateIdx] : new Date().toISOString().slice(0, 10),
          acq_time: timeIdx !== -1 ? firstRow[timeIdx] : '1200',
          satellite: satIdx !== -1 ? firstRow[satIdx] : 'VIIRS',
        });
      } catch (err) {
        setErrorMsg(`Failed to parse satellite file: ${err.message}`);
        setParsedPreview(null);
      }
    };
    reader.readAsText(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Select a built-in sample
  const handleSelectSample = (sample) => {
    const blob = new Blob([sample.csvContent], { type: 'text/csv' });
    const file = new File([blob], `${sample.id}.csv`, { type: 'text/csv' });
    handleFileSelect(file);
    setActiveTab('upload');
  };

  // Execute Core AI Analysis Pipeline
  const handleExecuteAnalysis = async () => {
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      let result;

      if (activeTab === 'manual') {
        // Validate manual fields
        const lat = parseFloat(manualForm.latitude);
        const lon = parseFloat(manualForm.longitude);
        const bright = parseFloat(manualForm.brightness);

        if (isNaN(lat) || lat < -90.0 || lat > 90.0) {
          throw new Error(`Latitude must be a valid number between -90° and +90°. Received: ${manualForm.latitude}`);
        }
        if (isNaN(lon) || lon < -180.0 || lon > 180.0) {
          throw new Error(`Longitude must be a valid number between -180° and +180°. Received: ${manualForm.longitude}`);
        }
        if (isNaN(bright) || bright <= 0) {
          throw new Error(`Brightness temperature must be greater than 0 K.`);
        }

        const payload = {
          latitude: lat,
          longitude: lon,
          brightness: bright,
          bright_t31: manualForm.bright_t31 ? parseFloat(manualForm.bright_t31) : null,
          frp: manualForm.frp ? parseFloat(manualForm.frp) : null,
          confidence: manualForm.confidence,
          acq_date: manualForm.acq_date,
          acq_time: manualForm.acq_time,
          source: manualForm.satellite,
          instrument: manualForm.satellite.includes('MODIS') ? 'MODIS' : 'VIIRS',
          daynight: manualForm.daynight,
          data_provenance: 'SAMPLE',
        };

        const response = await predictAndStoreObservation(payload);
        // Format to standardized response shape
        result = {
          status: 'SUCCESS',
          message: 'Observation classified and stored successfully.',
          exact_location: {
            latitude: response.detection.latitude,
            longitude: response.detection.longitude,
          },
          observation: {
            acq_date: response.detection.acq_date,
            acq_time: response.detection.acq_time,
            satellite: response.detection.source,
            instrument: response.detection.instrument,
            daynight: response.detection.daynight,
          },
          thermal_data: {
            frp: response.detection.frp,
            brightness: response.detection.brightness,
            bright_t31: response.detection.bright_t31,
          },
          prediction: {
            predicted_class: response.prediction.predicted_class,
            confidence: response.prediction.confidence,
            model_version: response.prediction.model_version,
            class_probabilities: response.prediction.class_probabilities || {},
          },
          risk: {
            alert_level: response.prediction.alert_level,
            verification_status: 'REQUIRES_VERIFICATION',
          },
          provenance: response.detection.data_provenance,
          detection: response.detection,
        };
      } else {
        // Upload File Path
        if (!selectedFile) {
          throw new Error('Please select or upload a satellite observation file first.');
        }
        result = await uploadAndAnalyzeSatelliteFile(selectedFile);
      }

      setAnalysisResult(result);
      if (onAnalysisSuccess && result.detection) {
        onAnalysisSuccess(result.detection);
      }
    } catch (err) {
      console.error('Pipeline error:', err);
      setErrorMsg(err.message || 'AI analysis execution failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // User clicks "VIEW EXACT LOCATION"
  const handleFocusClick = () => {
    if (analysisResult && analysisResult.detection) {
      if (onViewExactLocation) {
        onViewExactLocation(analysisResult.detection);
      }
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 18, 0.82)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #0B1726 0%, #060E18 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 32px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          color: '#F8FAFC',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 32, 50, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-cyan)',
              }}
            >
              <UploadCloud size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.04em', margin: 0, color: '#FFFFFF' }}>
                SATRA Core Pipeline &bull; Upload & Analyze
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Automated Location Extraction &bull; AI Thermal Classification &bull; Exact Earth/GIS Spatial Sync
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="satra-icon-btn"
            style={{ width: '32px', height: '32px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tabs Selector */}
          {!analysisResult && (
            <div
              style={{
                display: 'flex',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '4px',
              }}
            >
              <button
                onClick={() => setActiveTab('upload')}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'upload' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                  background: activeTab === 'upload' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'upload' ? '#FFFFFF' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <FileText size={14} />
                <span>Upload Satellite File (.csv, .json)</span>
              </button>

              <button
                onClick={() => setActiveTab('samples')}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'samples' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                  background: activeTab === 'samples' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'samples' ? '#FFFFFF' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Database size={14} />
                <span>Real FIRMS Samples</span>
              </button>

              <button
                onClick={() => setActiveTab('manual')}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'manual' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                  background: activeTab === 'manual' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'manual' ? '#FFFFFF' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Compass size={14} />
                <span>Custom Coordinate Input</span>
              </button>
            </div>
          )}

          {/* TAB 1: UPLOAD SATELLITE FILE */}
          {!analysisResult && activeTab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Drag & Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--primary-cyan)' : 'rgba(56, 189, 248, 0.3)'}`,
                  background: isDragging ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                  borderRadius: '10px',
                  padding: '36px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".csv,.txt,.json,.geojson"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-cyan)',
                    marginBottom: '12px',
                  }}
                >
                  <UploadCloud size={24} />
                </div>

                <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                  {selectedFile ? selectedFile.name : 'Drop satellite observation file here, or browse'}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Supports standard NASA FIRMS CSVs (VIIRS 375m, MODIS 1km) and JSON
                </div>
              </div>

              {/* Parsed Pre-Validation Indicator */}
              {parsedPreview && (
                <div
                  style={{
                    background: 'rgba(15, 32, 50, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 700 }}>
                      <CheckCircle2 size={15} />
                      <span>Data Validated & Ready for AI Inference</span>
                    </div>
                    <span style={{ color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {parsedPreview.recordCount} Observation{parsedPreview.recordCount > 1 ? 's' : ''} Detected
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '10px',
                      marginTop: '4px',
                      background: 'rgba(5, 11, 20, 0.6)',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Exact Latitude</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#FFFFFF' }}>
                        {parsedPreview.latitude.toFixed(4)}°
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Exact Longitude</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#FFFFFF' }}>
                        {parsedPreview.longitude.toFixed(4)}°
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Brightness Temp</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ice-blue)' }}>
                        {parsedPreview.brightness ? `${parsedPreview.brightness.toFixed(1)} K` : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Radiative Power (FRP)</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--warning-amber)' }}>
                        {parsedPreview.frp ? `${parsedPreview.frp.toFixed(1)} MW` : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timestamp</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#FFFFFF' }}>
                        {parsedPreview.acq_date} {parsedPreview.acq_time} UTC
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REAL FIRMS SAMPLES */}
          {!analysisResult && activeTab === 'samples' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Select a verified NASA FIRMS satellite observation from the ground validation registry:
              </div>

              {BUILT_IN_SATELLITE_SAMPLES.map((sample) => (
                <div
                  key={sample.id}
                  onClick={() => handleSelectSample(sample)}
                  style={{
                    background: 'rgba(15, 32, 50, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary-cyan)';
                    e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.2)';
                    e.currentTarget.style.background = 'rgba(15, 32, 50, 0.6)';
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>{sample.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sample.desc}</div>
                    <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--ice-blue)', marginTop: '4px' }}>
                      Exact: {sample.lat}° N, {sample.lon}° E &bull; {sample.satellite} &bull; FRP: {sample.frp} MW
                    </div>
                  </div>

                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11px', gap: '4px', whiteSpace: 'nowrap' }}
                  >
                    <span>Load Sample</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: MANUAL INPUT */}
          {!analysisResult && activeTab === 'manual' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '14px',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Latitude (-90.0 to +90.0) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualForm.latitude}
                  onChange={(e) => setManualForm({ ...manualForm, latitude: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Longitude (-180.0 to +180.0) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualForm.longitude}
                  onChange={(e) => setManualForm({ ...manualForm, longitude: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Brightness Temperature (K) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={manualForm.brightness}
                  onChange={(e) => setManualForm({ ...manualForm, brightness: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Fire Radiative Power (MW)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={manualForm.frp}
                  onChange={(e) => setManualForm({ ...manualForm, frp: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Satellite Sensor
                </label>
                <select
                  value={manualForm.satellite}
                  onChange={(e) => setManualForm({ ...manualForm, satellite: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                >
                  <option value="VIIRS_SNPP_NRT">VIIRS (Suomi NPP 375m)</option>
                  <option value="VIIRS_NOAA20_NRT">VIIRS (NOAA-20 JPSS-1)</option>
                  <option value="MODIS_NRT">MODIS (Terra / Aqua 1km)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Observation Date
                </label>
                <input
                  type="date"
                  value={manualForm.acq_date}
                  onChange={(e) => setManualForm({ ...manualForm, acq_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: 'rgba(11, 23, 38, 0.8)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Validation Error Alert */}
          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#FCA5A5',
                fontSize: '12.5px',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, color: 'var(--critical-red)' }} />
              <div>
                <strong>Validation Notice:</strong> {errorMsg}
              </div>
            </div>
          )}

          {/* 
            ============================================================
            SECTION 8: STANDARDIZED SATRA ANALYSIS RESULT VIEW
            ============================================================
          */}
          {analysisResult && (
            <div
              style={{
                background: 'rgba(11, 23, 38, 0.95)',
                border: '1px solid var(--primary-cyan)',
                borderRadius: '10px',
                padding: '20px 24px',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), inset 0 0 24px rgba(56, 189, 248, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                animation: 'fadeIn 0.25s ease-out',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} style={{ color: 'var(--primary-cyan)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF' }}>
                    SATRA ANALYSIS RESULT
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: analysisResult.risk.alert_level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                    color: analysisResult.risk.alert_level === 'CRITICAL' ? 'var(--thermal-red)' : 'var(--ice-blue)',
                    border: `1px solid ${analysisResult.risk.alert_level === 'CRITICAL' ? 'var(--thermal-red)' : 'var(--primary-cyan)'}`,
                  }}
                >
                  RISK: {analysisResult.risk.alert_level}
                </div>
              </div>

              {/* Grid of Section 8 Attributes */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* 📍 EXACT LOCATION */}
                <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Compass size={14} />
                    <span>📍 EXACT LOCATION</span>
                  </div>
                  <div style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                    Latitude: <strong>{analysisResult.exact_location.latitude.toFixed(6)}°</strong>
                  </div>
                  <div style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: '#FFFFFF', marginTop: '2px' }}>
                    Longitude: <strong>{analysisResult.exact_location.longitude.toFixed(6)}°</strong>
                  </div>
                </div>

                {/* 🕐 OBSERVATION */}
                <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} />
                    <span>🕐 OBSERVATION</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#FFFFFF' }}>
                    Date: <strong>{analysisResult.observation.acq_date}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: '#FFFFFF', marginTop: '2px' }}>
                    Time: <strong>{analysisResult.observation.acq_time} UTC</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Satellite: {analysisResult.observation.satellite}
                  </div>
                </div>

                {/* 🔥 AI CLASSIFICATION */}
                <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--thermal-red)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Flame size={14} />
                    <span>🔥 AI CLASSIFICATION</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                    {analysisResult.prediction.predicted_class}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ice-blue)', marginTop: '2px' }}>
                    Confidence: <strong>{(analysisResult.prediction.confidence * 100).toFixed(1)}%</strong>
                  </div>
                </div>

                {/* 🌡 THERMAL DATA */}
                <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Radio size={14} />
                    <span>🌡 THERMAL DATA</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#FFFFFF' }}>
                    FRP: <strong>{analysisResult.thermal_data.frp ? `${parseFloat(analysisResult.thermal_data.frp).toFixed(1)} MW` : 'N/A'}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: '#FFFFFF', marginTop: '2px' }}>
                    Brightness: <strong>{analysisResult.thermal_data.brightness ? `${parseFloat(analysisResult.thermal_data.brightness).toFixed(1)} K` : 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Model & Provenance Strip */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'rgba(5, 11, 20, 0.8)',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                }}
              >
                <div>
                  🤖 <strong>MODEL:</strong> {analysisResult.prediction.model_version}
                </div>
                <div>
                  🛡 <strong>PROVENANCE:</strong> <span style={{ color: 'var(--ice-blue)', fontWeight: 700 }}>{analysisResult.provenance}</span>
                </div>
              </div>

              {/* Action: VIEW EXACT LOCATION ON EARTH / GIS */}
              <button
                onClick={handleFocusClick}
                className="btn-primary"
                style={{
                  padding: '12px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 20px rgba(56, 189, 248, 0.35)',
                }}
              >
                <Globe size={16} />
                <span>📍 VIEW EXACT LOCATION ON EARTH / GIS</span>
              </button>
            </div>
          )}

          {/* Action Trigger Button */}
          {!analysisResult && (
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={onClose}
                className="btn-secondary"
                style={{ padding: '9px 18px', fontSize: '12px' }}
                disabled={isProcessing}
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteAnalysis}
                className="btn-primary"
                disabled={isProcessing || (activeTab === 'upload' && !selectedFile)}
                style={{
                  padding: '9px 22px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isProcessing || (activeTab === 'upload' && !selectedFile) ? 0.6 : 1,
                }}
              >
                <Zap size={14} />
                <span>{isProcessing ? 'Executing AI Inference...' : 'ANALYZE WITH SATRA AI'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
