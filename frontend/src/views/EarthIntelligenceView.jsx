import React, { useState } from 'react';
import {
  Globe,
  Radio,
  Target,
  Flame,
  Layers,
  Activity,
  Calendar,
  Clock,
  Satellite,
  Compass,
  Zap,
} from 'lucide-react';
import { EarthGlobe3D } from '../components/EarthGlobe3D';

/**
 * Format detection timestamp strictly from the detection's actual data
 * e.g., '10 Sep 2026, 11:20 UTC'
 */
function formatDetectionDateTime(d) {
  if (!d) return 'N/A';

  // 1. If standard ISO timestamp in created_at or timestamp field
  const iso = d.timestamp || d.created_at;
  if (iso && !isNaN(Date.parse(iso))) {
    const dt = new Date(iso);
    const day = dt.getUTCDate();
    const month = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const year = dt.getUTCFullYear();
    const hours = String(dt.getUTCHours()).padStart(2, '0');
    const mins = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${mins} UTC`;
  }

  // 2. NASA FIRMS acq_date (YYYY-MM-DD) + acq_time (HHMM / HH:MM)
  if (d.acq_date) {
    const dt = new Date(d.acq_date);
    const day = isNaN(dt.getTime()) ? d.acq_date : dt.getUTCDate();
    const month = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const year = isNaN(dt.getTime()) ? '' : dt.getUTCFullYear();
    let timeStr = '00:00';
    if (d.acq_time !== undefined && d.acq_time !== null && String(d.acq_time).trim() !== '') {
      const raw = String(d.acq_time).trim();
      if (raw.includes(':')) {
        timeStr = raw;
      } else {
        const padded = raw.padStart(4, '0');
        timeStr = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
      }
    }
    return `${day} ${month} ${year}, ${timeStr} UTC`.trim();
  }

  return 'N/A';
}

/**
 * Determine risk level styling from alert_level and FRP
 */
function getRiskLevelInfo(d) {
  if (!d) {
    return {
      text: 'MONITORED',
      color: '#38BDF8',
      bg: 'rgba(56, 189, 248, 0.15)',
      border: 'rgba(56, 189, 248, 0.4)',
    };
  }

  const frp = parseFloat(d.frp || 0);
  const lvl = String(d.alert_level || '').toUpperCase();

  if (lvl === 'CRITICAL' || frp >= 80) {
    return {
      text: 'CRITICAL RISK',
      color: '#EF4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.4)',
    };
  }
  if (lvl === 'HIGH' || frp >= 40) {
    return {
      text: 'HIGH RISK',
      color: '#F97316',
      bg: 'rgba(249, 115, 22, 0.15)',
      border: 'rgba(249, 115, 22, 0.4)',
    };
  }
  if (lvl === 'MEDIUM' || frp >= 20) {
    return {
      text: 'MEDIUM RISK',
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.4)',
    };
  }
  return {
    text: 'LOW RISK',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
  };
}

export function EarthIntelligenceView({
  detections = [],
  selectedDetection = null,
  onSelectDetection = () => {},
}) {
  // Earth visualization mode: defaults to 'thermal' for Blue Holographic Earth
  const [earthMode, setEarthMode] = useState('thermal');
  // Trigger timestamp to command 3D Earth to fly/rotate to exact coordinates
  const [focusTrigger, setFocusTrigger] = useState(null);

  // Active detection for telemetry readout: user selected or default to first detection
  const activeDetection = selectedDetection || (detections.length > 0 ? detections[0] : null);

  const riskInfo = getRiskLevelInfo(activeDetection);
  const formattedDateTime = formatDetectionDateTime(activeDetection);

  const latNum = activeDetection ? parseFloat(activeDetection.latitude) : 28.6139;
  const lonNum = activeDetection ? parseFloat(activeDetection.longitude) : 77.2090;

  const latDisplay = activeDetection
    ? `${Math.abs(latNum).toFixed(4)}° ${latNum >= 0 ? 'N' : 'S'}`
    : '28.6139° N';

  const lonDisplay = activeDetection
    ? `${Math.abs(lonNum).toFixed(4)}° ${lonNum >= 0 ? 'E' : 'W'}`
    : '77.2090° E';

  const frpDisplay = activeDetection?.frp
    ? `${parseFloat(activeDetection.frp).toFixed(1)} MW`
    : '210.4 MW';

  const confDisplay = activeDetection?.prediction_confidence
    ? `${(parseFloat(activeDetection.prediction_confidence) * 100).toFixed(1)}%`
    : '87.1%';

  const satDisplay = activeDetection?.source || (activeDetection?.instrument ? activeDetection.instrument : 'MODIS');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 120px)' }}>
      {/* Top Header Identity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} style={{ color: '#38BDF8' }} />
            <span>EARTH INTELLIGENCE</span>
            <span style={{ fontSize: '10px', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              Where are the detections?
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ice-blue)', marginTop: '2px', fontWeight: 500 }}>
            "Explore where satellite thermal detections are occurring around Earth."
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(11, 23, 38, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '11px',
            color: '#38BDF8',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#38BDF8',
              boxShadow: '0 0 8px #38BDF8',
            }}
          />
          <span>Mode: <strong style={{ color: '#FFFFFF', textTransform: 'uppercase' }}>{earthMode} Earth</strong></span>
        </div>
      </div>

      {/* Main Two-Column Structure */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.48fr) minmax(320px, 360px)',
          gap: '20px',
          flex: 1,
          minHeight: '620px',
          alignItems: 'stretch',
        }}
      >
        {/* ======================================================== */}
        {/* LEFT COLUMN: BLUE HOLOGRAPHIC 3D EARTH + LIVE FEED BOX   */}
        {/* ======================================================== */}
        <div
          style={{
            position: 'relative',
            background: 'radial-gradient(circle at center, #0B1726 0%, #030712 100%)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Main 3D Earth Container */}
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
            <EarthGlobe3D
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
              initialMode={earthMode}
              hideSidePanel={true}
              hideModeSelector={true}
              hideFloatingFeed={true}
              isEarthIntelligence={true}
              focusTrigger={focusTrigger}
            />

            {/* ======================================================== */}
            {/* LOWER-LEFT DEDICATED PANEL: LIVE FEED + SINGLE LEGEND     */}
            {/* Dedicated separate space, zero overlap with globe controls */}
            {/* ======================================================== */}
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                zIndex: 15,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none',
              }}
            >
              {/* 1. Compact Live Feed Box */}
              <div
                style={{
                  background: 'rgba(11, 23, 38, 0.92)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
                  width: '185px',
                  pointerEvents: 'auto',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.06em' }}>
                    <Radio size={12} style={{ color: '#38BDF8' }} />
                    <span>LIVE FEED</span>
                  </div>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#10B981',
                      boxShadow: '0 0 6px #10B981',
                    }}
                  />
                </div>

                {/* Thermal Activity Preview Thumbnail */}
                <div
                  style={{
                    width: '100%',
                    height: '62px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #030712 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* SVG Infrared Heat Scan Simulation */}
                  <svg width="100%" height="100%" viewBox="0 0 180 62" fill="none">
                    <line x1="0" y1="31" x2="180" y2="31" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                    <line x1="90" y1="0" x2="90" y2="62" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                    <circle cx="90" cy="31" r="22" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" strokeDasharray="2 2" />

                    <circle cx="86" cy="28" r="14" fill="#EF4444" opacity="0.35" filter="blur(4px)" />
                    <circle cx="88" cy="30" r="7" fill="#F97316" opacity="0.75" />
                    <circle cx="90" cy="31" r="2.5" fill="#FFFFFF" />

                    <circle cx="120" cy="22" r="8" fill="#F59E0B" opacity="0.4" />
                    <circle cx="60" cy="40" r="6" fill="#F59E0B" opacity="0.35" />

                    <path d="M 4 10 L 4 4 L 10 4" stroke="#38BDF8" strokeWidth="1" />
                    <path d="M 176 10 L 176 4 L 170 4" stroke="#38BDF8" strokeWidth="1" />
                  </svg>

                  <span style={{ position: 'absolute', bottom: 3, right: 6, fontSize: '8.5px', color: '#38BDF8', fontFamily: 'monospace' }}>
                    IR-375m
                  </span>
                </div>

                {/* Feed Metadata */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF' }}>
                    VIIRS (S-NPP)
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#94A3B8', fontFamily: 'monospace' }}>
                    {activeDetection?.acq_date || new Date().toISOString().slice(0, 10)} UTC
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9.5px', color: '#10B981', marginTop: '2px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                    <span>Global Monitoring</span>
                  </div>
                </div>
              </div>

              {/* 2. Single Clean Thermal Risk Legend (Only ONE legend on the entire page) */}
              <div
                style={{
                  background: 'rgba(11, 23, 38, 0.92)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '11px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
                  width: 'fit-content',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 6px #EF4444' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 600 }}>High Risk</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 6px #F59E0B' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 600 }}>Medium Risk</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EAB308' }} />
                  <span style={{ color: '#F8FAFC', fontWeight: 600 }}>Low Risk</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: VISUALIZATION MODE + SELECTED DETECTION    */}
        {/* ======================================================== */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* ======================================================== */}
          {/* 1. VISUALIZATION MODE PANEL                              */}
          {/* ======================================================== */}
          <div
            className="card-panel"
            style={{
              marginBottom: 0,
              background: 'rgba(11, 23, 38, 0.88)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
            }}
          >
            <div
              style={{
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#38BDF8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Layers size={14} style={{ color: '#38BDF8' }} />
              <span>VISUALIZATION MODE</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'normal', label: 'Normal', icon: '🌍' },
                { id: 'thermal', label: 'Thermal', icon: '🔥' },
                { id: 'hybrid', label: 'Hybrid', icon: '✦' },
              ].map((m) => {
                const isActive = earthMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setEarthMode(m.id)}
                    style={{
                      background: isActive ? 'rgba(56, 189, 248, 0.22)' : 'rgba(15, 23, 42, 0.65)',
                      color: isActive ? '#FFFFFF' : '#94A3B8',
                      border: isActive ? '1px solid #38BDF8' : '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: isActive ? '0 0 14px rgba(56, 189, 248, 0.35)' : 'none',
                      padding: '8px 6px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      transition: 'all 0.18s ease',
                    }}
                    title={`Switch to ${m.label} visualization`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. SELECTED DETECTION PANEL                              */}
          {/* ======================================================== */}
          <div
            className="card-panel"
            style={{
              marginBottom: 0,
              flex: 1,
              background: 'rgba(11, 23, 38, 0.88)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: '12px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
            }}
          >
            <div>
              {/* Header Title */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(56, 189, 248, 0.18)',
                  paddingBottom: '10px',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 800,
                    color: '#38BDF8',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Target size={14} style={{ color: '#EF4444' }} />
                  <span>SELECTED DETECTION</span>
                </div>

                {activeDetection?.id && (
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '10.5px',
                      color: '#94A3B8',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    #{activeDetection.id}
                  </span>
                )}
              </div>

              {/* Tactical Detection Image / Preview */}
              <div
                style={{
                  width: '100%',
                  height: '100px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                <svg width="100%" height="100%" viewBox="0 0 280 100" fill="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="50" x2="280" y2="50" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" />
                  <line x1="140" y1="0" x2="140" y2="100" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" />
                  <circle cx="140" cy="50" r="34" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="140" cy="50" r="16" stroke="rgba(56, 189, 248, 0.45)" strokeWidth="1" />

                  {/* Thermal Heat Anomaly Signature */}
                  <circle cx="140" cy="50" r="20" fill="#EF4444" opacity="0.32" filter="blur(6px)" />
                  <circle cx="140" cy="50" r="10" fill="#F97316" opacity="0.7" />
                  <circle cx="140" cy="50" r="3.5" fill="#FFFFFF" />

                  {/* Reticle brackets */}
                  <path d="M 120 40 L 120 34 L 126 34" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 160 40 L 160 34 L 154 34" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 120 60 L 120 66 L 126 66" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 160 60 L 160 66 L 154 66" stroke="#38BDF8" strokeWidth="1.5" />
                </svg>

                {/* Overlay Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 8,
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#38BDF8',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Flame size={10} style={{ color: '#EF4444' }} />
                  <span>Thermal Signature Preview</span>
                </div>

                <div
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 8,
                    fontSize: '9.5px',
                    fontFamily: 'monospace',
                    color: '#94A3B8',
                  }}
                >
                  {latDisplay}, {lonDisplay}
                </div>
              </div>

              {/* Classification & Risk Level */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
                  {activeDetection?.predicted_class || 'Forest Fire'}
                </div>

                <div style={{ marginTop: '5px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      color: riskInfo.color,
                      background: riskInfo.bg,
                      border: `1px solid ${riskInfo.border}`,
                      boxShadow: `0 0 10px ${riskInfo.bg}`,
                      textTransform: 'uppercase',
                    }}
                  >
                    {riskInfo.text}
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  padding: '12px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(56, 189, 248, 0.16)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                {/* Confidence */}
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Confidence</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#38BDF8', marginTop: '2px' }}>
                    {confDisplay}
                  </div>
                </div>

                {/* FRP */}
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>FRP</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }}>
                    {frpDisplay}
                  </div>
                </div>

                {/* Latitude */}
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Latitude</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                    {latDisplay}
                  </div>
                </div>

                {/* Longitude */}
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Longitude</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                    {lonDisplay}
                  </div>
                </div>

                {/* Satellite */}
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Satellite</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Satellite size={13} style={{ color: '#38BDF8' }} />
                    <span>{satDisplay}</span>
                  </div>
                </div>

                {/* Date & Time (Strictly from detection timestamp) */}
                <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Date &amp; Time</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} style={{ color: '#10B981' }} />
                    <span style={{ fontFamily: 'monospace' }}>{formattedDateTime}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button: Focus on Location */}
            <button
              onClick={() => {
                if (activeDetection) {
                  onSelectDetection(activeDetection);
                  setFocusTrigger(Date.now());
                }
              }}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                justifyContent: 'center',
                marginTop: '16px',
                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                boxShadow: '0 4px 18px rgba(2, 132, 199, 0.45)',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                cursor: 'pointer',
              }}
              title="Rotate and focus 3D Earth to exact hotspot coordinates"
            >
              <Target size={15} />
              <span>Focus on Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
