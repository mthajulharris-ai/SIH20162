import React from 'react';
import { BarChart3, PieChart, TrendingUp, Radio, Factory, Flame, ShieldAlert } from 'lucide-react';
import { KpiCard } from '../components/KpiCard';

export function AnalyticsView({ analytics }) {
  const classDist = analytics?.class_distribution || {};
  const sourceDist = analytics?.source_distribution || {};
  const total = analytics?.total_detections || 0;
  const dateTrend = analytics?.date_trend || [];

  return (
    <div>
      {/* Top Metric Cards */}
      <div className="kpi-grid">
        <KpiCard
          title="Industrial Hotspots"
          value={analytics?.industrial_fires ?? 0}
          subtext="Total classified industrial events"
          icon={Factory}
          accentColor="red"
        />

        <KpiCard
          title="Persistent Clusters"
          value={analytics?.persistent_sources ?? 0}
          subtext="Refinery / gas flares"
          icon={Flame}
          accentColor="amber"
        />

        <KpiCard
          title="Average Fire Power"
          value={`${analytics?.avg_frp_mw ?? 0} MW`}
          subtext="Radiative intensity benchmark"
          icon={Radio}
          accentColor="cyan"
        />

        <KpiCard
          title="Critical Alerts Generated"
          value={analytics?.critical_alerts ?? 0}
          subtext="Operational flags raised"
          icon={ShieldAlert}
          accentColor="purple"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '24px' }}>
        {/* Classification Distribution */}
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <BarChart3 size={18} style={{ color: 'var(--accent-cyan)' }} />
                Thermal Hotspot Classification Breakdown
              </div>
              <div className="panel-subtitle">Proportion of AI classified categories</div>
            </div>
          </div>

          {total > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              {Object.entries(classDist).map(([className, count]) => {
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                let color = '#06B6D4';
                if (className.toLowerCase().includes('industrial')) color = '#EF4444';
                if (className.toLowerCase().includes('persistent')) color = '#F59E0B';

                return (
                  <div key={className}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{className}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: color,
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No detection data available for classification breakdown.
            </div>
          )}
        </div>

        {/* Satellite Sensor Constellation Breakdown */}
        <div className="card-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Radio size={18} style={{ color: 'var(--accent-emerald)' }} />
                Satellite Constellation Share
              </div>
              <div className="panel-subtitle">Detection distribution across satellite sensors</div>
            </div>
          </div>

          {total > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              {Object.entries(sourceDist).map(([source, count]) => {
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                return (
                  <div key={source}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{source}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: 'var(--accent-emerald)',
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No satellite source data available.
            </div>
          )}
        </div>

        {/* Date Activity Trend */}
        <div className="card-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <TrendingUp size={18} style={{ color: 'var(--accent-orange)' }} />
                Temporal Anomaly Trend
              </div>
              <div className="panel-subtitle">Daily detection volume recorded over recent acquisitions</div>
            </div>
          </div>

          {dateTrend.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', height: '180px', paddingTop: '20px' }}>
              {dateTrend.map((item) => {
                const maxCount = Math.max(...dateTrend.map((d) => d.count), 1);
                const heightPct = Math.max(15, (item.count / maxCount) * 100);

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
                      {item.count}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '44px',
                        height: `${heightPct}%`,
                        background: 'linear-gradient(180deg, #F97316 0%, rgba(249, 115, 22, 0.3) 100%)',
                        borderRadius: '6px 6px 0 0',
                        border: '1px solid rgba(249, 115, 22, 0.5)',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.date}
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
