import React, { useState } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Flame,
  Globe,
  Crosshair,
  Sliders,
  ExternalLink,
  Target,
  ShieldAlert,
} from 'lucide-react';
import { ClassBadge, ProvenanceBadge, StatusBadge } from '../components/StatusBadge';

export function DetectionExplorerView({
  detections = [],
  onRefresh,
  loading = false,
  onFocusDetection,
  selectedDetection,
  onSelectDetection,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [provenanceFilter, setProvenanceFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [inspectorDetection, setInspectorDetection] = useState(selectedDetection || null);

  const filtered = detections.filter((d) => {
    if (sourceFilter && d.source !== sourceFilter) return false;
    if (classFilter && d.predicted_class !== classFilter) return false;
    if (provenanceFilter && d.data_provenance !== provenanceFilter) return false;
    if (alertFilter && d.alert_level !== alertFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchId = String(d.id).includes(q);
      const matchCoord = `${d.latitude},${d.longitude}`.includes(q);
      const matchClass = (d.predicted_class || '').toLowerCase().includes(q);
      const matchSource = (d.source || '').toLowerCase().includes(q);
      const matchProv = (d.data_provenance || '').toLowerCase().includes(q);
      return matchId || matchCoord || matchClass || matchSource || matchProv;
    }
    return true;
  });

  const handleRowClick = (d) => {
    setInspectorDetection(d);
    if (onSelectDetection) onSelectDetection(d);
  };

  const handleFocus = (d) => {
    if (onFocusDetection) onFocusDetection(d);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Search & Multi-Filter Toolbar */}
      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by ID, Lat/Lon, Class, Satellite, Provenance..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-input"
            style={{ width: '100%' }}
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Satellite Sources</option>
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP (375m)</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 (375m)</option>
          <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21 (375m)</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua (1km)</option>
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Classification Classes</option>
          <option value="Industrial Fire">Industrial Fire</option>
          <option value="Persistent Thermal Source">Persistent Thermal Source</option>
          <option value="Other">Other / Vegetation</option>
        </select>

        <select
          value={provenanceFilter}
          onChange={(e) => setProvenanceFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Data Origins</option>
          <option value="REAL_FIRMS">REAL_FIRMS (NASA)</option>
          <option value="PROTOTYPE_LABELLED">PROTOTYPE_LABELLED</option>
          <option value="SAMPLE">DEMO / SAMPLE</option>
        </select>

        <select
          value={alertFilter}
          onChange={(e) => setAlertFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Alert Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <button onClick={onRefresh} disabled={loading} className="btn-secondary">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>
      </div>

      {/* Main Layout: Table + Inspector Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: inspectorDetection ? '1fr 380px' : '1fr', gap: '18px' }}>
        {/* Table Panel */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Crosshair size={17} style={{ color: 'var(--primary-cyan)' }} />
                Thermal Hotspot Registry ({filtered.length} of {detections.length})
              </div>
              <div className="panel-subtitle">Click any record to inspect telemetry or focus on 3D Earth</div>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Canonical Coordinates</th>
                  <th>Classification</th>
                  <th>Confidence</th>
                  <th>FRP (MW)</th>
                  <th>Temp (K)</th>
                  <th>Satellite</th>
                  <th>Origin</th>
                  <th>Time (UTC)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map((d) => {
                    const isSelected = inspectorDetection?.id === d.id;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => handleRowClick(d)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'rgba(69, 200, 245, 0.12)' : 'transparent',
                        }}
                      >
                        <td className="mono-cell">#{d.id}</td>
                        <td className="mono-cell" style={{ color: '#FFFFFF', fontSize: '11.5px' }}>
                          {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}°
                        </td>
                        <td><ClassBadge predictedClass={d.predicted_class} /></td>
                        <td className="mono-cell" style={{ fontWeight: 600 }}>
                          {((parseFloat(d.prediction_confidence) || 0) * 100).toFixed(1)}%
                        </td>
                        <td className="mono-cell" style={{ color: 'var(--thermal-orange)', fontWeight: 600 }}>
                          {d.frp ? `${parseFloat(d.frp).toFixed(1)}` : '—'}
                        </td>
                        <td className="mono-cell">{d.brightness ? `${parseFloat(d.brightness).toFixed(1)}` : '—'}</td>
                        <td><span style={{ fontSize: '11px', color: 'var(--ice-blue)' }}>{d.source || 'VIIRS'}</span></td>
                        <td><ProvenanceBadge provenance={d.data_provenance} /></td>
                        <td className="mono-cell" style={{ fontSize: '11px' }}>{d.acq_date} {d.acq_time}</td>
                        <td>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFocus(d);
                            }}
                            className="btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '10.5px', gap: '4px' }}
                            title="Focus on 3D Earth"
                          >
                            <Globe size={11} />
                            <span>Focus</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No thermal detection records match the active filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Inspector Drawer */}
        {inspectorDetection && (
          <div
            className="card-panel"
            style={{
              marginBottom: 0,
              border: '1px solid var(--primary-cyan)',
              background: 'var(--panel-elevated)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={16} style={{ color: 'var(--thermal-red)' }} />
                  DETECTION #{inspectorDetection.id}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Single Source of Truth Telemetry
                </div>
              </div>
              <button
                onClick={() => setInspectorDetection(null)}
                className="btn-secondary"
                style={{ padding: '3px 8px', fontSize: '10.5px' }}
              >
                Close
              </button>
            </div>

            {/* FOCUS ON EARTH ACTION BUTTON (Required by Prompt Section 15) */}
            <button
              onClick={() => handleFocus(inspectorDetection)}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: '13px' }}
            >
              <Globe size={16} />
              <span>FOCUS ON EARTH</span>
            </button>

            {/* Telemetry Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px' }}>
              <div style={{ padding: '10px 12px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Canonical Coordinates
                </span>
                <strong className="mono-cell" style={{ color: 'var(--ice-blue)', fontSize: '14px' }}>
                  {parseFloat(inspectorDetection.latitude).toFixed(6)}°, {parseFloat(inspectorDetection.longitude).toFixed(6)}°
                </strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>PREDICTED CLASS</span>
                  <ClassBadge predictedClass={inspectorDetection.predicted_class} />
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>CONFIDENCE</span>
                  <strong className="mono-cell" style={{ color: 'var(--success)' }}>
                    {((parseFloat(inspectorDetection.prediction_confidence) || 0) * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>RADIATIVE POWER (FRP)</span>
                  <strong className="mono-cell" style={{ color: 'var(--thermal-orange)' }}>
                    {inspectorDetection.frp ? `${parseFloat(inspectorDetection.frp).toFixed(1)} MW` : 'N/A'}
                  </strong>
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>BRIGHTNESS TEMP</span>
                  <strong className="mono-cell">
                    {inspectorDetection.brightness ? `${parseFloat(inspectorDetection.brightness).toFixed(1)} K` : 'N/A'}
                  </strong>
                </div>
              </div>

              <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>SATELLITE & SENSOR</span>
                <span style={{ color: 'var(--ice-blue)', fontWeight: 600 }}>
                  {inspectorDetection.source} ({inspectorDetection.instrument || 'VIIRS'}) &bull; Day/Night: {inspectorDetection.daynight || 'D'}
                </span>
              </div>

              <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>ACQUISITION TIMESTAMP (UTC)</span>
                <span className="mono-cell">{inspectorDetection.acq_date} {inspectorDetection.acq_time}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>DATA PROVENANCE</span>
                  <ProvenanceBadge provenance={inspectorDetection.data_provenance} />
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>ALERT LEVEL</span>
                  <StatusBadge status={inspectorDetection.alert_level || 'LOW'} type="severity" />
                </div>
              </div>

              <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>MODEL VERSION</span>
                <span className="mono-cell" style={{ color: 'var(--text-secondary)' }}>
                  {inspectorDetection.model_version || '2.0.0-scientific-prototype'}
                </span>
              </div>

              <div style={{ padding: '8px 10px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px' }}>VERIFICATION STATUS</span>
                <StatusBadge status="REQUIRES_VERIFICATION" type="verification" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
