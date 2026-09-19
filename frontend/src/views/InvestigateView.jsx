import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Flame,
  Satellite,
  Clock,
  Compass,
  Wind,
  Droplets,
  Thermometer,
  Layers,
  Copy,
  Check,
  Code,
  Activity,
  FileText,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  ExternalLink,
  MapPin,
  TrendingUp,
  Cpu,
} from 'lucide-react';

export function InvestigateView({
  selectedDetection = null,
  allDetections = [],
  onSelectDetection,
  onNavigate,
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isRawExpanded, setIsRawExpanded] = useState(true);

  // Default Event: #SAT-20481 Coimbatore Region if none provided
  const event = useMemo(() => {
    if (selectedDetection) {
      const lat = parseFloat(selectedDetection.latitude || 11.0168).toFixed(4);
      const lon = parseFloat(selectedDetection.longitude || 76.9558).toFixed(4);
      const tempC = selectedDetection.brightness
        ? (parseFloat(selectedDetection.brightness) > 200 ? (parseFloat(selectedDetection.brightness) - 273.15).toFixed(1) : parseFloat(selectedDetection.brightness).toFixed(1))
        : '68.4';
      const conf = selectedDetection.prediction_confidence
        ? (parseFloat(selectedDetection.prediction_confidence) * 100).toFixed(1)
        : '94.7';

      return {
        id: selectedDetection.id ? (String(selectedDetection.id).startsWith('SAT-') ? selectedDetection.id : `SAT-${selectedDetection.id}`) : 'SAT-20481',
        locationName: selectedDetection.location_name || (lat > 20 ? 'Hazira Industrial Belt, Gujarat' : 'Coimbatore, Tamil Nadu'),
        status: 'ACTIVE',
        risk: (selectedDetection.alert_level || 'HIGH').toUpperCase(),
        detected: selectedDetection.acq_date ? `${selectedDetection.acq_date} — ${selectedDetection.acq_time || '12:42 PM'} UTC` : '18 Sep 2026 — 12:42 PM',
        lat: lat,
        lon: lon,
        temp: tempC,
        confidence: conf,
        source: selectedDetection.source ? `${selectedDetection.source} Thermal Imaging` : 'Satellite Thermal Imaging (VIIRS / INSAT-3DR)',
        satellite: selectedDetection.source || 'INSAT-3DR / Sentinel-3 SLSTR',
        frp: selectedDetection.frp ? parseFloat(selectedDetection.frp).toFixed(1) : '46.2',
      };
    }

    return {
      id: 'SAT-20481',
      locationName: 'Coimbatore, Tamil Nadu',
      status: 'ACTIVE',
      risk: 'HIGH',
      detected: '18 Sep 2026 — 12:42 PM',
      lat: '11.0168',
      lon: '76.9558',
      temp: '68.4',
      confidence: '94.7',
      source: 'Satellite Thermal Imaging (VIIRS / INSAT-3DR)',
      satellite: 'INSAT-3DR / Sentinel-3 SLSTR',
      frp: '46.2',
    };
  }, [selectedDetection]);

  const rawJsonData = useMemo(() => {
    return {
      event_id: event.id,
      location: {
        region: event.locationName,
        latitude: parseFloat(event.lat),
        longitude: parseFloat(event.lon),
      },
      temperature: parseFloat(event.temp),
      risk_level: event.risk,
      confidence: parseFloat(event.confidence) / 100,
      satellite: event.satellite,
      telemetry: {
        frp_mw: parseFloat(event.frp),
        scan_angle: '14.2 deg',
        radiance_mw_m2_sr_um: 18.74,
        sensor_saturation: false,
        ground_pixel_resolution_m: 375,
      },
      environment: {
        ambient_temp_c: 36.2,
        relative_humidity_pct: 38,
        wind_speed_kmh: 18.5,
        wind_direction_deg: 290,
        fuel_moisture_pct: 7.4,
      },
      provenance: {
        pipeline_version: '2.4.1-rc3',
        calibration_standard: 'NIST-CAL-991',
        ingest_latency_sec: 42,
      },
    };
  }, [event]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rawJsonData, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getRiskBadgeStyle = (risk) => {
    switch (risk) {
      case 'CRITICAL': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: 'rgba(239, 68, 68, 0.4)' };
      case 'HIGH': return { bg: 'rgba(249, 115, 22, 0.15)', color: '#F97316', border: 'rgba(249, 115, 22, 0.4)' };
      case 'MODERATE': return { bg: 'rgba(234, 179, 8, 0.15)', color: '#EAB308', border: 'rgba(234, 179, 8, 0.4)' };
      default: return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: 'rgba(16, 185, 129, 0.4)' };
    }
  };

  const badgeStyle = getRiskBadgeStyle(event.risk);

  return (
    <div className="investigate-container" style={{
      width: '100%',
      minHeight: 'calc(100vh - var(--header-height))',
      background: 'var(--bg-space)',
      color: 'var(--text-primary)',
      padding: '24px 28px 48px',
      boxSizing: 'border-box',
    }}>
      
      {/* Investigation Console Header Bar */}
      <div style={{
        background: 'rgba(11, 23, 38, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '20px 24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F97316',
          }}>
            <Flame size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                THERMAL EVENT #{event.id}
              </h1>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                {event.status}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <MapPin size={14} style={{ color: 'var(--soft-cyan)' }} />
              <span>{event.locationName}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{event.lat}° N, {event.lon}° E</span>
            </div>
          </div>
        </div>

        {/* Header Right Status Badges & Event Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onNavigate && (
            <button
              onClick={() => onNavigate('gis-investigation')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(11, 23, 38, 0.8)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: 'var(--soft-cyan)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Return to GIS Investigation"
            >
              <span>&larr; GIS Investigation</span>
            </button>
          )}

          <div style={{
            padding: '6px 14px',
            borderRadius: '6px',
            background: badgeStyle.bg,
            border: `1px solid ${badgeStyle.border}`,
            color: badgeStyle.color,
            fontWeight: 800,
            fontSize: '12.5px',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <AlertTriangle size={15} />
            RISK: {event.risk}
          </div>

          <div style={{
            padding: '6px 14px',
            borderRadius: '6px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: 'var(--soft-cyan)',
            fontWeight: 700,
            fontSize: '12.5px',
            fontFamily: 'var(--font-mono)',
          }}>
            CONFIDENCE: {event.confidence}%
          </div>
        </div>
      </div>

      {/* Grid Layout: 2 Columns for Deep Technical Inspection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        
        {/* ================================================================= */}
        {/* 1. EVENT OVERVIEW */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <Activity size={16} style={{ color: 'var(--primary-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--soft-cyan)', textTransform: 'uppercase' }}>
              EVENT OVERVIEW
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Detected Timestamp</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {event.detected}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coordinates (WGS84)</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--soft-cyan)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {event.lat}° N, {event.lon}° E
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Surface Temperature</div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#F97316', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {event.temp}°C
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Detection Confidence</div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#10B981', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {event.confidence}%
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Detection Source</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {event.source}
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. THERMAL PROFILE & TREND CHART */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: '#F97316' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: '#F97316', textTransform: 'uppercase' }}>
                THERMAL PROFILE
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Temporal Trend (Last 2 hrs)</span>
          </div>

          {/* SVG Thermal Trend Line Chart */}
          <div style={{ height: '110px', width: '100%', position: 'relative', marginBottom: '14px' }}>
            <svg viewBox="0 0 400 100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="thermalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#F97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="20" x2="400" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
              <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
              <line x1="0" y1="80" x2="400" y2="80" stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />

              {/* Area */}
              <path
                d="M 0,85 L 60,78 L 120,68 L 180,62 L 240,42 L 300,32 L 360,18 L 400,15 L 400,95 L 0,95 Z"
                fill="url(#thermalGrad)"
              />

              {/* Line */}
              <path
                d="M 0,85 L 60,78 L 120,68 L 180,62 L 240,42 L 300,32 L 360,18 L 400,15"
                fill="none"
                stroke="#F97316"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Peak Point */}
              <circle cx="400" cy="15" r="4.5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              <span>11:30 AM (48°C)</span>
              <span>12:00 PM (56°C)</span>
              <span>12:22 PM (62°C)</span>
              <span style={{ color: '#F97316', fontWeight: 700 }}>12:42 PM ({event.temp}°C)</span>
            </div>
          </div>

          {/* Thermal Profile Metric Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Temp</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#F97316', fontFamily: 'var(--font-mono)' }}>{event.temp}°C</div>
            </div>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Temp Trend</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-mono)' }}>+4.2°C / hr</div>
            </div>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peak Temp</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#EF4444', fontFamily: 'var(--font-mono)' }}>72.1°C</div>
            </div>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rate of Increase</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>+1.8°C / 10m</div>
            </div>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Affected Area</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--soft-cyan)', fontFamily: 'var(--font-mono)' }}>2.4 km²</div>
            </div>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fire Rad. Power</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>{event.frp} MW</div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. RISK ANALYSIS (Progress meters matching prompt) */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <ShieldAlert size={16} style={{ color: '#EF4444' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: '#EF4444', textTransform: 'uppercase' }}>
              RISK ANALYSIS
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Fire Risk */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>Fire Risk</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#EF4444' }}>82%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '82%', height: '100%', background: 'linear-gradient(90deg, #F97316 0%, #EF4444 100%)', borderRadius: '4px' }} />
              </div>
            </div>

            {/* Spread Risk */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>Spread Risk</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#F97316' }}>71%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '71%', height: '100%', background: 'linear-gradient(90deg, #EAB308 0%, #F97316 100%)', borderRadius: '4px' }} />
              </div>
            </div>

            {/* Infrastructure Risk */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>Infrastructure Risk</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#EAB308' }}>48%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '48%', height: '100%', background: 'linear-gradient(90deg, #10B981 0%, #EAB308 100%)', borderRadius: '4px' }} />
              </div>
            </div>

            {/* Environmental Risk */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF' }}>Environmental Risk</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#EF4444' }}>76%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '76%', height: '100%', background: 'linear-gradient(90deg, #F97316 0%, #EF4444 100%)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 4. SATELLITE OBSERVATION */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <Satellite size={16} style={{ color: 'var(--soft-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--soft-cyan)', textTransform: 'uppercase' }}>
              SATELLITE OBSERVATION
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Satellite:</span>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>{event.satellite}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Observation Time:</span>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>2026-09-18 12:42:18 UTC</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Image Timestamp:</span>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>2026-09-18 12:44:02 UTC</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Resolution:</span>
              <div style={{ fontWeight: 700, color: 'var(--soft-cyan)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>375m (I-Band MIR/TIR)</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Coverage:</span>
              <div style={{ fontWeight: 700, color: '#10B981', marginTop: '2px' }}>98.4% orbital swath</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cloud Coverage:</span>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>12% (Clear Line of Sight)</div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: 'var(--text-muted)' }}>Sensor Type:</span>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                Dual-Channel Mid-Wave Infrared (MWIR 3.9µm / LWIR 11.0µm)
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 5. ENVIRONMENT */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <Wind size={16} style={{ color: '#38BDF8' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: '#38BDF8', textTransform: 'uppercase' }}>
              ENVIRONMENT
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ambient Temp</div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>36.2°C</div>
            </div>

            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Humidity</div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>38%</div>
            </div>

            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Wind Speed</div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#38BDF8', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>18.5 km/h</div>
            </div>

            <div style={{ background: 'rgba(5, 11, 20, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Wind Direction</div>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>WNW (290°)</div>
            </div>

            <div style={{ gridColumn: 'span 2', background: 'rgba(5, 11, 20, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vegetation Condition</div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#EAB308', marginTop: '2px' }}>Dry Sclerophyll / High Fuel Index</div>
            </div>

            <div style={{ gridColumn: 'span 3', background: 'rgba(239, 68, 68, 0.08)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ fontSize: '10.5px', color: '#EF4444', textTransform: 'uppercase', fontWeight: 700 }}>Weather Condition Alert</div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FCA5A5', marginTop: '2px' }}>Arid Environment & Heatwave Warning Active in Perimeter</div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 6. TIMELINE (Chronological Events) */}
        {/* ================================================================= */}
        <div style={{
          background: 'rgba(11, 23, 38, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
            <Clock size={16} style={{ color: 'var(--soft-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--soft-cyan)', textTransform: 'uppercase' }}>
              TIMELINE
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', paddingLeft: '8px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38BDF8', marginTop: '5px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--soft-cyan)', fontWeight: 700 }}>12:10 PM</div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF' }}>Thermal anomaly detected</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Initial sensor pass triggered MIR threshold flag (FRP 18.2 MW)</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EAB308', marginTop: '5px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#EAB308', fontWeight: 700 }}>12:22 PM</div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF' }}>Temperature increased (+5.8°C)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Secondary channel observed rapid core thermal gradient expansion</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F97316', marginTop: '5px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#F97316', fontWeight: 700 }}>12:31 PM</div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF' }}>Risk threshold exceeded</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Estimated fire spread vector approaching Western agricultural reserve</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', marginTop: '5px', flexShrink: 0, boxShadow: '0 0 8px #EF4444' }} />
              <div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#EF4444', fontWeight: 700 }}>12:42 PM</div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#EF4444' }}>HIGH-RISK classification</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Multi-spectral validation confirms active hotspot perimeter (68.4°C)</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* =================================================================== */}
      {/* 7. RAW / JSON INVESTIGATION (Developer & Mission Control Console) */}
      {/* =================================================================== */}
      <div style={{
        marginTop: '24px',
        background: 'rgba(5, 11, 20, 0.92)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 20px',
          background: 'rgba(15, 32, 50, 0.7)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code size={16} style={{ color: 'var(--soft-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF', textTransform: 'uppercase' }}>
              RAW / JSON INVESTIGATION CONSOLE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleCopyJson}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '5px',
                background: copySuccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.12)',
                border: copySuccess ? '1px solid #10B981' : '1px solid rgba(56, 189, 248, 0.25)',
                color: copySuccess ? '#10B981' : 'var(--soft-cyan)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {copySuccess ? <Check size={14} /> : <Copy size={14} />}
              {copySuccess ? 'COPIED TO CLIPBOARD' : 'COPY JSON'}
            </button>

            <button
              onClick={() => setIsRawExpanded(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '5px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <FileText size={14} />
              {isRawExpanded ? 'COLLAPSE RAW DATA' : 'VIEW RAW DATA'}
            </button>
          </div>
        </div>

        {isRawExpanded && (
          <pre style={{
            margin: 0,
            padding: '16px 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12.5px',
            lineHeight: 1.6,
            color: '#38BDF8',
            background: 'transparent',
            maxHeight: '380px',
            overflowY: 'auto',
          }}>
            {JSON.stringify(rawJsonData, null, 2)}
          </pre>
        )}
      </div>

    </div>
  );
}
