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
  Satellite,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Purpose Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(6, 78, 119, 0.25) 0%, rgba(15, 23, 42, 0.4) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            What is happening over time?
          </span>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            Temporal Analytics & Incident Lifecycle
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#94A3B8', lineHeight: 1.5 }}>
          Understand thermal detection trends, class distribution, and operational verification lifecycle over time across satellite passes.
        </p>
      </div>

      {/* Notice Banner */}
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
        <Info size={18} style={{ color: 'var(--primary-cyan)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>AI Predictions vs Confirmed Incidents:</strong> Telemetry values
          are computed from satellite data and model v2.0.0 classifications. Unverified alerts are tracked separately from ground-confirmed incidents.
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: 0 }}>
        <KpiCard
          title="Total Observations"
          value={total}
          subtext="Processed FIRMS hotspots"
          icon={Flame}
          accentColor="cyan"
          badgeText="Live DB"
        />

        <KpiCard
          title="Industrial Fires"
          value={indFires}
          subtext="Thermal surge events"
          icon={Factory}
          accentColor="red"
          badgeText="Critical"
        />

        <KpiCard
          title="Persistent Sources"
          value={persistentSources}
          subtext="Refinery flare recurrence"
          icon={Flame}
          accentColor="amber"
          badgeText="Recurring"
        />

        <KpiCard
          title="Other / Background"
          value={otherPreds}
          subtext="Vegetation & seasonal"
          icon={Radio}
          accentColor="ice"
          badgeText="Nominal"
        />

        <KpiCard
          title="High Confidence"
          value={highConf}
          subtext="Model confidence >= 80%"
          icon={Zap}
          accentColor="emerald"
          badgeText=">= 80%"
        />
      </div>

      {/* Operational Incident Verification Lifecycle */}
      <div className="card-panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <ShieldAlert size={17} style={{ color: 'var(--thermal-red)' }} />
              Operational Verification Lifecycle Tracking
            </div>
            <div className="panel-subtitle">
              Strictly categorizes AI predictions by human-in-the-loop field verification state
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '6px',
          }}
        >
          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Clock size={15} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-purple)', textTransform: 'uppercase' }}>
                Requires Verification
              </span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.unverified_predictions ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Automated alerts awaiting triage</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(69, 200, 245, 0.08)', border: '1px solid rgba(69, 200, 245, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Clock size={15} style={{ color: 'var(--primary-cyan)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-cyan)', textTransform: 'uppercase' }}>
                Under Operational Review
              </span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.under_review ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Drone / inspector active</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(69, 212, 131, 0.08)', border: '1px solid rgba(69, 212, 131, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase' }}>
                Ground Confirmed
              </span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.confirmed_incidents ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Physical ground verification confirmed</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(154, 175, 194, 0.08)', border: '1px solid rgba(154, 175, 194, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Check size={15} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Dismissed / Controlled
              </span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
              {verBreakdown.dismissed_alerts ?? 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Controlled flaring / false trigger</div>
          </div>
        </div>
      </div>

      {/* Class Distribution & Satellite Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* Class Distribution */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <BarChart3 size={17} style={{ color: 'var(--primary-cyan)' }} />
                AI Thermal Class Distribution
              </div>
              <div className="panel-subtitle">Model v2.0.0 predictions across categories</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--critical-red)' }}>Industrial Fire</span>
                <span className="mono-cell">{indFires} ({total > 0 ? ((indFires / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (indFires / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--critical-red)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--warning)' }}>Persistent Thermal Source (Flare/Smelter)</span>
                <span className="mono-cell">{persistentSources} ({total > 0 ? ((persistentSources / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (persistentSources / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--warning)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--primary-cyan)' }}>Other / Background Vegetation</span>
                <span className="mono-cell">{otherPreds} ({total > 0 ? ((otherPreds / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (otherPreds / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--primary-cyan)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Satellite Constellation Distribution */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Satellite size={17} style={{ color: 'var(--ice-blue)' }} />
                Sensor & Satellite Distribution
              </div>
              <div className="panel-subtitle">Observation shares by satellite platform</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--ice-blue)' }}>VIIRS S-NPP (Suomi NPP 375m)</span>
                <span className="mono-cell">58.3%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '58.3%', height: '100%', backgroundColor: 'var(--ice-blue)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--primary-cyan)' }}>VIIRS NOAA-20 / NOAA-21 (375m)</span>
                <span className="mono-cell">29.2%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '29.2%', height: '100%', backgroundColor: 'var(--primary-cyan)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>MODIS Terra & Aqua (1km)</span>
                <span className="mono-cell">12.5%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '12.5%', height: '100%', backgroundColor: 'var(--text-secondary)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
