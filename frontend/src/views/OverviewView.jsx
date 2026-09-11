import React, { useState } from 'react';
import {
  Flame,
  AlertTriangle,
  Factory,
  Radio,
  Activity,
  ArrowRight,
  ShieldAlert,
  Info,
  Globe,
  Satellite,
  Compass,
  Zap,
  RotateCw,
  Maximize2,
  Columns,
  Target,
  Crosshair,
  UploadCloud,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { GlobalThermalEarth } from '../components/GlobalThermalEarth';

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
  const [heroView, setHeroView] = useState('3d'); // '3d' | 'thermal'

  const activeHotspots = analytics?.total_detections ?? detections.length;
  const indFires = analytics?.industrial_fire_predictions ?? detections.filter(d => d.predicted_class === 'Industrial Fire').length;
  const persistentSources = analytics?.persistent_source_predictions ?? detections.filter(d => d.predicted_class?.includes('Persistent')).length;
  const criticalAlerts = analytics?.verification_breakdown?.critical_alerts ?? recentAlerts.filter(a => a.alert_level === 'CRITICAL').length;

  const avgConf =
    detections.length > 0
      ? (
          (detections.reduce((acc, d) => acc + (parseFloat(d.prediction_confidence) || 0.88), 0) /
            detections.length) *
          100
        ).toFixed(1)
      : '88.4';

  const handleSelectHotspot = (det) => {
    if (onSelectDetection) onSelectDetection(det);
    if (onFocusDetection) onFocusDetection(det);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 
        ============================================================
        HERO EARTH VISUALIZATION — THE CENTRAL VISUAL CENTERPIECE
        ============================================================
      */}
      <div
        className="card-panel"
        style={{
          padding: 0,
          position: 'relative',
          height: '660px',
          width: '100%',
          overflow: 'hidden',
          background: 'radial-gradient(circle at center, #0B1726 0%, #050B14 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
          marginBottom: 0,
        }}
      >
        {/* Render 3D Earth Globe or Global Thermal Earth */}
        <div style={{ width: '100%', height: '100%' }}>
          {heroView === '3d' ? (
            <EarthGlobe3D
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
              onSwitchTo2D={() => setHeroView('thermal')}
            />
          ) : (
            <GlobalThermalEarth
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
            />
          )}
        </div>

        {/* 
          FLOATING MISSION CONTROL TELEMETRY HUD (Top Left)
          Sleek, integrated aerospace telemetry cards supporting the Earth without cluttering
        */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          {/* Mission Deck Title Badge */}
          <div
            style={{
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-color)',
              borderLeft: '3px solid var(--primary-cyan)',
              borderRadius: '8px',
              padding: '8px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--thermal-red)',
                  boxShadow: '0 0 8px var(--thermal-red)',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#FFFFFF' }}>
                EARTH INTELLIGENCE &bull; LIVE SATELLITE MONITORING
              </span>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              VIIRS 375m &bull; MODIS 1km &bull; Model v2.0.0-sci
            </div>
          </div>

          {/* Floating Key Metrics Strip */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              pointerEvents: 'auto',
            }}
          >
            {/* Active Hotspots Pill */}
            <div
              style={{
                background: 'rgba(11, 23, 38, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              <Flame size={15} style={{ color: 'var(--thermal-red)' }} />
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Hotspots</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                  {activeHotspots}
                </div>
              </div>
            </div>

            {/* Industrial Fires Pill */}
            <div
              style={{
                background: 'rgba(11, 23, 38, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              <Factory size={15} style={{ color: 'var(--thermal-orange)' }} />
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Industrial Fires</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--thermal-red)', fontFamily: 'var(--font-mono)' }}>
                  {indFires}
                </div>
              </div>
            </div>

            {/* AI Confidence Pill */}
            <div
              style={{
                background: 'rgba(11, 23, 38, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              <Zap size={15} style={{ color: 'var(--primary-cyan)' }} />
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>AI Confidence</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>
                  {avgConf}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 
          FLOATING TACTICAL CONTROLS (Top Right)
          Quick switch between 3D Earth & Global Thermal Earth, Reset, Deck expand
        */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* 3D Earth / Global Thermal Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(11, 23, 38, 0.85)',
              backdropFilter: 'blur(12px)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              gap: '3px',
            }}
          >
            <button
              onClick={() => setHeroView('3d')}
              style={{
                background: heroView === '3d' ? 'var(--panel-elevated)' : 'transparent',
                color: heroView === '3d' ? '#FFFFFF' : 'var(--text-secondary)',
                border: heroView === '3d' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Globe size={13} style={{ color: 'var(--ice-blue)' }} />
              <span>3D Earth</span>
            </button>
            <button
              onClick={() => setHeroView('thermal')}
              style={{
                background: heroView === 'thermal' ? 'var(--panel-elevated)' : 'transparent',
                color: heroView === 'thermal' ? '#FFFFFF' : 'var(--text-secondary)',
                border: heroView === 'thermal' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Radio size={13} style={{ color: 'var(--thermal-red)' }} />
              <span>Global Thermal</span>
            </button>
          </div>

          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="btn-primary"
              style={{
                padding: '6px 13px',
                fontSize: '11.5px',
                gap: '6px',
                background: 'linear-gradient(135deg, rgba(69, 200, 245, 0.25) 0%, rgba(255, 77, 77, 0.25) 100%)',
                border: '1px solid var(--primary-cyan)',
                color: '#FFFFFF',
                boxShadow: '0 0 14px rgba(69, 200, 245, 0.3)',
                fontWeight: 700,
              }}
              title="Upload satellite observation file (CSV/JSON) or enter coordinates for AI analysis"
            >
              <UploadCloud size={13} style={{ color: 'var(--primary-cyan)' }} />
              <span>Upload &amp; Analyze</span>
            </button>
          )}

          {onNavigate && (
            <button
              onClick={() => onNavigate('earth-intel')}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '11px', gap: '5px' }}
              title="Open Dedicated Dual-View Command Deck"
            >
              <Columns size={12} />
              <span>Command Deck</span>
            </button>
          )}
        </div>

        {/* 
          FLOATING TARGET LOCK TELEMETRY HUD (Bottom Left)
          When a detection is selected, displays precise canonical targeting data
        */}
        {selectedDetection && (
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              zIndex: 20,
              background: 'rgba(11, 23, 38, 0.92)',
              backdropFilter: 'blur(14px)',
              border: '1px solid var(--primary-cyan)',
              borderLeft: '4px solid var(--thermal-red)',
              borderRadius: '8px',
              padding: '12px 18px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              minWidth: '280px',
              maxWidth: '380px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                <Target size={14} style={{ color: 'var(--thermal-red)' }} />
                <span>HOTSPOT #{selectedDetection.id} LOCKED</span>
              </div>
              <button
                onClick={() => onSelectDetection(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--ice-blue)', fontWeight: 600, marginBottom: '4px' }}>
              {selectedDetection.predicted_class}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              LAT: {parseFloat(selectedDetection.latitude).toFixed(6)}° &bull; LON: {parseFloat(selectedDetection.longitude).toFixed(6)}°
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px' }}>
              <span>FRP: <strong style={{ color: 'var(--thermal-orange)' }}>{selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}</strong></span>
              <span>Confidence: <strong style={{ color: 'var(--success)' }}>{((parseFloat(selectedDetection.prediction_confidence) || 0) * 100).toFixed(0)}%</strong></span>
              <span>Sensor: <strong style={{ color: 'var(--ice-blue)' }}>{selectedDetection.source || 'VIIRS'}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* 
        ============================================================
        SUPPORTING PANELS: RECENT DETECTIONS & ACTIVE ALERTS
        ============================================================
      */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '18px' }}>
        {/* Recent Detections Table Panel */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Flame size={16} style={{ color: 'var(--thermal-orange)' }} />
                Recent Thermal Detections ({detections.length})
              </div>
              <div className="panel-subtitle">Spaceborne observation registry &bull; Click to focus 3D Earth</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onOpenUploadModal && (
                <button
                  onClick={onOpenUploadModal}
                  className="btn-secondary"
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    gap: '5px',
                    borderColor: 'rgba(69, 200, 245, 0.4)',
                    color: 'var(--primary-cyan)',
                  }}
                  title="Upload FIRMS observation"
                >
                  <UploadCloud size={12} />
                  <span>Upload Hotspot</span>
                </button>
              )}
              {onNavigate && (
                <button
                  onClick={() => onNavigate('detection-explorer')}
                  className="btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  <span>Full Registry</span>
                  <ArrowRight size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '280px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Canonical Coordinates</th>
                  <th>Classification</th>
                  <th>FRP (MW)</th>
                  <th>Confidence</th>
                  <th>Satellite</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {detections.slice(0, 6).map((d) => (
                  <tr
                    key={d.id}
                    style={{
                      backgroundColor: selectedDetection?.id === d.id ? 'rgba(69, 200, 245, 0.12)' : 'transparent',
                    }}
                  >
                    <td className="mono-cell">#{d.id}</td>
                    <td className="mono-cell" style={{ color: '#FFFFFF', fontSize: '11px' }}>
                      {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}°
                    </td>
                    <td><ClassBadge predictedClass={d.predicted_class} /></td>
                    <td className="mono-cell" style={{ color: 'var(--thermal-orange)', fontWeight: 600 }}>
                      {d.frp ? `${parseFloat(d.frp).toFixed(1)}` : '—'}
                    </td>
                    <td className="mono-cell">{((parseFloat(d.prediction_confidence) || 0) * 100).toFixed(0)}%</td>
                    <td><span style={{ fontSize: '11px', color: 'var(--ice-blue)' }}>{d.source || 'VIIRS'}</span></td>
                    <td>
                      <button
                        onClick={() => handleSelectHotspot(d)}
                        className="btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '10.5px', gap: '4px' }}
                        title="Focus 3D Earth on this coordinate"
                      >
                        <Globe size={11} />
                        <span>Focus</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Incident Alerts Stream */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <ShieldAlert size={16} style={{ color: 'var(--thermal-red)' }} />
                Active Incident Alerts Stream ({recentAlerts.length})
              </div>
              <div className="panel-subtitle">Operational queue requiring human or field verification</div>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('alerts')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                <span>Alerts Deck</span>
                <ArrowRight size={11} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
            {recentAlerts.length > 0 ? (
              recentAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(15, 32, 50, 0.55)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusBadge status={alert.alert_level} type="severity" />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>{alert.title}</span>
                    </div>
                    <StatusBadge status={alert.verification_status} type="verification" />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '4px' }}>
                    {alert.message}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    <span className="mono-cell">
                      {parseFloat(alert.latitude).toFixed(4)}°, {parseFloat(alert.longitude).toFixed(4)}° &bull; {alert.acq_date}
                    </span>
                    {onFocusDetection && (
                      <button
                        onClick={() => {
                          onFocusDetection({
                            id: alert.detection_id || alert.id,
                            latitude: alert.latitude,
                            longitude: alert.longitude,
                            predicted_class: alert.predicted_class,
                            frp: alert.frp,
                            source: 'VIIRS',
                          });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary-cyan)',
                          fontSize: '10.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <span>Target Earth</span> &rarr;
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No active critical alerts. Telemetry nominal.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
