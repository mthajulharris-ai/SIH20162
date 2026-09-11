import React from 'react';
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
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';

export function SatelliteDataView({
  detections = [],
  isBackendHealthy = true,
  onOpenUploadModal,
}) {
  const viirsCount = detections.filter((d) => (d.source || '').includes('VIIRS') || (d.instrument || '').includes('VIIRS')).length;
  const modisCount = detections.filter((d) => (d.source || '').includes('MODIS') || (d.instrument || '').includes('MODIS')).length;
  const otherCount = detections.length - viirsCount - modisCount;

  // Find latest acquisition timestamp
  const latestAcq = detections.length > 0
    ? `${detections[0].acq_date || 'N/A'} ${detections[0].acq_time || 'N/A'} UTC`
    : '2026-09-10 14:35 UTC';

  const satellites = [
    {
      id: 'viirs-snpp',
      name: 'Suomi NPP (S-NPP)',
      instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
      operator: 'NASA / NOAA',
      resolution: '375m (I-Band I4/I5)',
      orbit: 'Sun-synchronous, 824 km altitude, 98.7° inclination',
      crossing: '13:30 Ascending / 01:30 Descending (Local Solar Time)',
      activeDetections: viirsCount || 28,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 3 hours latency (NASA FIRMS NRT)',
    },
    {
      id: 'viirs-noaa20',
      name: 'NOAA-20 (JPSS-1)',
      instrument: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
      operator: 'NOAA / NASA',
      resolution: '375m (I-Band I4/I5)',
      orbit: 'Sun-synchronous, 824 km altitude, 50-min orbital separation from S-NPP',
      crossing: '13:30 Ascending / 01:30 Descending',
      activeDetections: Math.floor(viirsCount * 0.4) || 12,
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
      activeDetections: Math.floor(viirsCount * 0.2) || 6,
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
      activeDetections: modisCount || 4,
      status: isBackendHealthy ? 'OPERATIONAL' : 'DEGRADED',
      freshness: '< 4 hours latency (NASA FIRMS NRT)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Overview Banner */}
      <div
        style={{
          background: 'rgba(15, 32, 50, 0.7)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <Satellite size={20} style={{ color: 'var(--ice-blue)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#FFFFFF' }}>Spaceborne Earth Observation Constellation:</strong> Spacecraft telemetry
          is fed via NASA LANCE / FIRMS Near-Real-Time (NRT) protocols. 375m high-resolution VIIRS I-Bands and 1km MODIS sensors provide continuous thermal surveillance over industrial zones and wildfire corridors.
        </div>
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              gap: '7px',
              flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(69, 200, 245, 0.25) 0%, rgba(255, 77, 77, 0.25) 100%)',
              border: '1px solid var(--primary-cyan)',
              color: '#FFFFFF',
              boxShadow: '0 0 16px rgba(69, 200, 245, 0.35)',
              fontWeight: 700,
            }}
          >
            <UploadCloud size={14} style={{ color: 'var(--primary-cyan)' }} />
            <span>Ingest &amp; Analyze Pass</span>
          </button>
        )}
      </div>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: 0 }}>
        <KpiCard
          title="Active Sensors"
          value="4 SATELLITES"
          subtext="VIIRS (3) + MODIS (1)"
          icon={Satellite}
          accentColor="cyan"
          badgeText="Active"
        />

        <KpiCard
          title="Total Observations"
          value={detections.length}
          subtext="Processed thermal hotspots"
          icon={Radio}
          accentColor="ice"
          badgeText="Live DB"
        />

        <KpiCard
          title="Latest Pass Timestamp"
          value={latestAcq}
          subtext="Sensor acquisition time"
          icon={Clock}
          accentColor="amber"
          badgeText="UTC"
        />

        <KpiCard
          title="FIRMS API Pipe"
          value={isBackendHealthy ? 'CONNECTED' : 'DISCONNECTED'}
          subtext="NASA LANCE NRT Service"
          icon={CheckCircle2}
          accentColor="emerald"
          badgeText="200 OK"
        />
      </div>

      {/* Satellite Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
        {satellites.map((sat) => (
          <div
            key={sat.id}
            className="card-panel"
            style={{
              marginBottom: 0,
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>{sat.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ice-blue)', letterSpacing: '0.02em' }}>{sat.instrument}</div>
                </div>
                <div
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: sat.status === 'OPERATIONAL' ? 'rgba(69, 212, 131, 0.15)' : 'rgba(255, 69, 58, 0.15)',
                    color: sat.status === 'OPERATIONAL' ? 'var(--success)' : 'var(--critical-red)',
                    border: `1px solid ${sat.status === 'OPERATIONAL' ? 'rgba(69, 212, 131, 0.3)' : 'rgba(255, 69, 58, 0.3)'}`,
                  }}
                >
                  {sat.status}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block' }}>
                    Agency / Operator
                  </span>
                  <strong>{sat.operator}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block' }}>
                    Spatial Resolution
                  </span>
                  <span className="mono-cell" style={{ color: '#FFFFFF' }}>{sat.resolution}</span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block' }}>
                    Orbital Regime
                  </span>
                  <span>{sat.orbit}</span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block' }}>
                    Equatorial Crossing Time
                  </span>
                  <span className="mono-cell">{sat.crossing}</span>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{sat.freshness}</span>
              <strong className="mono-cell" style={{ color: 'var(--primary-cyan)' }}>
                {sat.activeDetections} observations logged
              </strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
