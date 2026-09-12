import React from 'react';
import { AlertCircle, CheckCircle2, Clock, XCircle, ShieldAlert } from 'lucide-react';

export function StatusBadge({ status, type = 'verification' }) {
  if (!status) return null;

  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  if (type === 'severity') {
    switch (normalized) {
      case 'CRITICAL':
        return (
          <span className="badge badge-critical">
            <ShieldAlert size={12} /> Critical
          </span>
        );
      case 'HIGH':
        return (
          <span className="badge badge-high">
            <AlertCircle size={12} /> High
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="badge badge-medium">
            <Clock size={12} /> Medium
          </span>
        );
      case 'LOW_CONFIDENCE_REVIEW':
        return (
          <span className="badge badge-low-conf" title="Model uncertainty flag: prediction confidence < 60%">
            <AlertCircle size={12} /> Low-Confidence Review
          </span>
        );
      default:
        return <span className="badge badge-low">{status}</span>;
    }
  }

  // Verification status
  switch (normalized) {
    case 'REQUIRES_VERIFICATION':
      return (
        <span className="badge badge-unverified" title="Automated AI prediction; needs field verification">
          <AlertCircle size={12} /> Requires Verification
        </span>
      );
    case 'UNDER_REVIEW':
      return (
        <span className="badge badge-under-review">
          <Clock size={12} /> Under Review
        </span>
      );
    case 'VERIFIED':
      return (
        <span className="badge badge-verified">
          <CheckCircle2 size={12} /> Ground Verified
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="badge badge-dismissed">
          <XCircle size={12} /> Dismissed
        </span>
      );
    default:
      return <span className="badge badge-low">{status}</span>;
  }
}

export function ProvenanceBadge({ provenance }) {
  if (!provenance) return <span className="badge badge-real-firms">REAL_FIRMS</span>;

  const upper = provenance.toUpperCase();
  if (upper === 'REAL_FIRMS' || upper.includes('FIRMS')) {
    return (
      <span className="badge badge-real-firms" title="Live NASA FIRMS satellite observation">
        REAL_FIRMS
      </span>
    );
  }
  if (upper.includes('USER') || upper.includes('UPLOAD')) {
    return (
      <span className="badge badge-verified" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', borderColor: 'rgba(56, 189, 248, 0.35)' }} title="User-uploaded satellite observation">
        USER_UPLOADED
      </span>
    );
  }
  if (upper.includes('PROTOTYPE')) {
    return (
      <span className="badge badge-prototype" title="Project prototype/model-labelled data (NOT verified ground truth)">
        PROTOTYPE_LABELLED
      </span>
    );
  }
  return (
    <span className="badge badge-real-firms" title="Satellite Observation Data">
      REAL_FIRMS
    </span>
  );
}

export function ClassBadge({ predictedClass }) {
  if (!predictedClass) return <span className="badge badge-low">🌡️ Other</span>;

  const lower = predictedClass.toLowerCase();
  if (lower.includes('industrial')) {
    return <span className="badge badge-critical">🔥 Industrial Fire</span>;
  }
  if (lower.includes('forest') || lower.includes('wildfire')) {
    return <span className="badge badge-forest">🌲 Forest Fire</span>;
  }
  if (lower.includes('persistent') || lower.includes('flare')) {
    return <span className="badge badge-medium">♨️ Persistent Thermal Source</span>;
  }
  return <span className="badge badge-low">🌡️ Other</span>;
}
