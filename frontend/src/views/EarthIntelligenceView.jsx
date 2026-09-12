import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Globe,
  Radio,
  Target,
  Flame,
  Layers,
  Activity,
  Calendar,
  Clock,
  Satellite,
  Compass,
  Zap,
  ArrowUpRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Navigation,
  MapPin,
  ChevronRight,
  ShieldAlert,
  Trees,
  Factory,
  Building,
  Info,
  AlertCircle,
} from 'lucide-react';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { ClassBadge } from '../components/StatusBadge';

/**
 * Format detection timestamp strictly from the detection's actual data
 */
function formatDetectionDateTime(d) {
  if (!d) return 'N/A';

  const iso = d.timestamp || d.created_at;
  if (iso && !isNaN(Date.parse(iso))) {
    const dt = new Date(iso);
    const day = dt.getUTCDate();
    const month = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const year = dt.getUTCFullYear();
    const hours = String(dt.getUTCHours()).padStart(2, '0');
    const mins = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${mins} UTC`;
  }

  if (d.acq_date) {
    const dt = new Date(d.acq_date);
    const day = isNaN(dt.getTime()) ? d.acq_date : dt.getUTCDate();
    const month = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    const year = isNaN(dt.getTime()) ? '' : dt.getUTCFullYear();
    let timeStr = '00:00';
    if (d.acq_time !== undefined && d.acq_time !== null && String(d.acq_time).trim() !== '') {
      const raw = String(d.acq_time).trim();
      if (raw.includes(':')) {
        timeStr = raw;
      } else {
        const padded = raw.padStart(4, '0');
        timeStr = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
      }
    }
    return `${day} ${month} ${year}, ${timeStr} UTC`.trim();
  }

  return 'N/A';
}

/**
 * Determine risk level styling from alert_level and FRP
 */
function getRiskLevelInfo(d) {
  if (!d) {
    return {
      text: 'MONITORED',
      color: '#38BDF8',
      bg: 'rgba(56, 189, 248, 0.15)',
      border: 'rgba(56, 189, 248, 0.4)',
    };
  }

  const frp = parseFloat(d.frp || 0);
  const lvl = String(d.alert_level || '').toUpperCase();

  if (lvl === 'CRITICAL' || frp >= 80) {
    return {
      text: 'CRITICAL RISK',
      color: '#EF4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.4)',
    };
  }
  if (lvl === 'HIGH' || frp >= 40) {
    return {
      text: 'HIGH RISK',
      color: '#F97316',
      bg: 'rgba(249, 115, 22, 0.15)',
      border: 'rgba(249, 115, 22, 0.4)',
    };
  }
  if (lvl === 'MEDIUM' || frp >= 20) {
    return {
      text: 'MEDIUM RISK',
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.4)',
    };
  }
  return {
    text: 'LOW RISK',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
  };
}

// Spherical Haversine calculation in meters
function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Helper functions for popup display
function getCleanPopupSatellite(detection) {
  const raw = (detection?.satellite || detection?.source || '').toString().trim();
  const lower = raw.toLowerCase();
  if (lower.includes('terra')) return 'Terra';
  if (lower.includes('aqua')) return 'Aqua';
  if (lower.includes('s-npp') || lower.includes('snpp') || lower.includes('suomi')) return 'Suomi NPP';
  if (lower.includes('noaa-20') || lower.includes('noaa 20') || lower.includes('n20') || lower.includes('jpss-1')) return 'NOAA-20';
  if (lower.includes('noaa-21') || lower.includes('noaa 21') || lower.includes('n21') || lower.includes('jpss-2')) return 'NOAA-21';
  if (lower.includes('sentinel')) return 'Sentinel-3';
  if (raw && !lower.includes('sensor') && !lower.includes('nrt')) return raw;
  const inst = (detection?.instrument || '').toLowerCase();
  if (inst.includes('modis')) return 'Terra';
  return 'Terra';
}

function getCleanPopupSensor(detection) {
  const inst = (detection?.instrument || detection?.sensor || '').toString().trim();
  const lowerInst = inst.toLowerCase();
  if (lowerInst.includes('viirs')) return 'VIIRS';
  if (lowerInst.includes('modis')) return 'MODIS';
  if (lowerInst.includes('slstr')) return 'SLSTR';
  const rawSource = (detection?.satellite || detection?.source || '').toString().toLowerCase();
  if (rawSource.includes('viirs') || rawSource.includes('snpp') || rawSource.includes('noaa')) return 'VIIRS';
  if (rawSource.includes('modis') || rawSource.includes('terra') || rawSource.includes('aqua')) return 'MODIS';
  if (inst && !lowerInst.includes('sensor')) return inst;
  return 'VIIRS';
}

export function EarthIntelligenceView({
  detections = [],
  selectedDetection = null,
  onSelectDetection = () => {},
}) {
  // Earth visualization mode: 'thermal' for Blue Holographic Earth
  const [earthMode, setEarthMode] = useState('thermal');
  // Trigger timestamp to command 3D Earth to fly/rotate to exact coordinates
  const [focusTrigger, setFocusTrigger] = useState(null);

  // Multi-stage Deep Location Investigation state:
  // 'globe' (Stage 1: Space Orbit) | 'descending' (Stages 2-4: Multi-stage descent) | 'deep_satellite' (Stage 5: High-Res Real Satellite View)
  const [viewLevel, setViewLevel] = useState('globe');
  const [descentStage, setDescentStage] = useState(1);
  const descentTimerRef = useRef(null);

  // Active detection for telemetry readout: user selected or default to first detection
  const activeDetection = selectedDetection || (detections.length > 0 ? detections[0] : null);

  const riskInfo = getRiskLevelInfo(activeDetection);
  const formattedDateTime = formatDetectionDateTime(activeDetection);

  const latNum = activeDetection && !isNaN(parseFloat(activeDetection.latitude)) ? parseFloat(activeDetection.latitude) : null;
  const lonNum = activeDetection && !isNaN(parseFloat(activeDetection.longitude)) ? parseFloat(activeDetection.longitude) : null;

  const latDisplay = latNum !== null
    ? `${Math.abs(latNum).toFixed(4)}° ${latNum >= 0 ? 'N' : 'S'}`
    : 'N/A';

  const lonDisplay = lonNum !== null
    ? `${Math.abs(lonNum).toFixed(4)}° ${lonNum >= 0 ? 'E' : 'W'}`
    : 'N/A';

  const frpDisplay = activeDetection?.frp != null && !isNaN(parseFloat(activeDetection.frp))
    ? `${parseFloat(activeDetection.frp).toFixed(1)} MW`
    : 'N/A';

  const confDisplay = activeDetection?.prediction_confidence != null && !isNaN(parseFloat(activeDetection.prediction_confidence))
    ? `${(parseFloat(activeDetection.prediction_confidence) * 100).toFixed(1)}%`
    : activeDetection?.confidence != null && !isNaN(parseFloat(activeDetection.confidence))
    ? `${parseFloat(activeDetection.confidence).toFixed(1)}%`
    : (activeDetection?.confidence ? `${activeDetection.confidence}` : 'N/A');

  const satDisplay = activeDetection?.source || (activeDetection?.instrument ? activeDetection.instrument : 'N/A');

  // Popup dynamic information lines
  const popupFrp = activeDetection?.frp != null && !isNaN(parseFloat(activeDetection.frp))
    ? `${parseFloat(activeDetection.frp).toFixed(1)} MW`
    : 'N/A';

  const popupConfidence = activeDetection?.prediction_confidence != null && !isNaN(parseFloat(activeDetection.prediction_confidence))
    ? `${(parseFloat(activeDetection.prediction_confidence) * 100).toFixed(1)}%`
    : activeDetection?.confidence != null && !isNaN(parseFloat(activeDetection.confidence))
    ? `${parseFloat(activeDetection.confidence).toFixed(1)}%`
    : (activeDetection?.confidence ? `${activeDetection.confidence}` : 'N/A');

  const popupSatellite = activeDetection ? getCleanPopupSatellite(activeDetection) : 'N/A';
  const popupSensor = activeDetection ? getCleanPopupSensor(activeDetection) : 'N/A';

  // Deep Satellite Leaflet Map References
  const satelliteMapContainerRef = useRef(null);
  const satelliteMapInstanceRef = useRef(null);
  const satelliteDetectionLayerRef = useRef(null);
  const satelliteContextLayerRef = useRef(null);
  const satelliteRadiusRef = useRef(null);

  // Local context state
  const [localFeatures, setLocalFeatures] = useState([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  // Query Real OpenStreetMap Features when in Deep View
  const fetchLocalOsmContext = useCallback(async (lat, lon) => {
    if (isNaN(lat) || isNaN(lon)) return;
    setIsLoadingContext(true);
    setLocalFeatures([]);

    const query = `[out:json][timeout:10];
(
  nwr["landuse"="industrial"](around:1000,${lat},${lon});
  nwr["man_made"="works"](around:1000,${lat},${lon});
  nwr["industrial"](around:1000,${lat},${lon});
  nwr["building"](around:1000,${lat},${lon});
  nwr["highway"~"primary|secondary|tertiary|trunk|motorway|residential"](around:1000,${lat},${lon});
  nwr["landuse"~"forest|wood"](around:1000,${lat},${lon});
  nwr["natural"~"wood|scrub"](around:1000,${lat},${lon});
  nwr["place"~"city|town|village|suburb"](around:3000,${lat},${lon});
);
out center 25;`;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });

      if (response.ok) {
        const data = await response.json();
        const elements = data.elements || [];
        const parsed = [];

        for (const el of elements) {
          const clat = el.lat || (el.center && el.center.lat);
          const clon = el.lon || (el.center && el.center.lon);
          if (!clat || !clon) continue;

          const dist = calculateHaversineMeters(lat, lon, clat, clon);
          const tags = el.tags || {};
          let cat = 'other';

          if (
            tags.landuse === 'industrial' ||
            tags.man_made === 'works' ||
            tags.industrial
          ) {
            cat = 'industrial';
          } else if (tags.building) {
            cat = 'building';
          } else if (tags.highway) {
            cat = 'road';
          } else if (tags.landuse === 'forest' || tags.natural === 'wood' || tags.natural === 'scrub') {
            cat = 'vegetation';
          } else if (tags.place) {
            cat = 'place';
          }

          const rawName =
            tags.name ||
            tags['name:en'] ||
            tags.highway ||
            (tags.building !== 'yes' ? tags.building : null) ||
            tags.place;

          const name = rawName
            ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
            : cat === 'industrial'
            ? 'Industrial Facility'
            : cat === 'road'
            ? 'Road'
            : cat === 'building'
            ? 'Building'
            : 'Mapped Feature';

          parsed.push({
            id: el.id,
            category: cat,
            name,
            distance_m: dist,
            lat: clat,
            lon: clon,
          });
        }

        parsed.sort((a, b) => a.distance_m - b.distance_m);
        setLocalFeatures(parsed);
      }
    } catch (err) {
      console.warn('OSM context query error:', err);
    } finally {
      setIsLoadingContext(false);
    }
  }, []);

  // Initialize or update Deep Satellite Leaflet Map when Stage 5 is reached
  useEffect(() => {
    if (viewLevel !== 'deep_satellite' || !satelliteMapContainerRef.current) return;

    if (!satelliteMapInstanceRef.current) {
      const map = L.map(satelliteMapContainerRef.current, {
        center: [latNum, lonNum],
        zoom: 15,
        zoomControl: true,
      });

      const esriSat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri Imagery &bull; Maxar', maxZoom: 18 }
      );

      const osm = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{y}.png',
        { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
      );

      const darkCanvas = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri Dark Canvas', maxZoom: 16 }
      );

      // Default to high-res Satellite Imagery
      esriSat.addTo(map);

      L.control
        .layers(
          {
            'Satellite Imagery (Esri)': esriSat,
            'Street Map (OSM)': osm,
            'Dark Canvas': darkCanvas,
          },
          null,
          { position: 'topright' }
        )
        .addTo(map);

      const detectionGroup = L.layerGroup().addTo(map);
      const contextGroup = L.layerGroup().addTo(map);

      satelliteDetectionLayerRef.current = detectionGroup;
      satelliteContextLayerRef.current = contextGroup;
      satelliteMapInstanceRef.current = map;
    } else {
      satelliteMapInstanceRef.current.setView([latNum, lonNum], 15, { animate: true });
    }

    // Refresh layers
    const map = satelliteMapInstanceRef.current;
    const detectionGroup = satelliteDetectionLayerRef.current;
    const contextGroup = satelliteContextLayerRef.current;

    detectionGroup.clearLayers();
    contextGroup.clearLayers();

    if (satelliteRadiusRef.current) {
      map.removeLayer(satelliteRadiusRef.current);
    }

    // Draw 1 km investigation perimeter circle
    const circle = L.circle([latNum, lonNum], {
      radius: 1000,
      color: '#38BDF8',
      weight: 1.5,
      dashArray: '5, 5',
      fillColor: '#38BDF8',
      fillOpacity: 0.05,
    }).addTo(map);
    satelliteRadiusRef.current = circle;

    // Thermal detection marker (Visually Dominant)
    const marker = L.circleMarker([latNum, lonNum], {
      radius: 13,
      color: '#38BDF8',
      weight: 3,
      fillColor: '#EF4444',
      fillOpacity: 0.95,
    });

    marker.bindPopup(`
      <div style="font-family: var(--font-sans); color: #07111F; min-width: 220px;">
        <div style="display: flex; alignItems: center; gap: 6px; font-weight: 800; font-size: 13px; color: #DC2626; margin-bottom: 4px;">
          <span>🔥</span>
          <span>${activeDetection?.predicted_class || 'Thermal Detection'}</span>
        </div>
        <div style="font-size: 11px; margin-bottom: 6px; color: #475569;">
          <strong>Exact Location:</strong> ${latNum.toFixed(5)}°, ${lonNum.toFixed(5)}°
        </div>
        <div style="font-size: 11px; margin-bottom: 3px; color: #475569;">
          <strong>FRP:</strong> ${popupFrp}
        </div>
        <div style="font-size: 11px; margin-bottom: 3px; color: #475569;">
          <strong>Confidence:</strong> ${popupConfidence}
        </div>
        <div style="font-size: 11px; margin-bottom: 3px; color: #475569;">
          <strong>Satellite:</strong> ${popupSatellite}
        </div>
        <div style="font-size: 11px; margin-bottom: 3px; color: #475569;">
          <strong>Sensor:</strong> ${popupSensor}
        </div>
        <div style="font-size: 10.5px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #E2E8F0; color: #EF4444; font-weight: 700;">
          Requires Ground Verification
        </div>
      </div>
    `);

    marker.addTo(detectionGroup);
    marker.openPopup();

    // Query OSM Context
    fetchLocalOsmContext(latNum, lonNum);

    return () => {
      // Clean up on component unmount
    };
  }, [viewLevel, latNum, lonNum, activeDetection, frpDisplay, confDisplay, satDisplay, popupFrp, popupConfidence, popupSatellite, popupSensor, fetchLocalOsmContext]);

  // Update context markers on deep satellite map
  useEffect(() => {
    if (!satelliteContextLayerRef.current || viewLevel !== 'deep_satellite') return;
    const contextGroup = satelliteContextLayerRef.current;
    contextGroup.clearLayers();

    localFeatures.forEach((feat) => {
      const color =
        feat.category === 'industrial'
          ? '#A855F7'
          : feat.category === 'road'
          ? '#60A5FA'
          : feat.category === 'building'
          ? '#94A3B8'
          : feat.category === 'vegetation'
          ? '#10B981'
          : '#F59E0B';

      const cMarker = L.circleMarker([feat.lat, feat.lon], {
        radius: feat.category === 'industrial' ? 7 : 5,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.7,
      });

      cMarker.bindPopup(`
        <div style="font-family: var(--font-sans); color: #07111F; min-width: 170px;">
          <div style="font-size: 12px; font-weight: 700; color: #0F172A; margin-bottom: 3px;">${feat.name}</div>
          <div style="font-size: 11px; color: #475569;">
            <strong>Category:</strong> ${feat.category.toUpperCase()}
          </div>
          <div style="font-size: 11px; color: #2563EB; margin-top: 2px;">
            ${feat.distance_m} m from thermal anomaly
          </div>
        </div>
      `);

      cMarker.addTo(contextGroup);
    });
  }, [localFeatures, viewLevel]);

  // Handle Multi-Stage Smooth Camera Zoom (Space -> Earth -> Deep Satellite View)
  const handleFocusOnLocation = () => {
    if (!activeDetection) return;

    onSelectDetection(activeDetection);
    setFocusTrigger(Date.now());

    // Clear any previous transition timer
    if (descentTimerRef.current) clearTimeout(descentTimerRef.current);

    // Multi-stage camera descent orchestrator
    setViewLevel('descending');
    setDescentStage(1);

    // Stage 2: Continental view (400ms)
    setTimeout(() => {
      setDescentStage(2);
    }, 450);

    // Stage 3: Country / Regional view (900ms)
    setTimeout(() => {
      setDescentStage(3);
    }, 950);

    // Stage 4: Local geographic view (1400ms)
    setTimeout(() => {
      setDescentStage(4);
    }, 1450);

    // Stage 5: Exact detection location with real high-res satellite imagery (2000ms)
    descentTimerRef.current = setTimeout(() => {
      setDescentStage(5);
      setViewLevel('deep_satellite');
    }, 2000);
  };

  // Return to 3D Globe from Deep Satellite view
  const handleReturnToGlobe = () => {
    if (descentTimerRef.current) clearTimeout(descentTimerRef.current);
    setViewLevel('globe');
    setDescentStage(1);
    if (satelliteMapInstanceRef.current) {
      satelliteMapInstanceRef.current.remove();
      satelliteMapInstanceRef.current = null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 120px)' }}>
      {/* Top Header Identity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} style={{ color: '#38BDF8' }} />
            <span>EARTH INTELLIGENCE: DEEP LOCATION ZOOM</span>
            <span style={{ fontSize: '10px', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              Space to Ground Investigation
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ice-blue)', marginTop: '2px', fontWeight: 500 }}>
            "Travel from space orbit to the exact detected coordinates with real satellite imagery."
          </div>
        </div>

        {/* Descent Stage Breadcrumb HUD */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(11, 23, 38, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '11px',
            color: '#38BDF8',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: viewLevel === 'deep_satellite' ? '#10B981' : '#38BDF8',
              boxShadow: viewLevel === 'deep_satellite' ? '0 0 10px #10B981' : '0 0 8px #38BDF8',
            }}
          />
          <span>
            ALTITUDE:{' '}
            <strong style={{ color: '#FFFFFF' }}>
              {viewLevel === 'globe'
                ? '36,000 km (Global Orbit)'
                : descentStage === 2
                ? '2,500 km (Continental Approach)'
                : descentStage === 3
                ? '500 km (Regional Scan)'
                : descentStage === 4
                ? '50 km (Local Atmospheric Entry)'
                : '1 km (Surface Satellite Resolution)'}
            </strong>
          </span>

          {viewLevel === 'deep_satellite' && (
            <button
              onClick={handleReturnToGlobe}
              className="btn-secondary"
              style={{
                marginLeft: '6px',
                padding: '3px 8px',
                fontSize: '10px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38BDF8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              <RotateCcw size={10} />
              <span>Return to 3D Globe</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Structure */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.48fr) minmax(320px, 360px)',
          gap: '20px',
          flex: 1,
          minHeight: '620px',
          alignItems: 'stretch',
        }}
      >
        {/* ======================================================== */}
        {/* LEFT COLUMN: 3D EARTH / DEEP SATELLITE VIEWPORT          */}
        {/* ======================================================== */}
        <div
          style={{
            position: 'relative',
            background: 'radial-gradient(circle at center, #0B1726 0%, #030712 100%)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Viewport 1: 3D Globe (Active during Stage 1-4) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: viewLevel === 'deep_satellite' ? 'none' : 'block',
              transition: 'opacity 0.6s ease',
            }}
          >
            <EarthGlobe3D
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={onSelectDetection}
              initialMode={earthMode}
              hideSidePanel={true}
              hideModeSelector={true}
              hideFloatingFeed={true}
              isEarthIntelligence={true}
              focusTrigger={focusTrigger}
            />

            {/* Empty State when zero detections available */}
            {detections.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 25,
                  background: 'rgba(11, 23, 38, 0.92)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                  maxWidth: '90%',
                }}
              >
                <AlertCircle size={18} style={{ color: '#38BDF8', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>
                    No real thermal detections available.
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Connect NASA FIRMS or upload satellite observation files to begin analysis.
                  </div>
                </div>
              </div>
            )}

            {/* Descent Telemetry Overlay during Animation */}
            {viewLevel === 'descending' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at center, rgba(56, 189, 248, 0.05) 0%, rgba(3, 7, 18, 0.75) 100%)',
                  zIndex: 25,
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    padding: '16px 28px',
                    background: 'rgba(11, 23, 38, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid #38BDF8',
                    borderRadius: '12px',
                    boxShadow: '0 0 30px rgba(56, 189, 248, 0.35)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#38BDF8', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    TRAVELLING FROM SPACE TO SURFACE
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', marginTop: '6px' }}>
                    {descentStage === 1 && 'STAGE 1: SPACE ORBIT ACQUISITION'}
                    {descentStage === 2 && 'STAGE 2: CONTINENTAL VECTOR APPROACH'}
                    {descentStage === 3 && 'STAGE 3: REGIONAL SCAN & THERMAL LOCK'}
                    {descentStage === 4 && 'STAGE 4: LOCAL GEOGRAPHIC DESCENT'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#BAE6FD', fontFamily: 'monospace', marginTop: '4px' }}>
                    Target: {latNum.toFixed(4)}° N, {lonNum.toFixed(4)}° E
                  </div>
                  {/* Progress Bar */}
                  <div style={{ width: '220px', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', margin: '12px auto 0', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(descentStage / 5) * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #38BDF8 0%, #10B981 100%)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Lower-left Live Feed Box */}
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                zIndex: 15,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'rgba(11, 23, 38, 0.92)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
                  width: '185px',
                  pointerEvents: 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.06em' }}>
                    <Radio size={12} style={{ color: '#38BDF8' }} />
                    <span>LIVE FEED</span>
                  </div>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#10B981',
                      boxShadow: '0 0 6px #10B981',
                    }}
                  />
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '62px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #030712 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="100%" height="100%" viewBox="0 0 180 62" fill="none">
                    <line x1="0" y1="31" x2="180" y2="31" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                    <line x1="90" y1="0" x2="90" y2="62" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                    <circle cx="90" cy="31" r="22" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" strokeDasharray="2 2" />
                    <circle cx="86" cy="28" r="14" fill="#EF4444" opacity="0.35" filter="blur(4px)" />
                    <circle cx="88" cy="30" r="7" fill="#F97316" opacity="0.75" />
                    <circle cx="90" cy="31" r="2.5" fill="#FFFFFF" />
                  </svg>
                  <span style={{ position: 'absolute', bottom: 3, right: 6, fontSize: '8.5px', color: '#38BDF8', fontFamily: 'monospace' }}>
                    IR-375m
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF' }}>
                    {activeDetection ? `${satDisplay} (${activeDetection.instrument || 'Sensor'})` : 'No active detection'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#94A3B8', fontFamily: 'monospace' }}>
                    {activeDetection ? (activeDetection.acq_date ? `${activeDetection.acq_date} ${activeDetection.acq_time || ''} UTC` : 'Real Observation') : 'Awaiting real data'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Viewport 2: Real High-Resolution Satellite Map (Stage 5 Deep View) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: viewLevel === 'deep_satellite' ? 'block' : 'none',
              zIndex: 20,
            }}
          >
            <div ref={satelliteMapContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* Deep View Controls Bar at Top */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(11, 23, 38, 0.92)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                padding: '8px 12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}
            >
              <button
                onClick={handleReturnToGlobe}
                className="btn-primary"
                style={{
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  gap: '6px',
                  background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                }}
              >
                <Globe size={13} />
                <span>Return to 3D Globe</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.15)' }} />

              <span style={{ fontSize: '11px', color: '#FFFFFF', fontWeight: 600 }}>
                High-Resolution Satellite Layer &bull; 1 km Perimeter
              </span>
            </div>

            {/* Real GIS Nearby Context Overlay at Bottom Right */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                zIndex: 1000,
                background: 'rgba(11, 23, 38, 0.94)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                maxWidth: '260px',
                maxHeight: '200px',
                overflowY: 'auto',
                fontSize: '11px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.65)',
              }}
            >
              <div style={{ fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Compass size={13} style={{ color: '#38BDF8' }} />
                <span>LOCAL GIS CONTEXT (OSM)</span>
              </div>
              {isLoadingContext ? (
                <div style={{ color: '#94A3B8', fontSize: '10.5px' }}>Querying surrounding features...</div>
              ) : localFeatures.length === 0 ? (
                <div style={{ color: '#94A3B8', fontSize: '10.5px' }}>
                  No mapped industrial/road features within 1 km.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {localFeatures.slice(0, 5).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#E2E8F0', fontSize: '10.5px' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                        {f.category === 'industrial' ? '🏭' : f.category === 'road' ? '🛣️' : f.category === 'building' ? '🏢' : '🌳'} {f.name}
                      </span>
                      <span style={{ color: '#38BDF8', fontFamily: 'monospace' }}>{f.distance_m}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: SELECTED DETECTION TELEMETRY PANEL         */}
        {/* ======================================================== */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(11, 23, 38, 0.95) 0%, rgba(15, 32, 50, 0.90) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(56, 189, 248, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={16} style={{ color: '#38BDF8' }} />
              <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em', color: '#FFFFFF', textTransform: 'uppercase' }}>
                Selected Detection
              </span>
            </div>

            {activeDetection && (
              <span style={{ fontSize: '11px', color: '#38BDF8', fontFamily: 'monospace', fontWeight: 700 }}>
                #{activeDetection.id}
              </span>
            )}
          </div>

          <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              {/* Tactical Detection Image / Preview */}
              <div
                style={{
                  width: '100%',
                  height: '100px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                <svg width="100%" height="100%" viewBox="0 0 280 100" fill="none">
                  <line x1="0" y1="50" x2="280" y2="50" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" />
                  <line x1="140" y1="0" x2="140" y2="100" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1" />
                  <circle cx="140" cy="50" r="34" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="140" cy="50" r="16" stroke="rgba(56, 189, 248, 0.45)" strokeWidth="1" />
                  <circle cx="140" cy="50" r="20" fill="#EF4444" opacity="0.32" filter="blur(6px)" />
                  <circle cx="140" cy="50" r="10" fill="#F97316" opacity="0.7" />
                  <circle cx="140" cy="50" r="3.5" fill="#FFFFFF" />
                  <path d="M 120 40 L 120 34 L 126 34" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 160 40 L 160 34 L 154 34" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 120 60 L 120 66 L 126 66" stroke="#38BDF8" strokeWidth="1.5" />
                  <path d="M 160 60 L 160 66 L 154 66" stroke="#38BDF8" strokeWidth="1.5" />
                </svg>

                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 8,
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#38BDF8',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Flame size={10} style={{ color: '#EF4444' }} />
                  <span>Thermal Signature Lock</span>
                </div>

                <div
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 8,
                    fontSize: '9.5px',
                    fontFamily: 'monospace',
                    color: '#94A3B8',
                  }}
                >
                  {latDisplay}, {lonDisplay}
                </div>
              </div>

              {/* Classification & Risk Level */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <ClassBadge predictedClass={activeDetection?.predicted_class || 'Other'} />
                </div>

                <div style={{ marginTop: '6px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      color: riskInfo.color,
                      background: riskInfo.bg,
                      border: `1px solid ${riskInfo.border}`,
                      textTransform: 'uppercase',
                    }}
                  >
                    {riskInfo.text}
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  padding: '12px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(56, 189, 248, 0.16)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Confidence</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#38BDF8', marginTop: '2px' }}>
                    {confDisplay}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>FRP</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }}>
                    {frpDisplay}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Latitude</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                    {latDisplay}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Longitude</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                    {lonDisplay}
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Satellite &amp; Instrument</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Satellite size={13} style={{ color: '#38BDF8' }} />
                    <span>{satDisplay} ({activeDetection?.instrument || 'VIIRS'})</span>
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Acquisition Time</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} style={{ color: '#10B981' }} />
                    <span style={{ fontFamily: 'monospace' }}>{formattedDateTime}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button: Focus on Location (Deep Descent) */}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleFocusOnLocation}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                  boxShadow: '0 4px 18px rgba(2, 132, 199, 0.45)',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                title="Perform multi-stage zoom from space down to real satellite imagery"
              >
                <Target size={16} />
                <span>Focus on Location (Deep Zoom)</span>
              </button>

              <div style={{ fontSize: '10.5px', color: '#94A3B8', textAlign: 'center', lineHeight: 1.4 }}>
                Animates from Global Earth &rarr; Continental &rarr; Regional &rarr; Deep Satellite View.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
