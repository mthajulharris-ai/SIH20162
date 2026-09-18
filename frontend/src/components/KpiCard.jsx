import React from 'react';
import { useTheme } from '../context/ThemeContext';

export function KpiCard({
  title,
  value,
  subtext,
  icon: Icon,
  accentColor = 'cyan',
  badgeText = null,
  trendText = null,
  trendPositive = true,
  sparklineData = null,
  valueStyle,
  className = '',
}) {
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';

  const colorMap = isLight
    ? {
        cyan: { bg: 'rgba(2, 132, 199, 0.12)', text: '#0284C7', border: 'rgba(2, 132, 199, 0.35)' },
        ice: { bg: 'rgba(2, 132, 199, 0.12)', text: '#0284C7', border: 'rgba(2, 132, 199, 0.35)' },
        red: { bg: 'rgba(220, 38, 38, 0.12)', text: '#DC2626', border: 'rgba(220, 38, 38, 0.35)' },
        orange: { bg: 'rgba(234, 88, 12, 0.12)', text: '#EA580C', border: 'rgba(234, 88, 12, 0.35)' },
        amber: { bg: 'rgba(217, 119, 6, 0.12)', text: '#D97706', border: 'rgba(217, 119, 6, 0.35)' },
        emerald: { bg: 'rgba(22, 163, 74, 0.12)', text: '#16A34A', border: 'rgba(22, 163, 74, 0.35)' },
        purple: { bg: 'rgba(124, 58, 237, 0.12)', text: '#7C3AED', border: 'rgba(124, 58, 237, 0.35)' },
      }
    : {
        cyan: { bg: 'rgba(69, 200, 245, 0.15)', text: '#45C8F5', border: 'rgba(69, 200, 245, 0.35)' },
        ice: { bg: 'rgba(141, 231, 255, 0.15)', text: '#8DE7FF', border: 'rgba(141, 231, 255, 0.35)' },
        red: { bg: 'rgba(255, 69, 58, 0.15)', text: '#FF453A', border: 'rgba(255, 69, 58, 0.35)' },
        orange: { bg: 'rgba(255, 138, 0, 0.15)', text: '#FF8A00', border: 'rgba(255, 138, 0, 0.35)' },
        amber: { bg: 'rgba(255, 200, 87, 0.15)', text: '#FFC857', border: 'rgba(255, 200, 87, 0.35)' },
        emerald: { bg: 'rgba(69, 212, 131, 0.15)', text: '#45D483', border: 'rgba(69, 212, 131, 0.35)' },
        purple: { bg: 'rgba(167, 139, 250, 0.15)', text: '#A78BFA', border: 'rgba(167, 139, 250, 0.35)' },
      };

  const theme = colorMap[accentColor] || colorMap.cyan;

  // Render SVG mini sparkline if provided
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const max = Math.max(...sparklineData, 1);
    const min = Math.min(...sparklineData, 0);
    const range = max - min || 1;
    const w = 56;
    const h = 20;
    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * w;
        const y = h - ((val - min) / range) * (h - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return (
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke={theme.text}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  return (
    <div className={`kpi-card ${className}`.trim()} style={{ borderTop: `2px solid ${theme.text}` }}>
      <div className="kpi-top">
        <span className="kpi-title">{title}</span>
        {Icon && (
          <div
            className="kpi-icon-box"
            style={{ backgroundColor: theme.bg, color: theme.text }}
          >
            <Icon size={17} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="kpi-value" style={valueStyle}>{value}</div>
        {renderSparkline()}
      </div>

      <div className="kpi-footer">
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{subtext}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {trendText && (
            <span style={{ fontSize: '10px', color: trendPositive ? 'var(--success)' : 'var(--thermal-red)', fontWeight: 600 }}>
              {trendText}
            </span>
          )}
          <span
            className="kpi-badge"
            style={{
              backgroundColor: theme.bg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          >
            {badgeText || 'Live'}
          </span>
        </div>
      </div>
    </div>
  );
}
