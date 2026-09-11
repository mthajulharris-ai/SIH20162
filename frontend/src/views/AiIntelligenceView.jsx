import React from 'react';
import {
  Cpu,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  Layers,
  Info,
  ExternalLink,
  Target,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';

export function AiIntelligenceView() {
  const modelMetrics = [
    { name: '4-Fold CV Macro F1', value: '0.8175', benchmark: 'Top performer across unseen clusters' },
    { name: 'Holdout Industrial Fire Recall', value: '100%', benchmark: '2/2 industrial fires detected with zero misses' },
    { name: 'Holdout Macro F1', value: '0.8000', benchmark: 'Held-out spatially isolated facilities' },
    { name: 'Spatial Cluster Overlap', value: '0 Clusters', benchmark: 'Zero spatial data leakage between Train/Val/Test' },
  ];

  const features = [
    { name: 'frp', desc: 'Fire Radiative Power in Megawatts (MW)', weight: '34.2%' },
    { name: 'brightness', desc: 'VIIRS 375m I4 band brightness temperature (Kelvin)', weight: '24.6%' },
    { name: 'recurrence_count', desc: 'Historical thermal persistence count within 1km radius', weight: '18.5%' },
    { name: 'spatial_cluster_density', desc: 'Spatial density of neighboring thermal hotspots', weight: '12.1%' },
    { name: 'surge_ratio', desc: 'Ratio of current FRP over baseline historical mean', weight: '7.8%' },
    { name: 'daynight', desc: 'Day (D) vs Night (N) solar illumination flag', weight: '2.8%' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Scientific Validation Notice Banner */}
      <div
        style={{
          background: 'rgba(15, 32, 50, 0.7)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <Cpu size={20} style={{ color: 'var(--primary-cyan)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Scientific Model Validation Notice:</strong> Model{' '}
          <code style={{ color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>2.0.0-scientific-prototype</code>{' '}
          classifies thermal observations into <strong>Industrial Fire</strong>, <strong>Persistent Thermal Source</strong>, or <strong>Other</strong>.
          Partitioning enforces strict zero spatial leakage via <code>StratifiedGroupKFold</code> across 34 geographic clusters. All automated classifications represent candidate detections requiring ground-truth confirmation.
        </div>
      </div>

      {/* Model Spec KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: 0 }}>
        <KpiCard
          title="Active Model Version"
          value="v2.0.0-sci"
          subtext="L2 Regularized Classifier"
          icon={Cpu}
          accentColor="cyan"
          badgeText="Active"
        />

        <KpiCard
          title="Holdout Macro F1"
          value="0.8000"
          subtext="Held-out unseen facilities"
          icon={Target}
          accentColor="ice"
          badgeText="Validated"
        />

        <KpiCard
          title="Industrial Fire Recall"
          value="100%"
          subtext="2/2 test fires detected"
          icon={Zap}
          accentColor="red"
          badgeText="Zero Misses"
        />

        <KpiCard
          title="Uncertainty Triage"
          value="< 60% CONF"
          subtext="Flags low confidence review"
          icon={AlertTriangle}
          accentColor="amber"
          badgeText="Safety Gate"
        />
      </div>

      {/* Two Column Grid: Validation Metrics & Feature Importance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* Validation Benchmark Comparison Table */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Activity size={17} style={{ color: 'var(--primary-cyan)' }} />
                Scientific Cross-Validation & Benchmark Comparison
              </div>
              <div className="panel-subtitle">4-Fold Stratified Group K-Fold evaluation across 34 spatial clusters</div>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model Candidate</th>
                  <th>4-Fold CV F1</th>
                  <th>Holdout F1</th>
                  <th>Holdout IF Recall</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ backgroundColor: 'rgba(69, 200, 245, 0.08)' }}>
                  <td>
                    <strong style={{ color: '#FFFFFF' }}>Logistic Regression (L2, Balanced)</strong>
                  </td>
                  <td className="mono-cell" style={{ color: 'var(--primary-cyan)', fontWeight: 700 }}>0.8175</td>
                  <td className="mono-cell" style={{ color: '#FFFFFF' }}>0.8000</td>
                  <td className="mono-cell" style={{ color: 'var(--success)', fontWeight: 700 }}>100%</td>
                  <td>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(69, 212, 131, 0.2)', color: 'var(--success)', fontWeight: 700 }}>
                      ACTIVE (v2.0)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Random Forest (max_depth=6)</td>
                  <td className="mono-cell">0.7762</td>
                  <td className="mono-cell">0.6389</td>
                  <td className="mono-cell">100%</td>
                  <td>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                      Baseline (v1.0)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>HistGradientBoosting</td>
                  <td className="mono-cell">0.7383</td>
                  <td className="mono-cell">0.5278</td>
                  <td className="mono-cell">100%</td>
                  <td>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                      Evaluated
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '14px', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            * Note: Spatial clustering is calculated via DBSCAN ($\epsilon = 0.05^\circ$). All models were evaluated strictly without cluster overlap to guarantee no geographic data leakage.
          </div>
        </div>

        {/* Feature Importance & Explanability */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Layers size={17} style={{ color: 'var(--ice-blue)' }} />
                Feature Weights & Decision Drivers
              </div>
              <div className="panel-subtitle">Key telemetry inputs driving multi-class classification</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
            {features.map((f) => (
              <div key={f.name} style={{ padding: '8px 12px', background: 'rgba(11, 23, 38, 0.5)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span className="mono-cell" style={{ fontWeight: 600, color: 'var(--ice-blue)', fontSize: '12px' }}>{f.name}</span>
                  <span className="mono-cell" style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '12px' }}>{f.weight}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
