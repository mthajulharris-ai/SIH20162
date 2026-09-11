import React, { useState } from 'react';
import {
  Globe,
  Radio,
  Columns,
  Flame,
  Target,
  Maximize2,
  Minimize2,
  Info,
  Compass,
} from 'lucide-react';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { GlobalThermalEarth } from '../components/GlobalThermalEarth';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';

export function EarthIntelligenceView({
  detections = [],
  selectedDetection,
  onSelectDetection,
}) {
  const [viewMode, setViewMode] = useState('dual'); // 'dual' | '3d' | 'thermal'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* View Mode Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--panel-bg)',
          padding: '12px 20px',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} style={{ color: 'var(--primary-cyan)' }} />
            EARTH INTELLIGENCE &bull; GLOBAL COMMAND DECK
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Synchronized Photorealistic 3D Earth & Transparent Digital Thermal Earth Overlay
          </div>
        </div>

        {/* View Mode Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(15, 32, 50, 0.8)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            gap: '4px',
          }}
        >
          <button
            onClick={() => setViewMode('dual')}
            style={{
              background: viewMode === 'dual' ? 'var(--panel-elevated)' : 'transparent',
              color: viewMode === 'dual' ? '#FFFFFF' : 'var(--text-secondary)',
              border: viewMode === 'dual' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Columns size={14} style={{ color: 'var(--ice-blue)' }} />
            <span>Dual View</span>
          </button>

          <button
            onClick={() => setViewMode('3d')}
            style={{
              background: viewMode === '3d' ? 'var(--panel-elevated)' : 'transparent',
              color: viewMode === '3d' ? '#FFFFFF' : 'var(--text-secondary)',
              border: viewMode === '3d' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Globe size={14} style={{ color: 'var(--ice-blue)' }} />
            <span>3D Earth Focus</span>
          </button>

          <button
            onClick={() => setViewMode('thermal')}
            style={{
              background: viewMode === 'thermal' ? 'var(--panel-elevated)' : 'transparent',
              color: viewMode === 'thermal' ? '#FFFFFF' : 'var(--text-secondary)',
              border: viewMode === 'thermal' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Radio size={14} style={{ color: 'var(--thermal-red)' }} />
            <span>Global Thermal Focus</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      {viewMode === 'dual' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
            gap: '16px',
            height: 'calc(100vh - 240px)',
            minHeight: '620px',
          }}
        >
          {/* Left: 3D Earth */}
          <div
            style={{
              position: 'relative',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-space)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 10,
                background: 'rgba(11, 23, 38, 0.85)',
                border: '1px solid var(--border-color)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--ice-blue)',
                letterSpacing: '0.04em',
                pointerEvents: 'none',
              }}
            >
              PRIMARY &bull; 3D EARTH SATELLITE GLOBE
            </div>
            <EarthGlobe3D
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
              onSwitchTo2D={() => setViewMode('thermal')}
            />
          </div>

          {/* Right: Global Thermal Earth */}
          <div
            style={{
              position: 'relative',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              background: '#020712',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 500,
                background: 'rgba(11, 23, 38, 0.85)',
                border: '1px solid var(--border-color)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--primary-cyan)',
                letterSpacing: '0.04em',
                pointerEvents: 'none',
              }}
            >
              SECONDARY &bull; GLOBAL THERMAL EARTH (FLAT)
            </div>
            <GlobalThermalEarth
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
            />
          </div>
        </div>
      )}

      {viewMode === '3d' && (
        <div style={{ position: 'relative', height: 'calc(100vh - 220px)', minHeight: '620px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          <EarthGlobe3D
            detections={detections}
            selectedDetection={selectedDetection}
            onSelectDetection={onSelectDetection}
            onSwitchTo2D={() => setViewMode('thermal')}
          />
        </div>
      )}

      {viewMode === 'thermal' && (
        <div style={{ position: 'relative', height: 'calc(100vh - 220px)', minHeight: '620px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          <GlobalThermalEarth
            detections={detections}
            selectedDetection={selectedDetection}
            onSelectDetection={onSelectDetection}
          />
        </div>
      )}

      {/* Synchronized Hotspot Telemetry Sheet */}
      {selectedDetection && (
        <div
          className="card-panel"
          style={{
            border: '1px solid var(--primary-cyan)',
            background: 'var(--panel-elevated)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div className="panel-header" style={{ marginBottom: '14px' }}>
            <div>
              <div className="panel-title" style={{ color: '#FFFFFF' }}>
                <Target size={18} style={{ color: 'var(--thermal-red)' }} />
                TARGET LOCKED: #{selectedDetection.id} — {selectedDetection.predicted_class}
              </div>
              <div className="panel-subtitle">
                Canonical coordinates actively synchronized across 3D Earth & Global Thermal Earth
              </div>
            </div>
            <button
              onClick={() => onSelectDetection(null)}
              className="btn-secondary"
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              Clear Lock
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              fontSize: '12.5px',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>CANONICAL LAT / LON</span>
              <strong className="mono-cell" style={{ color: 'var(--ice-blue)', fontSize: '13px' }}>
                {parseFloat(selectedDetection.latitude).toFixed(6)}°, {parseFloat(selectedDetection.longitude).toFixed(6)}°
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>FIRE RADIATIVE POWER (FRP)</span>
              <strong className="mono-cell" style={{ color: 'var(--thermal-orange)', fontSize: '13px' }}>
                {selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>BRIGHTNESS TEMP</span>
              <strong className="mono-cell" style={{ color: '#FFFFFF', fontSize: '13px' }}>
                {selectedDetection.brightness ? `${parseFloat(selectedDetection.brightness).toFixed(1)} K` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>AI CONFIDENCE</span>
              <strong className="mono-cell" style={{ color: 'var(--success)', fontSize: '13px' }}>
                {((parseFloat(selectedDetection.prediction_confidence) || 0) * 100).toFixed(1)}%
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>SATELLITE & SENSOR</span>
              <span style={{ color: 'var(--ice-blue)', fontWeight: 600 }}>
                {selectedDetection.source} ({selectedDetection.instrument || 'VIIRS'})
              </span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>ACQUISITION TIME</span>
              <span className="mono-cell">{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>PROVENANCE & STATUS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <ProvenanceBadge provenance={selectedDetection.data_provenance} />
                <StatusBadge status="REQUIRES_VERIFICATION" type="verification" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
