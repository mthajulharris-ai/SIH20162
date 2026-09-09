import React, { useState } from 'react';
import { History, Download, Calendar, Filter, FileText } from 'lucide-react';
import { ClassBadge } from '../components/StatusBadge';

export function HistoryView({ detections = [], onQueryHistory }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [minFrp, setMinFrp] = useState('');

  const filtered = detections.filter((d) => {
    if (startDate && d.acq_date < startDate) return false;
    if (endDate && d.acq_date > endDate) return false;
    if (selectedSource && d.source !== selectedSource) return false;
    if (minFrp && (d.frp || 0) < parseFloat(minFrp)) return false;
    return true;
  });

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      alert('No records to export.');
      return;
    }

    const headers = [
      'ID',
      'Latitude',
      'Longitude',
      'Brightness_K',
      'FRP_MW',
      'Predicted_Class',
      'Confidence',
      'Source',
      'Acq_Date',
      'Acq_Time',
      'Is_Persistent',
    ];

    const rows = filtered.map((d) => [
      d.id,
      d.latitude,
      d.longitude,
      d.brightness,
      d.frp,
      `"${d.predicted_class || ''}"`,
      d.prediction_confidence,
      `"${d.source || ''}"`,
      d.acq_date,
      d.acq_time,
      d.is_persistent,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <select
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="filter-input"
        >
          <option value="">All Satellites</option>
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua</option>
        </select>

        <input
          type="number"
          placeholder="Min FRP (MW)"
          value={minFrp}
          onChange={(e) => setMinFrp(e.target.value)}
          className="filter-input"
          style={{ width: '130px' }}
        />

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
            <div className="panel-subtitle">Audited historical sensor records stored in SQLite database</div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Date & Time</th>
                <th>Geographic Coordinates</th>
                <th>Predicted Class</th>
                <th>Confidence</th>
                <th>FRP (MW)</th>
                <th>Brightness (K)</th>
                <th>Persistent?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td className="mono-cell">#{d.id}</td>
                    <td className="mono-cell" style={{ color: '#FFFFFF' }}>
                      {d.acq_date} {d.acq_time} UTC
                    </td>
                    <td className="mono-cell">
                      {d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}
                    </td>
                    <td>
                      <ClassBadge predictedClass={d.predicted_class} />
                    </td>
                    <td className="mono-cell">{(d.prediction_confidence * 100).toFixed(1)}%</td>
                    <td className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                      {d.frp ? `${d.frp.toFixed(1)} MW` : '—'}
                    </td>
                    <td className="mono-cell">{d.brightness ? `${d.brightness.toFixed(1)} K` : '—'}</td>
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
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
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
