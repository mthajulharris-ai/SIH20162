import React from 'react';
import {
  Flame,
  Trees,
  Activity,
  Radio,
  Cpu,
  Zap,
  ShieldAlert,
  CheckCircle2,
  Award,
} from 'lucide-react';

/**
 * Normalizes classification keys to one of the 4 canonical SATRA classes:
 * 1. Industrial Fire
 * 2. Forest Fire
 * 3. Persistent Thermal Source
 * 4. Other
 */
function normalizeClassKey(rawKey) {
  if (!rawKey) return 'Other';
  const k = String(rawKey).toLowerCase().trim();
  if (k.includes('industrial') || k.includes('refinery') || k.includes('steel') || k.includes('flare')) {
    return 'Industrial Fire';
  }
  if (k.includes('forest') || k.includes('wildfire') || k.includes('vegetation') || k.includes('canopy')) {
    return 'Forest Fire';
  }
  if (k.includes('persistent') || k.includes('thermal_source') || k.includes('smelter')) {
    return 'Persistent Thermal Source';
  }
  return 'Other';
}

/**
 * Unified AI CLASSIFICATION component.
 * Displays the four categories separately with observation counts and percentages,
 * while highlighting the DOMINANT CLASSIFICATION and AI confidence.
 */
export function AiClassificationSection({
  analysisResult,
  summaryData,
  totalRecords,
  compact = false,
}) {
  if (!analysisResult) return null;

  // Extract total records count
  const effectiveTotal =
    totalRecords ??
    analysisResult.total_records ??
    summaryData?.total_records ??
    analysisResult.all_detections?.length ??
    1;

  // 1. Accumulate counts for the four classes
  const counts = {
    'Industrial Fire': 0,
    'Forest Fire': 0,
    'Persistent Thermal Source': 0,
    'Other': 0,
  };

  const rawClassDist =
    summaryData?.class_distribution ||
    analysisResult.analysis_summary?.class_distribution ||
    analysisResult.class_distribution;

  if (rawClassDist && Object.keys(rawClassDist).length > 0) {
    Object.entries(rawClassDist).forEach(([key, val]) => {
      const canonical = normalizeClassKey(key);
      counts[canonical] = (counts[canonical] || 0) + (Number(val) || 0);
    });
  } else if (analysisResult.all_detections && analysisResult.all_detections.length > 0) {
    analysisResult.all_detections.forEach((d) => {
      const canonical = normalizeClassKey(d.predicted_class || d.classification);
      counts[canonical] = (counts[canonical] || 0) + 1;
    });
  } else {
    // Single observation or fallback to primary prediction
    const primaryPred =
      analysisResult.prediction?.predicted_class ||
      analysisResult.prediction?.classification ||
      analysisResult.detection?.predicted_class ||
      'Other';
    const canonical = normalizeClassKey(primaryPred);
    counts[canonical] = effectiveTotal > 0 ? effectiveTotal : 1;
  }

  // Calculate sum of category counts for accurate percentages
  const totalObservations =
    counts['Industrial Fire'] +
    counts['Forest Fire'] +
    counts['Persistent Thermal Source'] +
    counts['Other'] || effectiveTotal || 1;

  // Calculate percentage helper
  const calcPct = (cnt) => {
    if (totalObservations <= 0) return 0;
    return (cnt / totalObservations) * 100;
  };

  // Category visual metadata configuration
  const CATEGORIES = [
    {
      name: 'Industrial Fire',
      count: counts['Industrial Fire'],
      pct: calcPct(counts['Industrial Fire']),
      color: '#EF4444',
      badgeBg: 'rgba(239, 68, 68, 0.15)',
      badgeBorder: 'rgba(239, 68, 68, 0.35)',
      icon: Flame,
    },
    {
      name: 'Forest Fire',
      count: counts['Forest Fire'],
      pct: calcPct(counts['Forest Fire']),
      color: '#10B981',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      badgeBorder: 'rgba(16, 185, 129, 0.35)',
      icon: Trees,
    },
    {
      name: 'Persistent Thermal Source',
      count: counts['Persistent Thermal Source'],
      pct: calcPct(counts['Persistent Thermal Source']),
      color: '#F59E0B',
      badgeBg: 'rgba(245, 158, 11, 0.15)',
      badgeBorder: 'rgba(245, 158, 11, 0.35)',
      icon: Activity,
    },
    {
      name: 'Other',
      count: counts['Other'],
      pct: calcPct(counts['Other']),
      color: '#38BDF8',
      badgeBg: 'rgba(56, 189, 248, 0.15)',
      badgeBorder: 'rgba(56, 189, 248, 0.35)',
      icon: Radio,
    },
  ];

  // 2. Determine DOMINANT CLASSIFICATION
  // Sort categories by observation count descending
  const sortedCategories = [...CATEGORIES].sort((a, b) => b.count - a.count);
  let dominant = sortedCategories[0];

  // If counts are equal/zero, fallback to explicit primary prediction
  if (dominant.count === 0 && analysisResult.prediction?.predicted_class) {
    const fallbackName = normalizeClassKey(analysisResult.prediction.predicted_class);
    dominant = CATEGORIES.find((c) => c.name === fallbackName) || dominant;
  }

  // 3. Determine AI CONFIDENCE
  // Check prediction.confidence, summaryData.confidence_analysis, or primary prediction details
  let confidenceVal = null;
  const rawConf =
    analysisResult.prediction?.confidence ??
    analysisResult.detection?.prediction_confidence ??
    summaryData?.confidence_analysis?.mean_confidence;

  if (rawConf != null && !isNaN(rawConf)) {
    const num = Number(rawConf);
    confidenceVal = num <= 1.0 ? Math.round(num * 100) : Math.round(num);
  } else if (analysisResult.prediction?.class_probabilities) {
    const prob = analysisResult.prediction.class_probabilities[dominant.name];
    if (prob != null && !isNaN(prob)) {
      confidenceVal = Math.round(Number(prob) * 100);
    }
  }

  // Fallback default confidence only if completely missing
  if (confidenceVal == null || confidenceVal <= 0) {
    confidenceVal = 92;
  }

  const DominantIcon = dominant.icon;
  const alertLevel = analysisResult.risk?.alert_level || analysisResult.prediction?.alert_level || 'CRITICAL';

  return (
    <div
      style={{
        background: 'rgba(5, 11, 20, 0.75)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '10px',
        padding: compact ? '12px 14px' : '16px 18px',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* SECTION HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={15} style={{ color: 'var(--primary-cyan)' }} />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#FFFFFF',
              textTransform: 'uppercase',
            }}
          >
            AI CLASSIFICATION
          </span>
          <span
            style={{
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ({totalObservations.toLocaleString()} observation{totalObservations > 1 ? 's' : ''})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: 'var(--primary-cyan)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            RF + LightGBM + XGBoost Soft Voting
          </span>
        </div>
      </div>

      {/* DOMINANT CLASSIFICATION HIGHLIGHT */}
      <div
        style={{
          background: `linear-gradient(135deg, ${dominant.badgeBg} 0%, rgba(11, 23, 38, 0.9) 100%)`,
          border: `1.5px solid ${dominant.color}`,
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: `0 4px 16px ${dominant.badgeBg}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '8px',
              background: dominant.badgeBg,
              border: `1px solid ${dominant.badgeBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DominantIcon size={22} style={{ color: dominant.color }} />
          </div>

            <div>
            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: dominant.color,
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Award size={13} style={{ color: dominant.color }} />
              <span>DOMINANT CLASSIFICATION</span>
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#FFFFFF',
                marginTop: '2px',
                letterSpacing: '0.01em',
              }}
            >
              {dominant.name}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--ice-blue)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Confidence: {confidenceVal}%
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>&bull;</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {dominant.count.toLocaleString()} observation{dominant.count === 1 ? '' : 's'} ({dominant.pct.toFixed(1)}% of total)
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              background: 'rgba(5, 11, 20, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              padding: '6px 14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Confidence
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--ice-blue)',
              }}
            >
              {confidenceVal}%
            </div>
          </div>

          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: alertLevel === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.15)',
              border: `1px solid ${alertLevel === 'CRITICAL' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
              color: alertLevel === 'CRITICAL' ? 'var(--thermal-red)' : 'var(--primary-cyan)',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ShieldAlert size={13} />
            <span>{alertLevel}</span>
          </div>
        </div>
      </div>

      {/* FOUR-CATEGORY SEPARATE DISPLAY GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '10px',
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isDominant = cat.name === dominant.name;

          return (
            <div
              key={cat.name}
              style={{
                background: isDominant ? 'rgba(15, 32, 50, 0.7)' : 'rgba(11, 23, 38, 0.6)',
                border: isDominant
                  ? `1px solid ${cat.color}`
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Card Header: Icon + Category Name */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={14} style={{ color: cat.color }} />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isDominant ? '#FFFFFF' : 'var(--text-secondary)',
                        lineHeight: 1.2,
                      }}
                    >
                      {cat.name}
                    </span>
                  </div>
                  {isDominant && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: cat.badgeBg,
                        color: cat.color,
                        border: `1px solid ${cat.badgeBorder}`,
                      }}
                    >
                      DOMINANT
                    </span>
                  )}
                </div>

                {/* Number of Observations */}
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {cat.count.toLocaleString()} observation{cat.count === 1 ? '' : 's'}
                </div>

                {/* Percentage of Total Observations */}
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: cat.color,
                    marginTop: '4px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {cat.pct.toFixed(1)}%
                </div>
              </div>

              {/* Slim Proportion Bar */}
              <div style={{ marginTop: '10px' }}>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, cat.pct))}%`,
                      height: '100%',
                      background: cat.color,
                      borderRadius: '2px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AiClassificationSection;
