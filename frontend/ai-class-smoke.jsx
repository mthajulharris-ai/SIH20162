// Temporary verification for the Overview AI CLASSIFICATION banner removal.
const noop = () => {};
const fakeEl = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, appendChild: noop, addEventListener: noop, removeEventListener: noop, querySelector: () => null });

globalThis.__theme = 'light';
globalThis.localStorage = { getItem: (k) => (k === 'satra_theme' ? globalThis.__theme : null), setItem: noop, removeItem: noop };
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node', platform: 'Win32', language: 'en', languages: ['en'], vendor: '' },
    configurable: true,
    writable: true,
  });
} catch (e) { /* ignore */ }
globalThis.window = {
  navigator: globalThis.navigator,
  location: { hash: '#/overview', href: 'http://localhost:5173/#/overview' },
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  addEventListener: noop, removeEventListener: noop,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '' }), setTimeout, clearTimeout,
};
globalThis.document = {
  documentElement: fakeEl(), body: fakeEl(), createElement: fakeEl, createElementNS: fakeEl,
  querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, getElementById: () => null,
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ThemeProvider } = await import('./src/context/ThemeContext');
const { OverviewView } = await import('./src/views/OverviewView');
const { SatelliteDataView } = await import('./src/views/SatelliteDataView');
const { AiClassificationSection } = await import('./src/components/AiClassificationSection');

const detections = [
  { id: 'a1', predicted_class: 'Other', prediction_confidence: 0.66, latitude: 22.1, longitude: 78.2, frp: 1.2, acq_date: '2026-09-18', acq_time: '1242', source: 'VIIRS_SNPP_NRT' },
  { id: 'a2', predicted_class: 'Other', prediction_confidence: 0.61, latitude: 22.2, longitude: 78.3, frp: 0.9, acq_date: '2026-09-18', acq_time: '1242', source: 'VIIRS_SNPP_NRT' },
  { id: 'a3', predicted_class: 'Other', prediction_confidence: 0.7, latitude: 22.3, longitude: 78.4, frp: 1.1, acq_date: '2026-09-18', acq_time: '1242', source: 'VIIRS_SNPP_NRT' },
  { id: 'b1', predicted_class: 'industrial_fire', prediction_confidence: 0.82, latitude: 23.1, longitude: 82.3, frp: 12.4, acq_date: '2026-09-18', acq_time: '1242', source: 'VIIRS_SNPP_NRT' },
  { id: 'c1', predicted_class: 'wildfire', prediction_confidence: 0.71, latitude: 24.1, longitude: 79.3, frp: 8.4, acq_date: '2026-09-18', acq_time: '1242', source: 'MODIS_NRT' },
  { id: 'd1', predicted_class: 'persistent_thermal_source', prediction_confidence: 0.77, latitude: 25.1, longitude: 81.3, frp: 5.4, acq_date: '2026-09-18', acq_time: '1242', source: 'VIIRS_SNPP_NRT' },
];
const analytics = { total_detections: 6, high_confidence_percentage: 0.66, class_distribution: {} };
const wrap = (node) => React.createElement(ThemeProvider, null, node);

const overviewHtml = renderToStaticMarkup(wrap(React.createElement(OverviewView, {
  analytics, detections, recentAlerts: [], onNavigate: noop, onUpdateAlertStatus: noop,
  onFocusDetection: noop, selectedDetection: null, onSelectDetection: noop,
  onOpenUploadModal: noop, onOpenAiAssistant: noop, connectionStatus: 'online', isBackendHealthy: true,
})));

const analysisResult = { all_detections: detections, total_records: detections.length, prediction: { confidence: 0.66, alert_level: 'HIGH' } };
const satelliteHtml = renderToStaticMarkup(wrap(React.createElement(SatelliteDataView, {
  detections, isBackendHealthy: true, connectionStatus: 'online', onRefresh: noop, onNavigate: noop,
  onFocusDetection: noop, onSelectDetection: noop, onAnalysisSuccess: noop, onOpenUploadModal: noop,
})));

// Default usage (Satellite Data / Upload & Analyze path) keeps the banner.
const defaultHtml = renderToStaticMarkup(wrap(React.createElement(AiClassificationSection, { detections, analytics })));
const analysisHtml = renderToStaticMarkup(wrap(React.createElement(AiClassificationSection, { analysisResult })));

const count = (haystack, needle) => haystack.split(needle).length - 1;

const checks = [
  ['Overview: no "DOMINANT CLASSIFICATION" text', !overviewHtml.includes('DOMINANT CLASSIFICATION')],
  ['Overview: no dominant-classification wording at all', !overviewHtml.toLowerCase().includes('dominant classification')],
  ['Overview: AI CLASSIFICATION heading kept', overviewHtml.includes('AI CLASSIFICATION')],
  ['Overview: observation count kept', overviewHtml.includes('observations')],
  ['Overview: model label kept', overviewHtml.includes('RF + LightGBM + XGBoost Soft Voting')],
  ['Overview: card 1 Industrial Fire', overviewHtml.includes('Industrial Fire')],
  ['Overview: card 2 Forest Fire', overviewHtml.includes('Forest Fire')],
  ['Overview: card 3 Persistent Thermal Source', overviewHtml.includes('Persistent Thermal Source')],
  ['Overview: card 4 "Other" present exactly once', count(overviewHtml, '>Other<') === 1],
  ['Overview: four cards in one desktop row', overviewHtml.includes('repeat(4, minmax(0, 1fr))')],
  ['Overview: Other card shows its own count/percent in the card', overviewHtml.includes('66%')],
  ['Overview: other sections untouched (Upload/System Status/Quick Access)', overviewHtml.includes('Upload & Analyze') && overviewHtml.includes('System Status') && overviewHtml.includes('Quick Access')],
  ['Overview: no stray confidence/alert capsule above the cards', !overviewHtml.includes('Confidence:')],
  ['Default usage (Upload & Analyze / Satellite Data) keeps banner', defaultHtml.includes('DOMINANT CLASSIFICATION')],
  ['Analysis-result usage keeps banner', analysisHtml.includes('DOMINANT CLASSIFICATION')],
  ['Satellite Data page still renders and keeps banner', satelliteHtml.length > 5000 && satelliteHtml.includes('DOMINANT CLASSIFICATION')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) { console.log(`PASS: ${name}`); } else { failed += 1; console.log(`FAIL: ${name}`); }
}
console.log(failed === 0 ? `ALL ${checks.length} AI CLASSIFICATION CHECKS PASSED` : `${failed} / ${checks.length} CHECKS FAILED`);
console.log('Other-card occurrences in Overview markup:', count(overviewHtml, '>Other<'));

