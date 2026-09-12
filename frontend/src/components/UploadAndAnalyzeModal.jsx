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
  Layers,
  BarChart2,
  MapPin,
  Activity,
  Trash2,
  Info,
  RotateCcw,
} from 'lucide-react';
import {
  uploadAndAnalyzeSatelliteFile,
  predictAndStoreObservation,
  validateSatelliteDataset,
  startSatelliteAnalysisJob,
  getSatelliteAnalysisJobStatus,
} from '../services/api';

/**
 * Built-in real satellite test records for immediate operator analysis
 */
const VERIFIED_FIRMS_OBSERVATIONS = [
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

// Helper to normalize column names on client
const COLUMN_ALIASES = {
  latitude: 'latitude',
  lat: 'latitude',
  lat_deg: 'latitude',
  y: 'latitude',
  longitude: 'longitude',
  lon: 'longitude',
  long: 'longitude',
  lng: 'longitude',
  lon_deg: 'longitude',
  x: 'longitude',
  acq_date: 'acq_date',
  acquisition_date: 'acq_date',
  date: 'acq_date',
  datetime: 'acq_date',
  timestamp: 'acq_date',
  acq_time: 'acq_time',
  acquisition_time: 'acq_time',
  time: 'acq_time',
  confidence: 'confidence',
  confidence_level: 'confidence',
  conf: 'confidence',
  frp: 'frp',
  fire_radiative_power: 'frp',
  power: 'frp',
  brightness: 'brightness',
  bright_ti4: 'brightness',
  brightness_temperature: 'brightness',
  temp: 'brightness',
  temperature: 'brightness',
  bright_t31: 'bright_t31',
  bright_ti5: 'bright_t31',
  satellite: 'satellite',
  source: 'satellite',
  instrument: 'instrument',
  sensor: 'instrument',
  daynight: 'daynight',
};

const cleanCol = (col) => {
  if (!col) return '';
  return String(col).trim().toLowerCase().replace(/[\s\-\.]+/g, '_').replace(/[^\w]/g, '');
};

export function UploadAndAnalyzeModal({
  isOpen,
  onClose,
  onAnalysisSuccess,
  onViewExactLocation,
}) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'templates' | 'manual'
  const [analysisViewTab, setAnalysisViewTab] = useState('summary'); // 'summary' | 'thermal' | 'spatial' | 'temporal'

  // Upload State (multi-file capable)
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
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
  const [uiState, setUiState] = useState('IDLE'); // 'IDLE' | 'FILE_SELECTED' | 'VALIDATING' | 'READY' | 'ANALYZING' | 'SUCCESS' | 'ERROR' | 'TIMEOUT'
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [validationNotice, setValidationNotice] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [jobProgress, setJobProgress] = useState({
    currentBatch: 0,
    totalBatches: 0,
    processedRecords: 0,
    totalRecords: 0,
    progressPercent: 0,
    statusMessage: '',
  });

  if (!isOpen) return null;

  // Inspect and validate each selected file content
  const processFiles = async (fileList) => {
    setErrorMsg(null);
    setValidationNotice(null);
    setAnalysisResult(null);

    const filesArray = Array.from(fileList || []);
    if (filesArray.length === 0) {
      setErrorMsg('Please select a satellite observation file first.');
      setUiState('IDLE');
      setSelectedFiles([]);
      setFilePreviews([]);
      return;
    }

    setUiState('VALIDATING');

    const newSelectedFiles = [];
    const newPreviews = [];
    let hadZipFile = false;

    for (const file of filesArray) {
      const isZip = file.name.toLowerCase().endsWith('.zip');
      if (isZip) {
        hadZipFile = true;
        setValidationNotice('ZIP dataset detected — scanning for satellite observation files...');
        try {
          const valRes = await validateSatelliteDataset(file);
          newSelectedFiles.push(file);
          newPreviews.push({
            name: file.name,
            identifiedFile: valRes.identified_file,
            sizeKb: Math.round(file.size / 1024) || 1,
            recordCount: valRes.record_count,
            format: valRes.format_detected,
            previewLat: valRes.sample_preview?.latitude,
            previewLon: valRes.sample_preview?.longitude,
            previewBright: valRes.sample_preview?.brightness,
            previewFrp: valRes.sample_preview?.frp,
            isZip: true,
          });
          continue;
        } catch (zipErr) {
          setUiState('ERROR');
          setValidationNotice(null);
          setErrorMsg(zipErr.message || 'No compatible NASA FIRMS / VIIRS / MODIS observation file found inside ZIP.');
          setSelectedFiles([]);
          setFilePreviews([]);
          return;
        }
      }

      try {
        const text = await file.text();
        const trimmed = text.trim();

        if (!trimmed) {
          throw new Error(`File '${file.name}' is empty. Please select a valid satellite observation file.`);
        }

        let recordCount = 0;
        let detectedFormat = 'CSV';
        let previewLat = null;
        let previewLon = null;
        let previewBright = null;
        let previewFrp = null;
        let hasThermalSignal = false;

        // Check JSON / GeoJSON
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.geojson')) {
          try {
            const parsed = JSON.parse(trimmed);
            let items = [];
            if (Array.isArray(parsed)) {
              items = parsed;
              detectedFormat = 'JSON';
            } else if (parsed.features && Array.isArray(parsed.features)) {
              detectedFormat = 'GeoJSON';
              items = parsed.features.map((f) => {
                const p = { ...(f.properties || {}) };
                if (f.geometry?.coordinates?.length >= 2) {
                  p.longitude = f.geometry.coordinates[0];
                  p.latitude = f.geometry.coordinates[1];
                }
                return p;
              });
            } else if (parsed.data || parsed.records || parsed.detections) {
              detectedFormat = 'JSON';
              items = parsed.data || parsed.records || parsed.detections;
            } else {
              items = [parsed];
              detectedFormat = 'JSON';
            }

            if (!items.length) {
              throw new Error(`Zero records found in JSON file '${file.name}'.`);
            }

            recordCount = items.length;
            const first = items[0] || {};
            const mappedKeys = Object.keys(first).map(cleanCol).map((k) => COLUMN_ALIASES[k] || k);
            const hasLat = mappedKeys.includes('latitude');
            const hasLon = mappedKeys.includes('longitude');
            hasThermalSignal = mappedKeys.some((k) =>
              ['brightness', 'bright_t31', 'frp', 'confidence', 'satellite', 'instrument', 'acq_date'].includes(k)
            );

            if (!hasLat || !hasLon || !hasThermalSignal) {
              throw new Error(
                `Unsupported observation format. We could not identify sufficient satellite thermal/fire observation fields in this file. Please upload a NASA FIRMS, MODIS, VIIRS-compatible CSV or JSON file.`
              );
            }

            previewLat = parseFloat(first.latitude || first.lat);
            previewLon = parseFloat(first.longitude || first.lon || first.long);
            previewBright = first.brightness || first.bright_ti4 || first.temp ? parseFloat(first.brightness || first.bright_ti4 || first.temp) : null;
            previewFrp = first.frp ? parseFloat(first.frp) : null;
          } catch (jsonErr) {
            throw new Error(jsonErr.message || `Malformed JSON in file '${file.name}'.`);
          }
        } else {
          // CSV / Plain text
          const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
          if (lines.length < 2) {
            throw new Error(`File '${file.name}' must contain a column header row and at least 1 observation row.`);
          }

          // Detect delimiter: tab, semicolon, or comma
          const firstLine = lines[0];
          let delimiter = ',';
          if (firstLine.includes('\t')) delimiter = '\t';
          else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

          const parseRow = (line) => line.split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());

          const rawHeaders = parseRow(lines[0]);
          const mappedHeaders = rawHeaders.map(cleanCol).map((k) => COLUMN_ALIASES[k] || k);

          const latIdx = mappedHeaders.indexOf('latitude');
          const lonIdx = mappedHeaders.indexOf('longitude');
          const brightIdx = mappedHeaders.indexOf('brightness');
          const frpIdx = mappedHeaders.indexOf('frp');

          const hasThermal = mappedHeaders.some((k) =>
            ['brightness', 'bright_t31', 'frp', 'confidence', 'satellite', 'instrument', 'acq_date', 'daynight', 'scan'].includes(k)
          );

          if (latIdx === -1 || lonIdx === -1 || !hasThermal) {
            const missing = [];
            if (latIdx === -1) missing.push('latitude');
            if (lonIdx === -1) missing.push('longitude');
            if (!hasThermal) missing.push('thermal observation signal (brightness/FRP)');
            throw new Error(
              `Unsupported observation format in '${file.name}'. Missing required fields: ${missing.join(', ')}. Please upload a NASA FIRMS, MODIS, VIIRS-compatible CSV or JSON file.`
            );
          }

          recordCount = lines.length - 1;
          const firstRow = parseRow(lines[1]);
          previewLat = parseFloat(firstRow[latIdx]);
          previewLon = parseFloat(firstRow[lonIdx]);
          previewBright = brightIdx !== -1 && firstRow[brightIdx] ? parseFloat(firstRow[brightIdx]) : null;
          previewFrp = frpIdx !== -1 && firstRow[frpIdx] ? parseFloat(firstRow[frpIdx]) : null;

          if (isNaN(previewLat) || previewLat < -90.0 || previewLat > 90.0) {
            throw new Error(`Invalid latitude ${firstRow[latIdx]} in '${file.name}'. Coordinate must be between -90° and +90°.`);
          }
          if (isNaN(previewLon) || previewLon < -180.0 || previewLon > 180.0) {
            throw new Error(`Invalid longitude ${firstRow[lonIdx]} in '${file.name}'. Coordinate must be between -180° and +180°.`);
          }

          if (rawHeaders.some((h) => cleanCol(h) === 'bright_ti4')) {
            detectedFormat = 'VIIRS CSV';
          } else if (rawHeaders.some((h) => cleanCol(h) === 'bright_t31')) {
            detectedFormat = 'MODIS CSV';
          } else {
            detectedFormat = 'Thermal CSV';
          }
        }

        newSelectedFiles.push(file);
        newPreviews.push({
          name: file.name,
          sizeKb: Math.round(file.size / 1024) || 1,
          recordCount,
          format: detectedFormat,
          previewLat,
          previewLon,
          previewBright,
          previewFrp,
        });
      } catch (err) {
        setUiState('ERROR');
        setValidationNotice(null);
        setErrorMsg(err.message);
        setSelectedFiles([]);
        setFilePreviews([]);
        return;
      }
    }

    setSelectedFiles(newSelectedFiles);
    setFilePreviews(newPreviews);
    setUiState('READY');
    setErrorMsg(null);
    if (hadZipFile) {
      setValidationNotice('Satellite observation data found — ready for AI analysis.');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setUiState('FILE_SELECTED');
      processFiles(e.target.files);
    } else {
      if (selectedFiles.length === 0) {
        setErrorMsg('Please select a satellite observation file first.');
        setUiState('IDLE');
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUiState('FILE_SELECTED');
      processFiles(e.dataTransfer.files);
    } else {
      if (selectedFiles.length === 0) {
        setErrorMsg('Please select a satellite observation file first.');
        setUiState('IDLE');
      }
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setUiState('IDLE');
        setErrorMsg(null);
      }
      return updated;
    });
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Select a built-in observation template
  const handleSelectObservation = async (obs) => {
    const blob = new Blob([obs.csvContent], { type: 'text/csv' });
    const file = new File([blob], `${obs.id}.csv`, { type: 'text/csv' });
    setSelectedFiles([]);
    setFilePreviews([]);
    setUiState('FILE_SELECTED');
    await processFiles([file]);
    setActiveTab('upload');
  };

  // Execute Core AI Analysis Pipeline
  const handleExecuteAnalysis = async () => {
    // 1. Strict guard: NEVER run analysis without an actual valid selected file
    if (activeTab === 'upload' && (!selectedFiles || selectedFiles.length === 0 || uiState !== 'READY')) {
      setErrorMsg('Please select a satellite observation file first.');
      setUiState('IDLE');
      return;
    }

    setErrorMsg(null);
    setUiState('ANALYZING');
    setIsProcessing(true);

    try {
      let result;

      if (activeTab === 'manual') {
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
          data_provenance: 'USER_UPLOADED',
        };

        const response = await predictAndStoreObservation(payload);
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
            bright_t31: payload.bright_t31,
          },
          prediction: {
            predicted_class: response.prediction.predicted_class,
            confidence: response.prediction.confidence,
            model_version: response.prediction.model_version,
            class_probabilities: response.prediction.class_probabilities,
          },
          risk: {
            alert_level: response.prediction.alert_level,
            verification_status: 'REQUIRES_VERIFICATION',
          },
          provenance: response.detection.data_provenance,
          detection: response.detection,
          total_records: 1,
          all_detections: [response.detection],
        };
      } else {
        if (!selectedFiles || selectedFiles.length === 0) {
          throw new Error('Please select or upload at least one valid satellite observation file before executing AI analysis.');
        }

        // Asynchronous batch job workflow: splits observations into 1,000-record batches
        const startJobRes = await startSatelliteAnalysisJob(selectedFiles);
        const jobId = startJobRes.job_id;

        setJobProgress({
          currentBatch: 0,
          totalBatches: startJobRes.total_batches || 1,
          processedRecords: 0,
          totalRecords: startJobRes.total_records || 0,
          progressPercent: 0,
          statusMessage: 'Starting batch analysis...',
        });

        let isDone = false;
        let finalResult = null;
        let pollCount = 0;
        const maxPolls = 600; // 150 seconds safety timeout

        while (!isDone && pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          pollCount++;

          const jobStatus = await getSatelliteAnalysisJobStatus(jobId);
          setJobProgress({
            currentBatch: jobStatus.current_batch || 0,
            totalBatches: jobStatus.total_batches || 1,
            processedRecords: jobStatus.processed_records || 0,
            totalRecords: jobStatus.total_records || 0,
            progressPercent: jobStatus.progress_percent || 0,
            statusMessage: jobStatus.status_message || 'Analyzing satellite observations in batches...',
          });

          if (jobStatus.status === 'COMPLETED') {
            isDone = true;
            finalResult = jobStatus.result;
          } else if (jobStatus.status === 'FAILED') {
            throw new Error(jobStatus.error || 'AI batch analysis failed.');
          }
        }

        if (!finalResult) {
          throw new Error('AI analysis timed out. The batch processing job took longer than expected.');
        }

        result = finalResult;
      }

      setAnalysisResult(result);
      setUiState('SUCCESS');
      if (onAnalysisSuccess && result.detection) {
        onAnalysisSuccess(result.detection);
      }
    } catch (err) {
      console.error('[SATRA ERROR] Pipeline error:', err);
      const isTimeout = err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('timed out'));
      setUiState(isTimeout ? 'TIMEOUT' : 'ERROR');
      setErrorMsg(err.message || 'AI analysis execution failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFocusClick = (detectionTarget) => {
    const det = detectionTarget || analysisResult?.detection;
    if (det) {
      if (onViewExactLocation) {
        onViewExactLocation(det);
      }
      onClose();
    }
  };

  const handleResetUpload = () => {
    setSelectedFiles([]);
    setFilePreviews([]);
    setAnalysisResult(null);
    setErrorMsg(null);
    setUiState('IDLE');
  };

  const totalRecordsCount = filePreviews.reduce((sum, f) => sum + f.recordCount, 0);
  const summaryData = analysisResult?.analysis_summary;

  // Real validation check: Must have at least one validated file in READY state
  const hasValidFile = Boolean(selectedFiles && selectedFiles.length > 0 && uiState === 'READY');
  const isAnalyzeDisabled =
    isProcessing ||
    (activeTab === 'upload' && !hasValidFile) ||
    (activeTab === 'templates' && !hasValidFile);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 18, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '94vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #0B1726 0%, #060E18 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '14px',
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
            background: 'rgba(15, 32, 50, 0.65)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-cyan)',
              }}
            >
              <UploadCloud size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.04em', margin: 0, color: '#FFFFFF' }}>
                  Upload Satellite Observation Data
                </h2>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: 'var(--primary-cyan)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  SATRA AI CORE
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Upload any compatible NASA FIRMS / MODIS / VIIRS CSV or JSON file &bull; Filename does not matter
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
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Tabs Selector (Hidden after analysis result) */}
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
                }}
              >
                <FileText size={14} />
                <span>Upload Observation Files (.csv, .json)</span>
              </button>

              <button
                onClick={() => setActiveTab('templates')}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'templates' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                  background: activeTab === 'templates' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: activeTab === 'templates' ? '#FFFFFF' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Database size={14} />
                <span>NASA FIRMS Observations</span>
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
                }}
              >
                <Compass size={14} />
                <span>Custom Coordinate Input</span>
              </button>
            </div>
          )}

          {/* TAB 1: UPLOAD SATELLITE FILE */}
          {!analysisResult && activeTab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Drag & Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                  if (selectedFiles.length === 0) {
                    setErrorMsg('Please select a satellite observation file first.');
                  }
                  fileInputRef.current?.click();
                }}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--primary-cyan)' : 'rgba(56, 189, 248, 0.35)'}`,
                  background: isDragging ? 'rgba(56, 189, 248, 0.1)' : 'rgba(15, 23, 42, 0.55)',
                  borderRadius: '12px',
                  padding: '32px 24px',
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
                  multiple
                  accept=".csv,.txt,.json,.geojson,.zip"
                  onChange={handleFileChange}
                  onCancel={() => {
                    if (selectedFiles.length === 0) {
                      setErrorMsg('Please select a satellite observation file first.');
                    }
                  }}
                />

                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-cyan)',
                    marginBottom: '10px',
                  }}
                >
                  <UploadCloud size={24} />
                </div>

                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#FFFFFF' }}>
                  Upload Satellite Observation Data
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ice-blue)', marginTop: '4px' }}>
                  Upload any compatible NASA FIRMS / MODIS / VIIRS CSV, JSON, or ZIP dataset.
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Filename does not matter &mdash; SATRA AI automatically scans archives, validates headers, and extracts observation data.
                </div>

                {/* Supported formats pill list */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Supported formats:
                  </span>
                  {['CSV', 'JSON', 'ZIP DATASETS', 'MODIS', 'VIIRS', 'NASA FIRMS'].map((fmt) => (
                    <span
                      key={fmt}
                      style={{
                        fontSize: '10.5px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        color: 'var(--primary-cyan)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dynamic Status / ZIP Scanning Notice */}
              {validationNotice && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: validationNotice.includes('scanning')
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'rgba(34, 197, 94, 0.12)',
                    border: validationNotice.includes('scanning')
                      ? '1px solid rgba(56, 189, 248, 0.35)'
                      : '1px solid rgba(34, 197, 94, 0.35)',
                    color: validationNotice.includes('scanning')
                      ? 'var(--ice-blue)'
                      : '#86EFAC',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {validationNotice.includes('scanning') ? (
                    <Activity size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                  )}
                  <span>{validationNotice}</span>
                </div>
              )}

              {/* Real-time Batch Processing Progress HUD */}
              {isProcessing && (
                <div
                  style={{
                    background: 'rgba(15, 32, 50, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 0 16px rgba(56, 189, 248, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Activity size={18} className="animate-spin" style={{ color: 'var(--primary-cyan)' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                          Analyzing satellite observations...
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ice-blue)', marginTop: '2px' }}>
                          {jobProgress.statusMessage || 'Processing observations with SATRA AI model v2.0.0-scientific-prototype...'}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: 'var(--primary-cyan)',
                        }}
                      >
                        Batch {jobProgress.currentBatch} / {jobProgress.totalBatches}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar Track */}
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      background: 'rgba(2, 6, 23, 0.7)',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(jobProgress.progressPercent, 2))}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #0284C7 0%, #38BDF8 100%)',
                        borderRadius: '4px',
                        transition: 'width 0.25s ease-out',
                        boxShadow: '0 0 12px rgba(56, 189, 248, 0.5)',
                      }}
                    />
                  </div>

                  {/* Progress Metrics & Real Counters */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>
                      <strong style={{ color: '#FFFFFF' }}>{jobProgress.processedRecords.toLocaleString()}</strong> /{' '}
                      {jobProgress.totalRecords.toLocaleString()} observations processed
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-cyan)', fontWeight: 700 }}>
                      {jobProgress.progressPercent.toFixed(1)}% complete
                    </span>
                  </div>
                </div>
              )}

              {/* Selected Files List with Badges */}
              {filePreviews.length > 0 && (
                <div
                  style={{
                    background: 'rgba(15, 32, 50, 0.75)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 700 }}>
                      <CheckCircle2 size={16} />
                      <span>{filePreviews.length} File{filePreviews.length > 1 ? 's' : ''} Ready for AI Analysis</span>
                    </div>
                    <span style={{ color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700 }}>
                      {totalRecordsCount} Total Observation{totalRecordsCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {filePreviews.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(5, 11, 20, 0.6)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <FileText size={14} style={{ color: 'var(--primary-cyan)' }} />
                          <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{p.name}</span>
                          {p.identifiedFile && p.identifiedFile !== p.name && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(56, 189, 248, 0.1)',
                                color: 'var(--primary-cyan)',
                                fontFamily: 'var(--font-mono)',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                              }}
                            >
                              &rarr; {p.identifiedFile}
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({p.sizeKb} KB)</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: 'var(--ice-blue)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                            }}
                          >
                            {p.format}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ice-blue)', fontSize: '11px' }}>
                            {p.recordCount} obs
                          </span>
                          <button
                            onClick={() => handleRemoveFile(idx)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Remove file"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REAL FIRMS OBSERVATIONS */}
          {!analysisResult && activeTab === 'templates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Select a verified NASA FIRMS satellite observation from the ground validation registry:
              </div>

              {VERIFIED_FIRMS_OBSERVATIONS.map((obs) => (
                <div
                  key={obs.id}
                  onClick={() => handleSelectObservation(obs)}
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>{obs.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{obs.desc}</div>
                    <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--ice-blue)', marginTop: '4px' }}>
                      Exact: {obs.lat}° N, {obs.lon}° E &bull; {obs.satellite} &bull; FRP: {obs.frp} MW
                    </div>
                  </div>

                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11px', gap: '4px', whiteSpace: 'nowrap' }}
                  >
                    <span>Load Observation</span>
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

          {/* Professional Error / Timeout / Validation Notification */}
          {(errorMsg || uiState === 'TIMEOUT') && (
            <div
              style={{
                background:
                  uiState === 'TIMEOUT'
                    ? 'rgba(234, 179, 8, 0.15)'
                    : errorMsg?.includes('Please select')
                    ? 'rgba(56, 189, 248, 0.12)'
                    : 'rgba(239, 68, 68, 0.15)',
                border:
                  uiState === 'TIMEOUT'
                    ? '1px solid rgba(234, 179, 8, 0.4)'
                    : errorMsg?.includes('Please select')
                    ? '1px solid rgba(56, 189, 248, 0.4)'
                    : '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                color:
                  uiState === 'TIMEOUT'
                    ? '#FDE68A'
                    : errorMsg?.includes('Please select')
                    ? 'var(--ice-blue)'
                    : '#FCA5A5',
                fontSize: '12.5px',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <AlertTriangle
                  size={20}
                  style={{
                    flexShrink: 0,
                    color:
                      uiState === 'TIMEOUT'
                        ? '#EAB308'
                        : errorMsg?.includes('Please select')
                        ? 'var(--primary-cyan)'
                        : 'var(--critical-red)',
                    marginTop: '2px',
                  }}
                />
                <div>
                  <strong style={{ color: '#FFFFFF', display: 'block', marginBottom: '2px' }}>
                    {uiState === 'TIMEOUT'
                      ? 'AI Analysis Timed Out'
                      : errorMsg && errorMsg.includes('Please select')
                      ? 'File Selection Required'
                      : errorMsg && errorMsg.toLowerCase().includes('unavailable')
                      ? 'AI Service Unavailable'
                      : errorMsg &&
                        (errorMsg.toLowerCase().includes('unsupported') ||
                          errorMsg.toLowerCase().includes('missing') ||
                          errorMsg.toLowerCase().includes('invalid'))
                      ? 'Observation Validation Notice'
                      : 'AI Analysis Notice'}
                  </strong>
                  {errorMsg || (uiState === 'TIMEOUT' ? 'AI analysis timed out. Please check the AI service/backend connection and try again.' : 'An unexpected error occurred during AI analysis.')}
                </div>
              </div>
              {hasValidFile && (
                <button
                  onClick={handleExecuteAnalysis}
                  className="btn-primary"
                  disabled={isProcessing}
                  style={{
                    padding: '6px 14px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#0284C7',
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* 
            ============================================================
            DYNAMIC SATRA INTELLIGENCE ANALYSIS RESULT VIEW
            ============================================================
          */}
          {analysisResult && (
            <div
              style={{
                background: 'rgba(11, 23, 38, 0.95)',
                border: '1px solid var(--primary-cyan)',
                borderRadius: '12px',
                padding: '20px 24px',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), inset 0 0 24px rgba(56, 189, 248, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                animation: 'fadeIn 0.25s ease-out',
              }}
            >
              {/* Header Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingBottom: '12px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} style={{ color: 'var(--primary-cyan)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                    SATRA DYNAMIC INTELLIGENCE ANALYSIS
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: 'var(--ice-blue)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    {analysisResult.total_records} Observation{analysisResult.total_records > 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              </div>

              {/* Fallback Satellite Analysis Banner (Requirement 8) */}
              {(analysisResult?.is_fallback ||
                analysisResult?.metadata?.is_fallback ||
                analysisResult?.analysis_mode === 'RULE_BASED_FALLBACK') && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#FDE68A',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <AlertTriangle size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
                  <div>
                    {analysisResult.fallback_notice ||
                      analysisResult?.metadata?.fallback_notice ||
                      'AI service unavailable — displaying rule-based satellite analysis.'}
                  </div>
                </div>
              )}

              {/* Multi-file Source Traceability Strip */}
              {summaryData?.files_summary && summaryData.files_summary.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(5, 11, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '11px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Source Files:</span>
                  {summaryData.files_summary.map((f, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {f.filename} ({f.record_count} obs)
                    </span>
                  ))}
                </div>
              )}

              {/* Analysis View Navigation Tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '4px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {[
                  { id: 'summary', label: 'Summary & Hotspots', icon: Flame },
                  { id: 'thermal', label: 'Thermal & Radiative Power', icon: Radio },
                  { id: 'spatial', label: 'Spatial & Clustering', icon: MapPin },
                  { id: 'temporal', label: 'Temporal Trends & Sensors', icon: Clock },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = analysisViewTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setAnalysisViewTab(t.id)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: isActive ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                        background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Icon size={13} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB CONTENT: Summary & Hotspots */}
              {analysisViewTab === 'summary' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Primary Hotspot Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    {/* Exact Location */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Compass size={14} />
                        <span>EXACT LOCATION</span>
                      </div>
                      <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                        Lat: <strong>{analysisResult.exact_location.latitude.toFixed(4)}°</strong>
                      </div>
                      <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#FFFFFF', marginTop: '2px' }}>
                        Lon: <strong>{analysisResult.exact_location.longitude.toFixed(4)}°</strong>
                      </div>
                    </div>

                    {/* AI Classification */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--thermal-red)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Flame size={14} />
                        <span>AI CLASSIFICATION</span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
                        {analysisResult.prediction.predicted_class}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ice-blue)', marginTop: '2px' }}>
                        Confidence: <strong>{(analysisResult.prediction.confidence * 100).toFixed(1)}%</strong>
                      </div>
                    </div>

                    {/* Thermal Signature */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Radio size={14} />
                        <span>THERMAL SIGNATURE</span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#FFFFFF' }}>
                        FRP: <strong>{analysisResult.thermal_data.frp != null ? `${parseFloat(analysisResult.thermal_data.frp).toFixed(1)} MW` : 'Data not available'}</strong>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#FFFFFF', marginTop: '2px' }}>
                        Temp: <strong>{analysisResult.thermal_data.brightness != null ? `${parseFloat(analysisResult.thermal_data.brightness).toFixed(1)} K` : 'Data not available'}</strong>
                      </div>
                    </div>

                    {/* Observation Source */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} />
                        <span>OBSERVATION PASS</span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#FFFFFF' }}>
                        {analysisResult.observation.acq_date} {analysisResult.observation.acq_time} UTC
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Sensor: {analysisResult.observation.instrument || analysisResult.observation.satellite}
                      </div>
                    </div>
                  </div>

                  {/* Hotspots Table */}
                  {analysisResult.all_detections && analysisResult.all_detections.length > 0 && (
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 14px', background: 'rgba(15, 32, 50, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ice-blue)' }}>
                          DETECTED HOTSPOTS REGISTER ({analysisResult.total_records || analysisResult.all_detections.length})
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click to focus GIS</span>
                      </div>
                      <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)', textAlign: 'left' }}>
                              <th style={{ padding: '6px 12px' }}>File</th>
                              <th style={{ padding: '6px 12px' }}>Coordinates</th>
                              <th style={{ padding: '6px 12px' }}>Class</th>
                              <th style={{ padding: '6px 12px' }}>Alert</th>
                              <th style={{ padding: '6px 12px' }}>FRP</th>
                              <th style={{ padding: '6px 12px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysisResult.all_detections.slice(0, 50).map((det, idx) => (
                              <tr
                                key={idx}
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                                onClick={() => handleFocusClick(det)}
                              >
                                <td style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                  {det.source_file || 'Direct Upload'}
                                </td>
                                <td style={{ padding: '6px 12px', fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                                  {det.latitude.toFixed(4)}°, {det.longitude.toFixed(4)}°
                                </td>
                                <td style={{ padding: '6px 12px', fontWeight: 600 }}>{det.predicted_class}</td>
                                <td style={{ padding: '6px 12px' }}>
                                  <span
                                    style={{
                                      fontSize: '9.5px',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      background: det.alert_level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                                      color: det.alert_level === 'CRITICAL' ? 'var(--thermal-red)' : 'var(--ice-blue)',
                                    }}
                                  >
                                    {det.alert_level}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 12px', color: 'var(--warning-amber)' }}>
                                  {det.frp != null ? `${parseFloat(det.frp).toFixed(1)} MW` : 'N/A'}
                                </td>
                                <td style={{ padding: '6px 12px' }}>
                                  <span style={{ color: 'var(--primary-cyan)', fontSize: '10.5px' }}>View &rarr;</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: Thermal & Radiative Power */}
              {analysisViewTab === 'thermal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                    {/* FRP Stats */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--warning-amber)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Radio size={14} />
                        <span>FIRE RADIATIVE POWER (FRP) ANALYSIS</span>
                      </div>
                      {summaryData?.frp_analysis ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11.5px' }}>
                          <div>Min FRP: <strong>{summaryData.frp_analysis.min} MW</strong></div>
                          <div>Max FRP: <strong>{summaryData.frp_analysis.max} MW</strong></div>
                          <div>Mean FRP: <strong>{summaryData.frp_analysis.mean} MW</strong></div>
                          <div>Total Energy: <strong>{summaryData.frp_analysis.sum} MW</strong></div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Data not available in uploaded dataset
                        </div>
                      )}
                    </div>

                    {/* Brightness Temperature Stats */}
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ice-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Radio size={14} />
                        <span>BRIGHTNESS TEMPERATURE ANALYSIS</span>
                      </div>
                      {summaryData?.brightness_analysis ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11.5px' }}>
                          <div>Min Temp: <strong>{summaryData.brightness_analysis.min} K</strong></div>
                          <div>Max Temp: <strong>{summaryData.brightness_analysis.max} K</strong></div>
                          <div>Mean Temp: <strong>{summaryData.brightness_analysis.mean} K</strong></div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Data not available in uploaded dataset
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Confidence Breakdown */}
                  <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '8px' }}>
                      CONFIDENCE DISTRIBUTION
                    </div>
                    {summaryData?.confidence_analysis ? (
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px' }}>
                        <div>High Confidence: <strong>{summaryData.confidence_analysis.high_count}</strong></div>
                        <div>Nominal: <strong>{summaryData.confidence_analysis.nominal_count}</strong></div>
                        <div>Low: <strong>{summaryData.confidence_analysis.low_count}</strong></div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Data not available in uploaded dataset
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB CONTENT: Spatial & Clustering */}
              {analysisViewTab === 'spatial' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {summaryData?.spatial_analysis && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                      <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '11.5px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px' }}>
                          GEOGRAPHIC BOUNDING BOX
                        </div>
                        <div>North: {summaryData.spatial_analysis.bounding_box?.max_latitude}°</div>
                        <div>South: {summaryData.spatial_analysis.bounding_box?.min_latitude}°</div>
                        <div>East: {summaryData.spatial_analysis.bounding_box?.max_longitude}°</div>
                        <div>West: {summaryData.spatial_analysis.bounding_box?.min_longitude}°</div>
                        <div style={{ marginTop: '6px', color: 'var(--ice-blue)' }}>
                          Center: {summaryData.spatial_analysis.center?.latitude}°, {summaryData.spatial_analysis.center?.longitude}°
                        </div>
                      </div>

                      <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '11.5px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px' }}>
                          HOTSPOT SPATIAL CLUSTERS ({summaryData.spatial_analysis.clusters?.length || 0})
                        </div>
                        <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
                          {summaryData.spatial_analysis.clusters?.map((c, i) => (
                            <div key={i} style={{ marginBottom: '4px' }}>
                              Cluster #{c.cluster_id}: {c.observation_count} hotspots @ {c.center_latitude}°, {c.center_longitude}°
                              {c.peak_frp ? ` (Peak FRP: ${c.peak_frp} MW)` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: Temporal Trends & Sensors */}
              {analysisViewTab === 'temporal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '11.5px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px' }}>
                        TEMPORAL SPAN
                      </div>
                      {summaryData?.temporal_analysis ? (
                        <div>
                          <div>Earliest: {summaryData.temporal_analysis.earliest_date || 'N/A'}</div>
                          <div>Latest: {summaryData.temporal_analysis.latest_date || 'N/A'}</div>
                          <div style={{ marginTop: '4px' }}>
                            Day passes: {summaryData.temporal_analysis.day_count} &bull; Night passes: {summaryData.temporal_analysis.night_count}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Data not available</div>
                      )}
                    </div>

                    <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '11.5px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', marginBottom: '6px' }}>
                        SATELLITE & SENSOR PLATFORMS
                      </div>
                      {summaryData?.satellite_sources?.length ? (
                        summaryData.satellite_sources.map((s, i) => (
                          <div key={i} style={{ marginBottom: '3px' }}>&bull; {s}</div>
                        ))
                      ) : (
                        <div>{analysisResult.observation.satellite || 'Satellite Sensor'}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', gap: '12px' }}>
                <button
                  onClick={handleResetUpload}
                  className="btn-secondary"
                  style={{ padding: '10px 18px', fontSize: '12px' }}
                >
                  Upload Another Dataset
                </button>

                <button
                  onClick={() => handleFocusClick()}
                  className="btn-primary"
                  style={{
                    padding: '12px 24px',
                    fontSize: '13px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 0 20px rgba(56, 189, 248, 0.35)',
                  }}
                >
                  <Globe size={16} />
                  <span>VIEW EXACT LOCATION ON EARTH / GIS</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Trigger Button (Initial upload stage) */}
          {!analysisResult && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={onClose}
                className="btn-secondary"
                style={{ padding: '9px 18px', fontSize: '12px' }}
                disabled={isProcessing}
              >
                Cancel
              </button>

              {(uiState === 'ERROR' || uiState === 'TIMEOUT') && hasValidFile ? (
                <button
                  onClick={handleExecuteAnalysis}
                  className="btn-primary"
                  disabled={isAnalyzeDisabled}
                  style={{
                    padding: '9px 22px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#0284C7',
                    boxShadow: '0 0 16px rgba(2, 132, 199, 0.4)',
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Retry Analysis</span>
                </button>
              ) : (
                <div
                  onClick={() => {
                    if (isAnalyzeDisabled && activeTab === 'upload' && !hasValidFile) {
                      setErrorMsg('Please select a satellite observation file first.');
                    }
                  }}
                  style={{ display: 'inline-flex', cursor: isAnalyzeDisabled ? 'not-allowed' : 'pointer' }}
                >
                  <button
                    onClick={handleExecuteAnalysis}
                    className="btn-primary"
                    disabled={isAnalyzeDisabled}
                    style={{
                      padding: '9px 22px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: isAnalyzeDisabled ? 0.45 : 1,
                      cursor: isAnalyzeDisabled ? 'not-allowed' : 'pointer',
                      pointerEvents: isAnalyzeDisabled ? 'none' : 'auto',
                    }}
                  >
                    <Zap size={14} />
                    <span>
                      {isProcessing
                        ? `Batch ${jobProgress.currentBatch} / ${jobProgress.totalBatches} (${jobProgress.progressPercent.toFixed(0)}%)...`
                        : 'ANALYZE WITH SATRA AI'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
