import React, { useId, useMemo, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  Compass,
  Cpu,
  ExternalLink,
  Gauge,
  ListChecks,
  Radar,
  ShieldCheck,
  Thermometer,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { buildEventIntelligence } from '../services/eventIntelligence';

/**
 * DeepEventIntelligence
 * --------------------------------------------------------------------------
 * Collapsible "DEEP EVENT INTELLIGENCE" accordion.
 *
 * It is designed to be rendered INSIDE the existing "EXACT DETECTION LOCATION"
 * card (GIS Investigation → right side details panel) so the complete event
 * intelligence stays in context with the detection details.
 *
 * - Opens downward inside the same container (never a detached/floating card).
 * - Content is capped with max-height + overflow-y: auto, so the host card and
 *   the page height stay controlled while the full intelligence remains
 *   scrollable.
 * - Uses the shared `buildEventIntelligence()` model, so no event intelligence
 *   data is duplicated.
 */

const NA = 'N/A';

function text(value, fallback = NA) {
  if (value === null || value === undefined) return fallback;
  const asText = String(value).trim();
  return asText === '' ? fallback : asText;
}

function formatDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return NA;
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(2)} km`;
}

function nearestOf(features) {
  if (!features || features.length === 0) return null;
  return features.reduce((best, current) =>
    current.distance_m <= best.distance_m ? current : best
  );
}

function pixelConfidenceLabel(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'h') return 'High (h)';
  if (key === 'n') return 'Nominal (n)';
  if (key === 'l') return 'Low (l)';
  return NA;
}

function groundPixelLabel(instrument, source) {
  const haystack = `${instrument || ''} ${source || ''}`.toUpperCase();
  if (haystack.includes('VIIRS')) return '375 m (nominal I-band)';
  if (haystack.includes('SLSTR')) return '500 m (nominal)';
  if (haystack.includes('MODIS')) return '1 km (nominal)';
  return NA;
}

function thermalIntensityLabel(frpMw) {
  if (typeof frpMw !== 'number' || !Number.isFinite(frpMw)) return NA;
  if (frpMw >= 100) return 'Extreme radiative output';
  if (frpMw >= 50) return 'Very high radiative output';
  if (frpMw >= 10) return 'Moderate radiative output';
  return 'Low radiative output';
}

function confidenceTier(confidencePct) {
  if (typeof confidencePct !== 'number' || !Number.isFinite(confidencePct)) return NA;
  if (confidencePct >= 85) return 'High confidence';
  if (confidencePct >= 65) return 'Moderate confidence';
  return 'Low confidence — human review required';
}

/* ------------------------------------------------------------------ atoms */

function IntelRow({ label, value, valueColor, isLight, mono = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '2px 10px',
        padding: '6px 8px',
        background: 'var(--glass-nested)',
        border: '1px solid var(--glass-border-subtle)',
        borderRadius: '6px',
        fontSize: '11px',
      }}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: valueColor || (isLight ? '#0F172A' : 'var(--text-primary)'),
          fontWeight: 600,
          textAlign: 'right',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          wordBreak: 'break-word',
          minWidth: 0,
          maxWidth: '100%',
          flex: '1 1 auto',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function IntelNote({ children, isLight }) {
  return (
    <div
      style={{
        padding: '7px 9px',
        background: 'var(--glass-nested)',
        border: '1px solid var(--glass-border-subtle)',
        borderRadius: '6px',
        fontSize: '10.8px',
        lineHeight: 1.5,
        color: isLight ? '#475569' : 'var(--text-muted)',
      }}
    >
      {children}
    </div>
  );
}

function IntelSection({ title, icon: Icon, isLight, children }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <Icon size={12} style={{ color: isLight ? '#0284C7' : '#38BDF8' }} />
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isLight ? '#0284C7' : '#38BDF8',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ main */

export function DeepEventIntelligence({
  detection = null,
  localFeatures = [],
  onOpenFullInvestigation,
  defaultExpanded = false,
  maxHeight = 380,
  className = '',
}) {
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const panelId = useId();

  const intel = useMemo(() => {
    const event = buildEventIntelligence(detection, { applyReferenceDefaults: false });
    const raw = event.raw || {};

    const industrial = localFeatures.filter((f) => f.category === 'industrial');
    const vegetation = localFeatures.filter((f) => f.category === 'vegetation');
    const places = localFeatures.filter((f) => f.category === 'place');
    const roads = localFeatures.filter((f) => f.category === 'road');
    const buildings = localFeatures.filter((f) => f.category === 'building');

    const nearestIndustrial = nearestOf(industrial);
    const nearestVegetation = nearestOf(vegetation);
    const nearestPlace = nearestOf(places);
    const nearestFeature = nearestOf(localFeatures);

    const classLabel = text(raw.predictedClass, 'Thermal Anomaly (unclassified)');

    const contextSentence = nearestIndustrial
      ? `A mapped industrial facility ("${nearestIndustrial.name}") sits ${formatDistance(nearestIndustrial.distance_m)} from the anomaly, which is consistent with an operational heat source such as industrial flaring or a process furnace.`
      : nearestVegetation
        ? `Mapped vegetation ("${nearestVegetation.name}") lies ${formatDistance(nearestVegetation.distance_m)} from the anomaly, so a biomass / open-burning signature cannot be excluded.`
        : 'No mapped industrial or vegetation feature was returned inside the 1 km radius, so the heat source remains unclassified and requires human verification.';

    const placeSentence = nearestPlace
      ? `Nearest populated place "${nearestPlace.name}" is ${formatDistance(nearestPlace.distance_m)} away — ${nearestPlace.distance_m <= 1000 ? 'inside' : 'outside'} the 1 km investigation perimeter.`
      : 'No populated place mapped within 3 km of the anomaly.';

    return {
      event,
      raw,
      industrial,
      vegetation,
      places,
      roads,
      buildings,
      nearestIndustrial,
      nearestVegetation,
      nearestPlace,
      nearestFeature,
      classLabel,
      contextSentence,
      placeSentence,
      frpLabel: raw.frpMw !== null ? `${raw.frpMw.toFixed(1)} MW` : NA,
      tempLabel: raw.brightnessCelsius !== null ? `${raw.brightnessCelsius.toFixed(1)} °C` : NA,
      groundPixel: groundPixelLabel(raw.instrument, event.satellite),
      intensity: thermalIntensityLabel(raw.frpMw),
      tier: confidenceTier(raw.confidencePct),
      dayNight: raw.daynight
        ? String(raw.daynight).toUpperCase().startsWith('D')
          ? 'Daytime pass'
          : 'Night-time pass'
        : NA,
      scanTrack:
        raw.scan !== null && raw.track !== null
          ? `${raw.scan} km scan / ${raw.track} km track`
          : NA,
      persistence: raw.isPersistent
        ? 'Persistent thermal source (detected on repeat passes)'
        : 'Single-pass detection',
      riskLevel: text(event.risk, 'Not provided'),
      riskScore: raw.riskScore !== null ? `${raw.riskScore.toFixed(1)} / 100` : NA,
    };
  }, [detection, localFeatures]);

  const { event, raw } = intel;

  const accent = isLight ? '#0284C7' : '#38BDF8';
  const accentSoft = isLight ? 'rgba(14, 165, 233, 0.10)' : 'rgba(56, 189, 248, 0.12)';
  const accentBorder = isLight ? 'rgba(14, 165, 233, 0.28)' : 'rgba(56, 189, 248, 0.30)';

  return (
    <div className={className} style={{ width: '100%' }}>
      {/* Accordion header — rendered inside the Exact Detection Location card */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        title={isExpanded ? 'Collapse Deep Event Intelligence' : 'Expand Deep Event Intelligence'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '8px 10px',
          background: isExpanded ? accentSoft : isLight ? '#F8FAFC' : 'rgba(3, 7, 18, 0.5)',
          border: `1px solid ${isExpanded ? accentBorder : 'var(--glass-border-subtle)'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.25s ease, border-color 0.25s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: accentSoft,
              border: `1px solid ${accentBorder}`,
              color: accent,
              flexShrink: 0,
            }}
          >
            <BrainCircuit size={12} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: isLight ? '#0F172A' : '#FFFFFF',
              }}
            >
              DEEP EVENT INTELLIGENCE
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Classification, reasoning, thermal &amp; GIS analysis
            </span>
          </span>
        </span>
        <ChevronDown
          size={14}
          style={{
            color: accent,
            flexShrink: 0,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </button>

      {/* Expandable panel — expands DOWNWARD inside the same card */}
      <div
        id={panelId}
        role="region"
        aria-label="Deep event intelligence details"
        style={{
          maxHeight: isExpanded ? `${maxHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
          visibility: isExpanded ? 'visible' : 'hidden',
          overflowY: isExpanded ? 'auto' : 'hidden',
          overflowX: 'hidden',
          paddingRight: isExpanded ? '4px' : 0,
          // Visibility flips only after the collapse animation finishes, so the
          // animation stays smooth while collapsed content leaves the tab order.
          transition: isExpanded
            ? 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease, padding-right 0.24s ease, visibility 0s linear'
            : 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease, padding-right 0.24s ease, visibility 0s linear 0.32s',
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        {/* 1. EVENT CLASSIFICATION */}
        <IntelSection title="Event classification" icon={Activity} isLight={isLight}>
          <IntelRow label="Event ID" value={text(event.id)} isLight={isLight} mono />
          <IntelRow
            label="AI class"
            value={intel.classLabel}
            valueColor={isLight ? '#0F172A' : '#FFFFFF'}
            isLight={isLight}
          />
          <IntelRow label="Persistence" value={intel.persistence} isLight={isLight} />
          <IntelRow label="Model version" value={text(raw.modelVersion)} isLight={isLight} mono />
          <IntelRow label="Data provenance" value={text(raw.dataProvenance)} isLight={isLight} />
        </IntelSection>

        {/* 2. DETECTION REASONING */}
        <IntelSection title="Detection reasoning" icon={Radar} isLight={isLight}>
          <IntelNote isLight={isLight}>
            {`Thermal anomaly captured at ${text(event.lat, '—')}°, ${text(event.lon, '—')}° with a radiative power of ${intel.frpLabel} and a brightness temperature of ${intel.tempLabel}. Mid-infrared threshold flag triggered on the ${text(raw.instrument, text(event.satellite, 'satellite'))} channel.`}
          </IntelNote>
          <IntelNote isLight={isLight}>{intel.contextSentence}</IntelNote>
          <IntelNote isLight={isLight}>
            Interpretation is based on satellite radiometry only and remains provisional until a human analyst confirms the source.
          </IntelNote>
        </IntelSection>


        {/* 3. THERMAL ANALYSIS */}
        <IntelSection title="Thermal analysis" icon={Thermometer} isLight={isLight}>
          <IntelRow
            label="Brightness temperature"
            value={
              raw.brightnessKelvin !== null
                ? `${intel.tempLabel} (${raw.brightnessKelvin.toFixed(1)} K)`
                : NA
            }
            valueColor="#F97316"
            isLight={isLight}
            mono
          />
          <IntelRow
            label="Fire radiative power"
            value={intel.frpLabel}
            valueColor="#F97316"
            isLight={isLight}
            mono
          />
          <IntelRow label="Intensity class" value={intel.intensity} isLight={isLight} />
          <IntelRow label="Thermal persistence" value={intel.persistence} isLight={isLight} />
          <IntelRow label="Day / night pass" value={intel.dayNight} isLight={isLight} />
        </IntelSection>

        {/* 4. SATELLITE OBSERVATION DETAILS */}
        <IntelSection title="Satellite observation details" icon={Cpu} isLight={isLight}>
          <IntelRow label="Satellite source" value={text(event.satellite)} isLight={isLight} />
          <IntelRow label="Instrument" value={text(raw.instrument)} isLight={isLight} />
          <IntelRow label="Acquisition (UTC)" value={text(event.detected)} isLight={isLight} mono />
          <IntelRow label="Ground pixel" value={intel.groundPixel} isLight={isLight} />
          <IntelRow label="Scan / track" value={intel.scanTrack} isLight={isLight} mono />
          <IntelRow
            label="Pixel confidence (NASA)"
            value={pixelConfidenceLabel(raw.pixelConfidence)}
            isLight={isLight}
          />
          <IntelRow label="Source record" value={text(raw.sourceFile)} isLight={isLight} />
        </IntelSection>


        {/* 5. RISK INTERPRETATION */}
        <IntelSection title="Risk interpretation" icon={Gauge} isLight={isLight}>
          <IntelRow
            label="Alert level"
            value={intel.riskLevel}
            valueColor={intel.riskLevel === 'CRITICAL' || intel.riskLevel === 'HIGH' ? '#EF4444' : '#F59E0B'}
            isLight={isLight}
          />
          <IntelRow label="Risk score" value={intel.riskScore} isLight={isLight} mono />
          <IntelRow
            label="Verification priority"
            value="Requires human verification"
            valueColor="#EF4444"
            isLight={isLight}
          />
          <IntelNote isLight={isLight}>{intel.placeSentence}</IntelNote>
          <IntelNote isLight={isLight}>
            GIS evidence is supporting context only — it never auto-confirms the fire type or the responsible source.
          </IntelNote>
        </IntelSection>

        {/* 6. SUPPORTING GIS EVIDENCE */}
        <IntelSection title="Supporting GIS evidence" icon={Compass} isLight={isLight}>
          <IntelRow
            label="Industrial (1 km)"
            value={`${intel.industrial.length} mapped`}
            isLight={isLight}
          />
          <IntelRow
            label="Nearest industrial"
            value={intel.nearestIndustrial
              ? `${intel.nearestIndustrial.name} · ${formatDistance(intel.nearestIndustrial.distance_m)}`
              : 'None mapped'}
            isLight={isLight}
          />
          <IntelRow
            label="Vegetation (1 km)"
            value={`${intel.vegetation.length} mapped`}
            isLight={isLight}
          />
          <IntelRow
            label="Nearest vegetation"
            value={intel.nearestVegetation
              ? `${intel.nearestVegetation.name} · ${formatDistance(intel.nearestVegetation.distance_m)}`
              : 'None mapped'}
            isLight={isLight}
          />
          <IntelRow label="Roads (1 km)" value={`${intel.roads.length} mapped`} isLight={isLight} />
          <IntelRow label="Buildings (1 km)" value={`${intel.buildings.length} mapped`} isLight={isLight} />
          <IntelRow
            label="Populated places"
            value={`${intel.places.length} mapped`}
            isLight={isLight}
          />
          <IntelRow
            label="Nearest populated place"
            value={intel.nearestPlace
              ? `${intel.nearestPlace.name} · ${formatDistance(intel.nearestPlace.distance_m)}`
              : 'None mapped'}
            isLight={isLight}
          />
          <IntelRow
            label="Nearest mapped feature"
            value={intel.nearestFeature
              ? `"${intel.nearestFeature.name}" ${formatDistance(intel.nearestFeature.distance_m)}`
              : 'None mapped'}
            isLight={isLight}
          />
          <IntelRow label="GIS data source" value="OpenStreetMap / Overpass API" isLight={isLight} />
        </IntelSection>

        {/* 7. CONFIDENCE EXPLANATION */}
        <IntelSection title="Confidence explanation" icon={ShieldCheck} isLight={isLight}>
          <IntelRow
            label="Model confidence"
            value={event.confidence !== null ? `${event.confidence}%` : NA}
            valueColor="#10B981"
            isLight={isLight}
            mono
          />
          <IntelRow label="Confidence tier" value={intel.tier} isLight={isLight} />
          <IntelRow
            label="Pixel confidence (NASA)"
            value={pixelConfidenceLabel(raw.pixelConfidence)}
            isLight={isLight}
          />
          <IntelRow
            label="Repeat detection"
            value={raw.isPersistent ? 'Yes — persistent source' : 'No — single pass'}
            isLight={isLight}
          />
          <IntelNote isLight={isLight}>
            {raw.confidencePct !== null
              ? `A ${text(event.confidence)}% model probability indicates ${intel.tier.toLowerCase()} for the "${intel.classLabel}" label. Confidence reflects the statistical separation of this thermal signature, not a confirmed ground truth burn.`
              : 'No AI confidence score is stored for this detection, so the classification must be treated as provisional.'}
          </IntelNote>
        </IntelSection>

        {/* 8. RECOMMENDED VERIFICATION DETAILS */}
        <IntelSection title="Recommended verification details" icon={ListChecks} isLight={isLight}>
          <IntelRow
            label="Action required"
            value="Human analyst verification"
            valueColor="#EF4444"
            isLight={isLight}
          />
          <IntelNote isLight={isLight}>
            1. Cross-check the acquisition window against high-resolution optical imagery (Sentinel-2 / commercial).
          </IntelNote>
          <IntelNote isLight={isLight}>
            {intel.nearestIndustrial
              ? '2. Confirm the operating status, flaring schedule and permits of the nearest mapped industrial facility with the local authority.'
              : '2. Verify land-use records to establish whether the anomaly sits on industrial, agricultural or forest land.'}
          </IntelNote>
          <IntelNote isLight={isLight}>
            3. Inspect the exact coordinates on ground or by drone where accessible, and record the outcome as VERIFIED or DISMISSED.
          </IntelNote>
          <IntelNote isLight={isLight}>
            4. Escalate to the regional control room if the anomaly persists on the next satellite overpass.
          </IntelNote>
        </IntelSection>

        {onOpenFullInvestigation && (
          <button
            type="button"
            onClick={onOpenFullInvestigation}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '12px',
              padding: '6px 0 2px',
              background: 'none',
              border: 'none',
              color: accent,
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.03em',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <ExternalLink size={12} />
            <span>Open full investigation console</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default DeepEventIntelligence;

