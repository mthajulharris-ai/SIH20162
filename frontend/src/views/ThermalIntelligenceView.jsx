import React, { useState } from 'react';
import {
  Flame,
  Activity,
  Zap,
  Radio,
  Satellite,
  BarChart3,
  Sun,
  Moon,
  Info,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { ClassBadge, StatusBadge } from '../components/StatusBadge';

export function ThermalIntelligenceView({
  detections = [],
  analytics,
  onFocusDetection,
}) {
  // Compute thermal metrics
  const total = detections.length;
  const frpValues = detections
    .map((d) => parseFloat(d.frp))
    .filter((v) => !isNaN(v) && v > 0);

  const totalFrp = frpValues.reduce((a, b) => a + b, 0).toFixed(1);
  const maxFrp = frpValues.length ? Math.max(...frpValues).toFixed(1) : '0.0';
  const avgFrp = frpValues.length ? (totalFrp / frpValues.length).toFixed(1) : '0.0';

  // Intensity Tiers
  const lowTier = detections.filter((d) => (parseFloat(d.frp) || 0) < 20).length;
  const medTier = detections.filter((d) => (parseFloat(d.frp) || 0) >= 20 && (parseFloat(d.frp) || 0) < 50).length;
  const highTier = detections.filter((d) => (parseFloat(d.frp) || 0) >= 50 && (parseFloat(d.frp) || 0) < 100).length;
  const critTier = detections.filter((d) => (parseFloat(d.frp) || 0) >= 100).length;

  // Day vs Night passes
  const dayPasses = detections.filter((d) => d.daynight === 'D').length;
  const nightPasses = detections.filter((d) => d.daynight === 'N').length;

  // Classification counts
  const industrialCount = detections.filter((d) => d.predicted_class === 'Industrial Fire').length;
  const persistentCount = detections.filter((d) => d.predicted_class?.includes('Persistent')).length;
  const otherCount = total - industrialCount - persistentCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Title & Info Banner */}
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
        <Flame size={18} style={{ color: 'var(--thermal-orange)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Thermal Radiative Telemetry:</strong> Analyses Fire Radiative Power (FRP),
          sensor brightness temperatures, and spatial persistence ratios across spaceborne VIIRS and MODIS observations.
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: 0 }}>
        <KpiCard
          title="Total Thermal Power"
          value={`${totalFrp} MW`}
          subtext="Cumulative radiative output"
          icon={Flame}
          accentColor="orange"
          badgeText="Active FRP"
        />

        <KpiCard
          title="Peak Radiative FRP"
          value={`${maxFrp} MW`}
          subtext="Highest single-pixel anomaly"
          icon={Zap}
          accentColor="red"
          badgeText="Peak"
        />

        <KpiCard
          title="Mean Anomaly FRP"
          value={`${avgFrp} MW`}
          subtext="Average radiative intensity"
          icon={Activity}
          accentColor="cyan"
          badgeText="Mean"
        />

        <KpiCard
          title="Day / Night Ratio"
          value={`${dayPasses}D / ${nightPasses}N`}
          subtext="Sensor solar illumination"
          icon={Sun}
          accentColor="amber"
          badgeText="Orbit Passes"
        />
      </div>

      {/* Middle Grid: Thermal Intensity Tiers & Fire Classification Ratio */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* Thermal Intensity Hierarchy */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <BarChart3 size={17} style={{ color: 'var(--primary-cyan)' }} />
                Thermal Radiative Intensity Tiers
              </div>
              <div className="panel-subtitle">Distribution of observations by Fire Radiative Power (MW)</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
            {/* Critical (>100 MW) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--critical-red)' }}>Critical Intensity (&gt; 100 MW)</span>
                <span className="mono-cell">{critTier} ({total > 0 ? ((critTier / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (critTier / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--critical-red)' }} />
              </div>
            </div>

            {/* High (50 - 100 MW) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--thermal-orange)' }}>High Intensity (50 &ndash; 100 MW)</span>
                <span className="mono-cell">{highTier} ({total > 0 ? ((highTier / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (highTier / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--thermal-orange)' }} />
              </div>
            </div>

            {/* Medium (20 - 50 MW) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--warning)' }}>Medium Intensity (20 &ndash; 50 MW)</span>
                <span className="mono-cell">{medTier} ({total > 0 ? ((medTier / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (medTier / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--warning)' }} />
              </div>
            </div>

            {/* Low (<20 MW) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: 'var(--primary-cyan)' }}>Low Intensity (&lt; 20 MW)</span>
                <span className="mono-cell">{lowTier} ({total > 0 ? ((lowTier / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (lowTier / total) * 100 : 0}%`, height: '100%', backgroundColor: 'var(--primary-cyan)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* AI Thermal Classification Hierarchy */}
        <div className="card-panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Flame size={17} style={{ color: 'var(--thermal-red)' }} />
                AI Thermal Classification Breakdown
              </div>
              <div className="panel-subtitle">Multi-class inference by Model v2.0.0</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#F87171' }}>Industrial Fire (Thermal Surge)</span>
                <span className="mono-cell">{industrialCount} ({total > 0 ? ((industrialCount / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (industrialCount / total) * 100 : 0}%`, height: '100%', backgroundColor: '#EF4444' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FBBF24' }}>Persistent Thermal Source (Flare/Smelter)</span>
                <span className="mono-cell">{persistentCount} ({total > 0 ? ((persistentCount / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (persistentCount / total) * 100 : 0}%`, height: '100%', backgroundColor: '#F59E0B' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#38BDF8' }}>Other / Seasonal Vegetation</span>
                <span className="mono-cell">{otherCount} ({total > 0 ? ((otherCount / total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? (otherCount / total) * 100 : 0}%`, height: '100%', backgroundColor: '#0284C7' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Thermal Radiative Sources Table */}
      <div className="card-panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <Zap size={17} style={{ color: 'var(--thermal-orange)' }} />
              Peak Radiative Energy Hotspots (Highest FRP)
            </div>
            <div className="panel-subtitle">Prioritized listing by megawatt radiative emissions</div>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Coordinates</th>
                <th>Classification</th>
                <th>FRP (MW)</th>
                <th>Brightness (K)</th>
                <th>Confidence</th>
                <th>Satellite</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...detections]
                .sort((a, b) => (parseFloat(b.frp) || 0) - (parseFloat(a.frp) || 0))
                .slice(0, 8)
                .map((d) => (
                  <tr key={d.id}>
                    <td className="mono-cell">#{d.id}</td>
                    <td className="mono-cell" style={{ color: '#FFFFFF' }}>
                      {parseFloat(d.latitude).toFixed(4)}°, {parseFloat(d.longitude).toFixed(4)}°
                    </td>
                    <td><ClassBadge predictedClass={d.predicted_class} /></td>
                    <td className="mono-cell" style={{ color: 'var(--thermal-orange)', fontWeight: 700 }}>
                      {d.frp ? `${parseFloat(d.frp).toFixed(1)} MW` : '—'}
                    </td>
                    <td className="mono-cell">{d.brightness ? `${parseFloat(d.brightness).toFixed(1)} K` : '—'}</td>
                    <td className="mono-cell">{((parseFloat(d.prediction_confidence) || 0) * 100).toFixed(0)}%</td>
                    <td><span style={{ fontSize: '11px', color: 'var(--ice-blue)' }}>{d.source || 'VIIRS'}</span></td>
                    <td>
                      {onFocusDetection && (
                        <button
                          onClick={() => onFocusDetection(d)}
                          className="btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '10.5px' }}
                        >
                          Focus
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
