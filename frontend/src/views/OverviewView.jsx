import React from 'react';
import {
  Flame,
  AlertTriangle,
  Factory,
  Radio,
  Activity,
  ArrowRight,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge, ClassBadge } from '../components/StatusBadge';

export function OverviewView({
  analytics,
  recentAlerts,
  onNavigate,
  onUpdateAlertStatus,
}) {
  const isZero = !analytics || analytics.total_detections === 0;

  return (
    <div>
      {/* Disclaimer Banner */}
      <div
        style={{
          background: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <Info size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>PS 26162 Operational Notice:</strong> Thermal anomalies shown are
          detected by satellite sensors and categorized by the AI classification model. All flagged alerts require
          ground / multi-spectral field verification.
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="kpi-grid">
        <KpiCard
          title="Total Detections"
          value={analytics?.total_detections ?? 0}
          subtext="Processed satellite hotspots"
          icon={Flame}
          accentColor="cyan"
          badgeText="Live DB"
        />

        <KpiCard
          title="Critical Alerts"
          value={analytics?.critical_alerts ?? 0}
          subtext="Requires field verification"
          icon={ShieldAlert}
          accentColor="red"
          badgeText="Live DB"
        />

        <KpiCard
          title="Industrial Fires"
          value={analytics?.industrial_fires ?? 0}
          subtext="AI-predicted industrial events"
          icon={Factory}
          accentColor="amber"
          badgeText="Live DB"
        />

        <KpiCard
          title="Persistent Hotspots"
          value={analytics?.persistent_sources ?? 0}
          subtext="Flares & high recurrence zones"
          icon={Activity}
          accentColor="purple"
          badgeText="Live DB"
        />

        <KpiCard
          title="Avg Radiative Power"
          value={`${analytics?.avg_frp_mw ?? 0} MW`}
          subtext={`Peak recorded: ${analytics?.max_frp_mw ?? 0} MW`}
          icon={Radio}
          accentColor="emerald"
          badgeText="Live DB"
        />
      </div>

      {/* Two Column Layout: Recent Alerts & System Pipeline Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
        {/* Recent Alerts Feed */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
                Active Alerts Feed
              </div>
              <div className="panel-subtitle">Latest events requiring review</div>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '5px 10px' }}
            >
              <span>View All</span>
              <ArrowRight size={12} />
            </button>
          </div>

          {recentAlerts && recentAlerts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '14px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusBadge status={alert.alert_level} type="severity" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                        {alert.title}
                      </span>
                    </div>
                    <StatusBadge status={alert.verification_status} type="verification" />
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.4 }}>
                    {alert.message}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span>
                      Coord: {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)} | FRP: {alert.frp || 0} MW
                    </span>
                    <span>{alert.acq_date} {alert.acq_time} UTC</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No active alerts in the database. Use "Ingest Test Hotspot" above to simulate real satellite observations.
            </div>
          )}
        </div>

        {/* Satellite Pipeline Status & Quick GIS Summary */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Radio size={18} style={{ color: 'var(--accent-cyan)' }} />
                Pipeline Telemetry Status
              </div>
              <div className="panel-subtitle">Real-time architecture integration checks</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                padding: '14px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Satellite Sensors</span>
                <span className="badge badge-verified">Active</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                VIIRS S-NPP (375m), VIIRS NOAA-20/21, MODIS Terra/Aqua (1km)
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>ML Inference Engine</span>
                <span className="badge badge-verified">Connected</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Multi-class classification (Industrial Fire, Persistent Thermal Source, Other)
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>FastAPI REST Endpoints</span>
                <span className="badge badge-verified">Synced</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Database: SQLite prototype | CORS: Enabled for localhost:5173
              </div>
            </div>

            <button
              onClick={() => onNavigate('gis-map')}
              className="btn-primary"
              style={{ justifyContent: 'center', marginTop: '6px' }}
            >
              <span>Open GIS Interactive Hotspot Map</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
