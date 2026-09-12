import React, { useState } from 'react';
import { Flame, Search, Filter, RefreshCw, ExternalLink } from 'lucide-react';
import { ClassBadge, ProvenanceBadge } from '../components/StatusBadge';

export function DetectionsView({ detections = [], onRefresh, loading = false, onFocusDetection }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [provenanceFilter, setProvenanceFilter] = useState('');

  const filtered = detections.filter((d) => {
    if (sourceFilter && d.source !== sourceFilter) return false;
    if (classFilter && (d.predicted_class || '').toLowerCase() !== classFilter.toLowerCase()) return false;
    if (provenanceFilter && d.data_provenance !== provenanceFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchCoord = `${d.latitude},${d.longitude}`.includes(q);
      const matchClass = (d.predicted_class || '').toLowerCase().includes(q);
      const matchSource = (d.source || '').toLowerCase().includes(q);
      const matchProv = (d.data_provenance || '').toLowerCase().includes(q);
      return matchCoord || matchClass || matchSource || matchProv;
    }
    return true;
  });

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by coordinates, class, or satellite..."
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
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20</option>
          <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua</option>
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Predicted Classes</option>
          <option value="Industrial Fire">Industrial Fire</option>
          <option value="Forest Fire">Forest Fire</option>
          <option value="Persistent Thermal Source">Persistent Thermal Source</option>
          <option value="Other">Other</option>
        </select>

        <select
          value={provenanceFilter}
          onChange={(e) => setProvenanceFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Data Origins</option>
          <option value="REAL_FIRMS">REAL_FIRMS (NASA)</option>
          <option value="USER_UPLOADED">USER_UPLOADED</option>
          <option value="PROTOTYPE_LABELLED">PROTOTYPE_LABELLED</option>
        </select>

        <button onClick={onRefresh} disabled={loading} className="btn-secondary">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Reload</span>
        </button>
      </div>

      {/* Detections Table Panel */}
      <div className="card-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <Flame size={18} style={{ color: 'var(--accent-orange)' }} />
              Thermal Hotspot Records ({filtered.length} of {detections.length})
            </div>
            <div className="panel-subtitle">Ingested satellite observations classified by AI model</div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Coordinates</th>
                <th>AI Predicted Class</th>
                <th>Confidence</th>
                <th>Origin</th>
                <th>FRP (MW)</th>
                <th>Brightness (K)</th>
                <th>Satellite</th>
                <th>Model</th>
                <th>Acquired (UTC)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td className="mono-cell">#{d.id}</td>
                    <td className="mono-cell" style={{ color: '#FFFFFF' }}>
                      {parseFloat(d.latitude).toFixed(4)}, {parseFloat(d.longitude).toFixed(4)}
                    </td>
                    <td>
                      <ClassBadge predictedClass={d.predicted_class} />
                    </td>
                    <td className="mono-cell" style={{ fontWeight: 600 }}>
                      {(parseFloat(d.prediction_confidence || 0) * 100).toFixed(1)}%
                    </td>
                    <td>
                      <ProvenanceBadge provenance={d.data_provenance} />
                    </td>
                    <td className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                      {d.frp !== null && d.frp !== undefined ? `${parseFloat(d.frp).toFixed(1)} MW` : '—'}
                    </td>
                    <td className="mono-cell">
                      {d.brightness ? `${parseFloat(d.brightness).toFixed(1)} K` : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>
                        {d.source || 'VIIRS'}
                      </span>
                    </td>
                    <td className="mono-cell" style={{ fontSize: '11px', color: '#94A3B8' }}>
                      {d.model_version || '2.0.0-scientific-prototype'}
                    </td>
                    <td className="mono-cell" style={{ fontSize: '11.5px' }}>
                      {d.acq_date} {d.acq_time}
                    </td>
                    <td>
                      {onFocusDetection && (
                        <button
                          onClick={() => onFocusDetection(d)}
                          className="btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', gap: '4px' }}
                          title="Rotate 3D Earth to this hotspot location"
                        >
                          <span>🌍</span>
                          <span>Focus</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No thermal detection records match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
