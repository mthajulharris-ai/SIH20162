import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Radio,
  Factory,
  Flame,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  Clock,
  Info,
  Check,
  Zap,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';

export function AnalyticsView({ analytics }) {
  const total = analytics?.total_detections || 0;
  const indFires = analytics?.industrial_fire_predictions || 0;
  const persistentSources = analytics?.persistent_source_predictions || 0;
  const otherPreds = analytics?.other_predictions || 0;
  const highConf = analytics?.high_confidence_detections || 0;
  const verBreakdown = analytics?.verification_breakdown || {};
  const geoDist = analytics?.geographic_distribution || [];
  const dateTrend = analytics?.detections_over_time || [];
  const sourceDist = analytics?.source_distribution || {};

  return (
    <div>
      {/* AI Prediction vs Real Incident Distinction Banner */}
      <div
        style={{
          background: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '22px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <Info size={20} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>AI Predictions vs Confirmed Incidents:</strong> All values on this
          dashboard are computed strictly from satellite telemetry and ML model classifications. High-confidence
          events remain <strong>unverified predictions</strong> until ground truth validation or on-site reports are logged.
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="kpi-grid">
        <KpiCard
          title="Total Detections"
          value={total}
          subtext="Processed satellite hotspots"
          icon={Flame}
          accentColor="cyan"
        />

        <KpiCard
          title="Industrial Fire Predictions"
          value={indFires}
          subtext="AI-classified industrial events"
          icon={Factory}
          accentColor="red"
        />

        <KpiCard
          title="Persistent Source Predictions"
          value={persistentSources}
          subtext="Flares & high-recurrence sources"
          icon={Flame}
          accentColor="amber"
        />

        <KpiCard
          title="Other Predictions"
          value={otherPreds}
          subtext="Agricultural / vegetation / other"
          icon={Radio}
          accentColor="purple"
        />

        <KpiCard
          title="High-Confidence Hotspots"
          value={highConf}
          subtext="Model confidence >= 80%"
          icon={Zap}
          accentColor="emerald"
        />
      </div>

      {/* Operational Verification Status (AI Predictions vs Confirmed Incidents) */}
      <div className="card-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <ShieldAlert size={18} style={{ color: 'var(--accent-red)' }} />
              Operational Incident Verification Lifecycle
            </div>
            <div className="panel-subtitle">
              Strictly tracks which AI predictions have been confirmed on ground versus pending verification
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={16} style={{ color: '#C084FC' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#C084FC', textTransform: 'uppercase' }}>
                Unverified AI Predictions
              </span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.unverified_predictions ?? 0}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Automated alerts awaiting review
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Clock size={16} style={{ color: '#60A5FA' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#60A5FA', textTransform: 'uppercase' }}>
                Under Operational Review
              </span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.under_review ?? 0}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Drone / inspector dispatched
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CheckCircle2 size={16} style={{ color: '#34D399' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#34D399', textTransform: 'uppercase' }}>
                Confirmed Real Incidents
              </span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.confirmed_incidents ?? 0}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Confirmed by physical ground team
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: 'rgba(100, 116, 139, 0.08)',
              border: '1px solid rgba(100, 116, 139, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Check size={16} style={{ color: '#94A3B8' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                Dismissed / Controlled
              </span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.dismissed_alerts ?? 0}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Controlled flares / non-emergencies
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
        {/* Geographic Distribution */}
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <MapPin size={18} style={{ color: 'var(--accent-orange)' }} />
                Geographic Distribution (Regional Belts)
              </div>
              <div className="panel-subtitle">Concentration of thermal hotspots across geographic sectors</div>
            </div>
          </div>

          {geoDist.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
              {geoDist.map((item) => {
                const maxCount = Math.max(...geoDist.map((g) => g.count), 1);
                const pct = ((item.count / maxCount) * 100).toFixed(0);

                return (
                  <div key={item.region}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{item.region}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {item.count} detections (Avg FRP: {item.avg_frp} MW)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: 'var(--accent-orange)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No geographic distribution data available.
            </div>
          )}
        </div>

        {/* Temporal Detections Over Time */}
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <TrendingUp size={18} style={{ color: 'var(--accent-cyan)' }} />
                Detections Over Time
              </div>
              <div className="panel-subtitle">Temporal anomaly timeline by satellite acquisition date</div>
            </div>
          </div>

          {dateTrend.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '180px', paddingTop: '20px' }}>
              {dateTrend.map((item) => {
                const maxCount = Math.max(...dateTrend.map((d) => d.total), 1);
                const heightPct = Math.max(15, (item.total / maxCount) * 100);

                return (
                  <div
                    key={item.date}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#FFFFFF', fontWeight: 600 }}>
                      {item.total}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '40px',
                        height: `${heightPct}%`,
                        background: 'linear-gradient(180deg, #06B6D4 0%, rgba(6, 182, 212, 0.3) 100%)',
                        borderRadius: '6px 6px 0 0',
                        border: '1px solid rgba(6, 182, 212, 0.5)',
                      }}
                    />
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No temporal trend records available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
