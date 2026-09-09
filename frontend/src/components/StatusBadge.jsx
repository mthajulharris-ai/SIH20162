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

export function ClassBadge({ predictedClass }) {
  if (!predictedClass) return <span className="badge badge-low">Unclassified</span>;

  const lower = predictedClass.toLowerCase();
  if (lower.includes('industrial')) {
    return <span className="badge badge-critical">{predictedClass}</span>;
  }
  if (lower.includes('persistent') || lower.includes('flare')) {
    return <span className="badge badge-medium">{predictedClass}</span>;
  }
  return <span className="badge badge-low">{predictedClass}</span>;
}
