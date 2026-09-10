import React, { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, Check } from 'lucide-react';

export function Header({
  pageTitle,
  isBackendHealthy,
  onRefresh,
  onIngestSample,
  isIngesting = false,
}) {
  const [utcTime, setUtcTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="top-header">
      <div className="header-left">
        <h1 className="page-heading">{pageTitle}</h1>
      </div>

      <div className="header-right">
        {/* UTC Clock */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {utcTime}
        </div>

        {/* Model Version Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Model:</span>
          <strong style={{ color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>2.0.0-scientific-prototype</strong>
        </div>

        {/* Backend Connectivity Status */}
        <div className="live-pill">
          <span
            className="live-dot"
            style={{
              backgroundColor: isBackendHealthy ? 'var(--accent-emerald)' : 'var(--accent-red)',
              boxShadow: isBackendHealthy
                ? '0 0 8px var(--accent-emerald)'
                : '0 0 8px var(--accent-red)',
            }}
          />
          <span>{isBackendHealthy ? 'API Active' : 'API Offline'}</span>
        </div>

        {/* Quick Sample Ingest for Live Testing */}
        {onIngestSample && (
          <button
            onClick={onIngestSample}
            disabled={isIngesting}
            className="btn-primary"
            title="Ingests a real test hotspot via POST /api/v1/inference/predict-and-store"
          >
            <PlusCircle size={15} />
            <span>{isIngesting ? 'Ingesting...' : 'Ingest Test Hotspot'}</span>
          </button>
        )}

        {/* Refresh Button */}
        {onRefresh && (
          <button onClick={onRefresh} className="btn-secondary" title="Refresh data from FastAPI backend">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
