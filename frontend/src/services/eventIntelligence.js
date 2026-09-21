/**
 * SATRA — Deep Event Intelligence event-model derivation.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the "Deep Event Intel" figures
 * shown across the application:
 *   - InvestigateView  (full Deep Thermal Event Intelligence console)
 *   - DeepEventIntelligence (collapsible accordion inside the GIS Investigation
 *     "EXACT DETECTION LOCATION" card)
 *
 * Both surfaces call `buildEventIntelligence()` so the event intelligence data
 * is never duplicated or allowed to drift apart.
 *
 * `applyReferenceDefaults: true` (default) reproduces the historical
 * InvestigateView behaviour, where a demo reference event (#SAT-20481) is used
 * when a field is missing. The GIS accordion passes `false` so it always shows
 * the real satellite record (and "N/A" when a field is genuinely absent).
 */

// Reference/demo event used by the full investigation console when no
// real detection (or no value for a field) is available.
export const EVENT_INTELLIGENCE_REFERENCE = {
  id: 'SAT-20481',
  latitude: 11.0168,
  longitude: 76.9558,
  temperature: '68.4',
  confidence: '94.7',
  frp: '46.2',
  source: 'Satellite Thermal Imaging (VIIRS / INSAT-3DR)',
  satellite: 'INSAT-3DR / Sentinel-3 SLSTR',
  detected: '18 Sep 2026 — 12:42 PM',
  locationLowLat: 'Coimbatore, Tamil Nadu',
  locationHighLat: 'Hazira Industrial Belt, Gujarat',
};

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * VIIRS/MODIS brightness temperatures are delivered in Kelvin (> 200 K),
 * while some ingestion paths already carry degrees Celsius.
 */
function brightnessToCelsius(brightness) {
  const kelvin = toNumber(brightness);
  if (kelvin === null) return null;
  return kelvin > 200 ? kelvin - 273.15 : kelvin;
}

/**
 * Builds the canonical Deep Event Intelligence model for a detection.
 *
 * @param {object|null} selectedDetection Raw detection record (NASA FIRMS / SATRA)
 * @param {{ applyReferenceDefaults?: boolean }} options
 */
export function buildEventIntelligence(selectedDetection, options = {}) {
  const { applyReferenceDefaults = true } = options;
  const detection = selectedDetection || null;
  const reference = EVENT_INTELLIGENCE_REFERENCE;

  // ---------------------------------------------------------------- location
  const latValue = detection ? toNumber(detection.latitude) : null;
  const lonValue = detection ? toNumber(detection.longitude) : null;
  const latNumber = latValue !== null ? latValue : applyReferenceDefaults ? reference.latitude : null;
  const lonNumber = lonValue !== null ? lonValue : applyReferenceDefaults ? reference.longitude : null;

  // ----------------------------------------------------------------- thermal
  const brightnessCelsius = detection ? brightnessToCelsius(detection.brightness) : null;
  const frpMw = detection && detection.frp ? toNumber(detection.frp) : null;
  const predictionConfidence =
    detection && detection.prediction_confidence ? toNumber(detection.prediction_confidence) : null;
  const confidencePct = predictionConfidence !== null ? predictionConfidence * 100 : null;

  const raw = {
    id: detection ? detection.id : null,
    source: detection ? toText(detection.source) : null,
    instrument: detection ? toText(detection.instrument) : null,
    latitude: latNumber,
    longitude: lonNumber,
    acqDate: detection ? toText(detection.acq_date) : null,
    acqTime: detection ? toText(detection.acq_time) : null,
    observedAt: detection ? toText(detection.observed_at) : null,
    brightnessKelvin: detection ? toNumber(detection.brightness) : null,
    brightnessCelsius,
    frpMw,
    pixelConfidence: detection ? toText(detection.confidence) : null,
    predictionConfidence,
    confidencePct,
    predictedClass: detection ? toText(detection.predicted_class) : null,
    isPersistent: detection ? detection.is_persistent === true : false,
    modelVersion: detection ? toText(detection.model_version) : null,
    dataProvenance: detection ? toText(detection.data_provenance) : null,
    alertLevel: detection ? toText(detection.alert_level || detection.risk_level) : null,
    riskScore: detection ? toNumber(detection.risk_score) : null,
    daynight: detection ? toText(detection.daynight) : null,
    scan: detection ? toNumber(detection.scan) : null,
    track: detection ? toNumber(detection.track) : null,
    sourceFile: detection ? toText(detection.source_file) : null,
  };

  const eventId = detection && detection.id
    ? String(detection.id).startsWith('SAT-')
      ? String(detection.id)
      : `SAT-${detection.id}`
    : applyReferenceDefaults
      ? reference.id
      : null;

  const locationName = detection && detection.location_name
    ? detection.location_name
    : applyReferenceDefaults
      ? latNumber !== null && latNumber > 20
        ? reference.locationHighLat
        : reference.locationLowLat
      : null;

  const riskSource = detection ? detection.alert_level || detection.risk_level : null;

  return {
    hasDetection: !!detection,
    id: eventId,
    locationName,
    status: 'ACTIVE',
    risk: riskSource
      ? String(riskSource).toUpperCase()
      : applyReferenceDefaults
        ? 'HIGH'
        : null,
    detected: detection && detection.acq_date
      ? `${detection.acq_date} — ${detection.acq_time || '12:42 PM'} UTC`
      : applyReferenceDefaults
        ? reference.detected
        : null,
    lat: latNumber !== null ? latNumber.toFixed(4) : null,
    lon: lonNumber !== null ? lonNumber.toFixed(4) : null,
    temp: brightnessCelsius !== null
      ? brightnessCelsius.toFixed(1)
      : applyReferenceDefaults
        ? reference.temperature
        : null,
    confidence: confidencePct !== null
      ? confidencePct.toFixed(1)
      : applyReferenceDefaults
        ? reference.confidence
        : null,
    source: detection && detection.source
      ? `${detection.source} Thermal Imaging`
      : applyReferenceDefaults
        ? reference.source
        : null,
    satellite: detection && detection.source
      ? detection.source
      : applyReferenceDefaults
        ? reference.satellite
        : null,
    frp: frpMw !== null
      ? frpMw.toFixed(1)
      : applyReferenceDefaults
        ? reference.frp
        : null,
    raw,
  };
}
