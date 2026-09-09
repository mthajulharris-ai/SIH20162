import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock, XCircle, Info, Edit3 } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';

export function AlertsView({ alerts = [], onUpdateAlertStatus, onRefresh, loading = false }) {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('');
  const [updatingAlertId, setUpdatingAlertId] = useState(null);
  const [modalAlert, setModalAlert] = useState(null);
  const [newStatus, setNewStatus] = useState('UNDER_REVIEW');
  const [reviewNotes, setReviewNotes] = useState('');

  const filtered = alerts.filter((a) => {
    if (selectedStatusFilter && a.verification_status !== selectedStatusFilter) return false;
    if (selectedSeverityFilter && a.alert_level !== selectedSeverityFilter) return false;
    return true;
  });

  const handleOpenReviewModal = (alert) => {
    setModalAlert(alert);
    setNewStatus(alert.verification_status || 'UNDER_REVIEW');
    setReviewNotes(alert.verification_notes || '');
  };

  const handleSaveStatus = async () => {
    if (!modalAlert) return;
    try {
      setUpdatingAlertId(modalAlert.id);
      await onUpdateAlertStatus(modalAlert.id, newStatus, reviewNotes);
      setModalAlert(null);
    } catch (err) {
      alert(`Failed to update alert: ${err.message}`);
    } finally {
      setUpdatingAlertId(null);
    }
  };

  return (
    <div>
      {/* Safety Notice Banner */}
      <div
        style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '8px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <ShieldAlert size={20} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Verification Protocol:</strong> Alerts in this feed are generated automatically by satellite anomaly classification and <strong>require ground verification</strong>. Do not mobilize critical emergency units without multi-source confirmation.
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <select
          value={selectedSeverityFilter}
          onChange={(e) => setSelectedSeverityFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical Only</option>
          <option value="HIGH">High Severity Only</option>
          <option value="MEDIUM">Medium Severity Only</option>
        </select>

        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Verification States</option>
          <option value="REQUIRES_VERIFICATION">Requires Verification</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="VERIFIED">Ground Verified</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      {/* Alerts Table Panel */}
      <div className="card-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
              Active Incident Alert Stream ({filtered.length})
            </div>
            <div className="panel-subtitle">Operational queue for thermal hazard monitoring</div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Alert Level</th>
                <th>Alert Title & Description</th>
                <th>AI Classification</th>
                <th>Confidence</th>
                <th>FRP (MW)</th>
                <th>Verification State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <StatusBadge status={alert.alert_level} type="severity" />
                    </td>
                    <td style={{ maxWidth: '380px' }}>
                      <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '13px', marginBottom: '3px' }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {alert.message}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                        {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)} | {alert.acq_date} {alert.acq_time} UTC
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '12.5px' }}>
                        {alert.predicted_class}
                      </span>
                    </td>
                    <td className="mono-cell" style={{ fontWeight: 700 }}>
                      {(alert.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                      {alert.frp ? `${alert.frp.toFixed(1)} MW` : '—'}
                    </td>
                    <td>
                      <StatusBadge status={alert.verification_status} type="verification" />
                      {alert.verification_notes && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                          "{alert.verification_notes}"
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleOpenReviewModal(alert)}
                        className="btn-secondary"
                        style={{ fontSize: '11.5px', padding: '5px 10px' }}
                      >
                        <Edit3 size={12} />
                        <span>Update</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No alerts match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification Update Modal */}
      {modalAlert && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
              Update Alert Verification Status
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Alert #{modalAlert.id}: {modalAlert.title}
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Verification State
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="filter-input"
                style={{ width: '100%' }}
              >
                <option value="REQUIRES_VERIFICATION">REQUIRES VERIFICATION (Default)</option>
                <option value="UNDER_REVIEW">UNDER REVIEW (Inspection Dispatched)</option>
                <option value="VERIFIED">GROUND VERIFIED (Confirmed on field)</option>
                <option value="DISMISSED">DISMISSED (Benign / Controlled Flare)</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Operational Notes
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add ground sensor notes, inspector comments, or drone inspection results..."
                className="filter-input"
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setModalAlert(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={updatingAlertId !== null}
                className="btn-primary"
              >
                {updatingAlertId ? 'Saving...' : 'Save Verification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
