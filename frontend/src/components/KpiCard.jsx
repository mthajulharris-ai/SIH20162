import React from 'react';

export function KpiCard({
  title,
  value,
  subtext,
  icon: Icon,
  accentColor = 'cyan',
  isDemo = false,
  badgeText = null,
}) {
  const colorMap = {
    cyan: { bg: 'rgba(6, 182, 212, 0.15)', text: '#06B6D4', border: 'rgba(6, 182, 212, 0.3)' },
    red: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.3)' },
    amber: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)' },
    emerald: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981', border: 'rgba(16, 185, 129, 0.3)' },
    purple: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8B5CF6', border: 'rgba(139, 92, 246, 0.3)' },
  };

  const theme = colorMap[accentColor] || colorMap.cyan;

  return (
    <div className="kpi-card" style={{ borderTop: `2px solid ${theme.text}` }}>
      <div className="kpi-top">
        <span className="kpi-title">{title}</span>
        {Icon && (
          <div
            className="kpi-icon-box"
            style={{ backgroundColor: theme.bg, color: theme.text }}
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="kpi-value">{value}</div>

      <div className="kpi-footer">
        <span>{subtext}</span>
        {isDemo ? (
          <span
            className="kpi-badge"
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#FACC15',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
          >
            Demo Simulation
          </span>
        ) : (
          <span
            className="kpi-badge"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#34D399',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            {badgeText || 'Live DB'}
          </span>
        )}
      </div>
    </div>
  );
}
