import React, { useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
  Edit3,
  Globe,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { StatusBadge, ProvenanceBadge, ClassBadge } from '../components/StatusBadge';

export function AlertsView({
  alerts = [],
  onUpdateAlertStatus,
  onRefresh,
  loading = false,
  onFocusDetection,
}) {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState('');
  const [selectedProvenanceFilter, setSelectedProvenanceFilter] = useState('');
  const [updatingAlertId, setUpdatingAlertId] = useState(null);
  const [modalAlert, setModalAlert] = useState(null);
  const [newStatus, setNewStatus] = useState('UNDER_REVIEW');
  const [reviewNotes, setReviewNotes] = useState('');

  const filtered = alerts.filter((a) => {
    if (selectedStatusFilter && a.verification_status !== selectedStatusFilter) return false;
    if (selectedSeverityFilter && a.alert_level !== selectedSeverityFilter) return false;
    if (selectedProvenanceFilter && a.data_provenance !== selectedProvenanceFilter) return false;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Purpose Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(11, 23, 38, 0.95) 0%, rgba(15, 32, 50, 0.85) 100%)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} style={{ color: '#EF4444' }} />
            <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF' }}>
              ALERTS &bull; INCIDENT REVIEW QUEUE
            </span>
            <span style={{ fontSize: '10.5px', color: '#EF4444', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              What needs attention?
            </span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ice-blue)', fontWeight: 600, marginTop: '3px' }}>
            "Review high-risk thermal events requiring human decision and verification."
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {filtered.length} active alerts queued
        </div>
      </div>

      {/* Safety & Protocol Banner */}
      <div
        style={{
          background: 'rgba(15, 32, 50, 0.7)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '12.5px',
          color: 'var(--text-secondary)',
        }}
      >
        <ShieldAlert size={18} style={{ color: 'var(--thermal-red)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Human-in-the-Loop Incident Verification Queue:</strong> Satellite thermal
          alerts require human/drone ground confirmation. Update verification states to dispatch inspection units or dismiss controlled flares.
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="filter-bar">
        <select
          value={selectedSeverityFilter}
          onChange={(e) => setSelectedSeverityFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Alert Severities</option>
          <option value="CRITICAL">Critical Priority</option>
          <option value="HIGH">High Severity</option>
          <option value="MEDIUM">Medium Severity</option>
          <option value="LOW">Low / Advisory</option>
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
          <option value="DISMISSED">Dismissed / Controlled</option>
        </select>

        <select
          value={selectedProvenanceFilter}
          onChange={(e) => setSelectedProvenanceFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Data Origins</option>
          <option value="REAL_FIRMS">REAL_FIRMS (NASA)</option>
          <option value="PROTOTYPE_LABELLED">PROTOTYPE_LABELLED</option>
          <option value="SAMPLE">DEMO / SAMPLE</option>
        </select>

        <button onClick={onRefresh} disabled={loading} className="btn-secondary">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>
      </div>

      {/* Alerts Table Panel */}
      <div className="card-panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <AlertTriangle size={17} style={{ color: 'var(--thermal-red)' }} />
              Active Thermal Incident Alert Queue ({filtered.length})
            </div>
            <div className="panel-subtitle">Multi-tier satellite thermal hazard stream</div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Alert Title & Telemetry</th>
                <th>Classification</th>
                <th>Confidence</th>
                <th>FRP (MW)</th>
                <th>Origin</th>
                <th>Verification State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((alert) => (
                  <tr key={alert.id}>
                    <td><StatusBadge status={alert.alert_level} type="severity" /></td>
                    <td style={{ maxWidth: '340px' }}>
                      <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '13px', marginBottom: '2px' }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {alert.message}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                        {parseFloat(alert.latitude).toFixed(4)}°, {parseFloat(alert.longitude).toFixed(4)}° &bull; {alert.acq_date} {alert.acq_time} UTC
                      </div>
                    </td>
                    <td><ClassBadge predictedClass={alert.predicted_class} /></td>
                    <td className="mono-cell" style={{ fontWeight: 600 }}>
                      {alert.prediction_confidence ? `${(parseFloat(alert.prediction_confidence) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="mono-cell" style={{ color: 'var(--thermal-orange)', fontWeight: 600 }}>
                      {alert.frp ? `${parseFloat(alert.frp).toFixed(1)}` : '—'}
                    </td>
                    <td><ProvenanceBadge provenance={alert.data_provenance} /></td>
                    <td><StatusBadge status={alert.verification_status} type="verification" /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px', gap: '4px' }}
                            title="Focus on 3D Earth"
                          >
                            <Globe size={12} />
                            <span>Focus</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenReviewModal(alert)}
                          className="btn-primary"
                          style={{ padding: '4px 8px', fontSize: '11px', gap: '4px' }}
                          title="Update verification status"
                        >
                          <Edit3 size={12} />
                          <span>Review</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No alerts match the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal Dialog */}
      {modalAlert && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 11, 20, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div className="modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                Verify Incident Alert #{modalAlert.id}
              </div>
              <button
                onClick={() => setModalAlert(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: '14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <strong>Target:</strong> {modalAlert.title} &bull; Coordinates: {parseFloat(modalAlert.latitude).toFixed(4)}°, {parseFloat(modalAlert.longitude).toFixed(4)}°
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Update Verification State
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="filter-input"
                style={{ width: '100%' }}
              >
                <option value="REQUIRES_VERIFICATION">Requires Verification</option>
                <option value="UNDER_REVIEW">Under Review (Inspector / Drone Assigned)</option>
                <option value="VERIFIED">Ground Verified (Confirmed Incident)</option>
                <option value="DISMISSED">Dismissed (Controlled Flare / False Anomaly)</option>
              </select>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Operator / Field Inspection Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="Log field inspection team notes, drone observation data, or reason for dismissal..."
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
                disabled={updatingAlertId === modalAlert.id}
                className="btn-primary"
              >
                {updatingAlertId === modalAlert.id ? 'Updating...' : 'Save Verification State'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
