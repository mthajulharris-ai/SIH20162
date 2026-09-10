import React, { useState } from 'react';
import { History, Download, Calendar, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { ClassBadge, ProvenanceBadge } from '../components/StatusBadge';

export function HistoryView({ detections = [], onQueryHistory }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedProvenance, setSelectedProvenance] = useState('');
  const [minFrp, setMinFrp] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filtered = detections.filter((d) => {
    if (startDate && d.acq_date < startDate) return false;
    if (endDate && d.acq_date > endDate) return false;
    if (selectedSource && d.source !== selectedSource) return false;
    if (selectedClass && d.predicted_class !== selectedClass) return false;
    if (selectedProvenance && d.data_provenance !== selectedProvenance) return false;
    if (minFrp && (d.frp || 0) < parseFloat(minFrp)) return false;
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      alert('No records to export.');
      return;
    }

    const headers = [
      'ID',
      'Acquisition_Timestamp',
      'Latitude',
      'Longitude',
      'Predicted_Class',
      'Confidence',
      'FRP_MW',
      'Brightness_K',
      'Satellite',
      'Instrument',
      'Data_Provenance',
      'Model_Version',
      'Alert_Level',
      'Is_Persistent',
      'Verification_Notice',
    ];

    const rows = filtered.map((d) => [
      d.id,
      `"${d.acq_date} ${d.acq_time} UTC"`,
      parseFloat(d.latitude).toFixed(4),
      parseFloat(d.longitude).toFixed(4),
      `"${d.predicted_class || ''}"`,
      parseFloat(d.prediction_confidence || 0).toFixed(4),
      d.frp !== null && d.frp !== undefined ? parseFloat(d.frp).toFixed(1) : '',
      d.brightness ? parseFloat(d.brightness).toFixed(1) : '',
      `"${d.source || ''}"`,
      `"${d.instrument || 'VIIRS'}"`,
      `"${d.data_provenance || 'SAMPLE'}"`,
      `"${d.model_version || '2.0.0-scientific-prototype'}"`,
      `"${d.alert_level || 'LOW'}"`,
      d.is_persistent ? 'TRUE' : 'FALSE',
      '"AI prediction — Requires Verification"',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `thermal_detections_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Query Filter Toolbar */}
      <div className="filter-bar">
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search coordinates, class..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-input"
          />
        </div>

        {/* Classification Filter */}
        <select
          value={selectedClass}
          onChange={(e) => {
            setSelectedClass(e.target.value);
            setCurrentPage(1);
          }}
          className="filter-input"
        >
          <option value="">All Classes</option>
          <option value="Industrial Fire">Industrial Fire</option>
          <option value="Persistent Thermal Source">Persistent Thermal Source</option>
          <option value="Other">Other / Vegetation</option>
        </select>

        {/* Satellite Filter */}
        <select
          value={selectedSource}
          onChange={(e) => {
            setSelectedSource(e.target.value);
            setCurrentPage(1);
          }}
          className="filter-input"
        >
          <option value="">All Satellites</option>
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20</option>
          <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua</option>
        </select>

        {/* Provenance Filter */}
        <select
          value={selectedProvenance}
          onChange={(e) => {
            setSelectedProvenance(e.target.value);
            setCurrentPage(1);
          }}
          className="filter-input"
        >
          <option value="">All Origins</option>
          <option value="REAL_FIRMS">REAL_FIRMS (NASA)</option>
          <option value="PROTOTYPE_LABELLED">PROTOTYPE_LABELLED</option>
          <option value="SAMPLE">DEMO / SAMPLE</option>
        </select>

        <button onClick={handleExportCsv} className="btn-primary" style={{ marginLeft: 'auto' }}>
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Historical Table Panel */}
      <div className="card-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <History size={18} style={{ color: 'var(--accent-purple)' }} />
              Historical Observation Archive ({filtered.length} matching)
            </div>
            <div className="panel-subtitle">Audited sensor records stored in SQLite database with full operational fields</div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={{ padding: '4px 8px' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Timestamp (UTC)</th>
                <th>Coordinates</th>
                <th>Predicted Class</th>
                <th>Confidence</th>
                <th>Origin</th>
                <th>FRP (MW)</th>
                <th>Brightness (K)</th>
                <th>Model</th>
                <th>Persistent?</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((d) => (
                  <tr key={d.id}>
                    <td className="mono-cell">#{d.id}</td>
                    <td className="mono-cell" style={{ color: '#FFFFFF' }}>
                      {d.acq_date} {d.acq_time}
                    </td>
                    <td className="mono-cell">
                      {parseFloat(d.latitude).toFixed(4)}, {parseFloat(d.longitude).toFixed(4)}
                    </td>
                    <td>
                      <ClassBadge predictedClass={d.predicted_class} />
                    </td>
                    <td className="mono-cell">{(parseFloat(d.prediction_confidence || 0) * 100).toFixed(1)}%</td>
                    <td>
                      <ProvenanceBadge provenance={d.data_provenance} />
                    </td>
                    <td className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                      {d.frp !== null && d.frp !== undefined ? `${parseFloat(d.frp).toFixed(1)} MW` : '—'}
                    </td>
                    <td className="mono-cell">{d.brightness ? `${parseFloat(d.brightness).toFixed(1)} K` : '—'}</td>
                    <td className="mono-cell" style={{ fontSize: '11px', color: '#94A3B8' }}>
                      {d.model_version || '2.0.0-scientific-prototype'}
                    </td>
                    <td>
                      {d.is_persistent ? (
                        <span className="badge badge-medium">Yes</span>
                      ) : (
                        <span className="badge badge-low">No</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No historical records match the selected date or sensor range.
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
