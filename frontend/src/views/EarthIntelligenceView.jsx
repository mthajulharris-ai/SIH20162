// Haversine geodesic distance calculation between two points in meters (Client-side, Section 7)
function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Globe,
  Crosshair,
  Flame,
  Trees,
  Factory,
  Target,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  MapPin,
  Sparkles,
  Radio,
  Copy,
  Check,
  Compass,
  Layers,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Navigation,
  Eye,
  RefreshCw,
} from 'lucide-react';

import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { ClassBadge, ProvenanceBadge, StatusBadge } from '../components/StatusBadge';
import { getSatelliteStatus, getNearbyGis } from '../services/api';
import { useTheme } from '../context/ThemeContext';

/**
 * SATRA 4-Class Classification Taxonomy & Color Palettes
 * Strictly:
 *   Industrial Fire           -> Red (#EF4444)
 *   Forest Fire               -> Green (#10B981)
 *   Persistent Thermal Source -> Purple (#A855F7)
 *   Other                     -> Yellow (#FACC15)
 */
const TAXONOMY = {
  industrial: {
    key: 'industrial',
    label: 'Industrial Fire',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: Flame,
  },
  forest: {
    key: 'forest',
    label: 'Forest Fire',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
    icon: Trees,
  },
  persistent: {
    key: 'persistent',
    label: 'Persistent Thermal Source',
    color: '#A855F7',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.4)',
    icon: Factory,
  },
  other: {
    key: 'other',
    label: 'Other',
    color: '#FACC15',
    bg: 'rgba(250, 204, 21, 0.15)',
    border: 'rgba(250, 204, 21, 0.4)',
    icon: Target,
  },
};

function normalizeClassKey(cls) {
  const c = (cls || '').toLowerCase();
  if (c.includes('industrial')) return 'industrial';
  if (c.includes('forest') || c.includes('wildfire') || c.includes('vegetation') || c.includes('bushfire')) {
    return 'forest';
  }
  if (c.includes('persistent') || c.includes('flare')) return 'persistent';
  return 'other';
}

/**
 * Great-circle Haversine distance in meters
 */
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

/**
 * Dynamically resolves continent from coordinates and country name
 */
function getContinent(lat, lon, country = '') {
  const c = (country || '').toLowerCase();
  if (
    c.includes('india') ||
    c.includes('china') ||
    c.includes('japan') ||
    c.includes('indonesia') ||
    c.includes('vietnam') ||
    c.includes('pakistan') ||
    c.includes('bangladesh') ||
    c.includes('saudi') ||
    c.includes('uae') ||
    c.includes('korea') ||
    c.includes('thailand') ||
    c.includes('iran') ||
    c.includes('iraq') ||
    c.includes('turkey') ||
    c.includes('russia') ||
    c.includes('singapore') ||
    c.includes('malaysia')
  ) {
    return 'Asia';
  }
  if (c.includes('united states') || c.includes('canada') || c.includes('mexico')) return 'North America';
  if (c.includes('brazil') || c.includes('argentina') || c.includes('chile') || c.includes('colombia') || c.includes('peru')) return 'South America';
  if (c.includes('france') || c.includes('germany') || c.includes('united kingdom') || c.includes('spain') || c.includes('italy') || c.includes('greece') || c.includes('poland') || c.includes('ukraine') || c.includes('sweden') || c.includes('norway')) return 'Europe';
  if (c.includes('australia') || c.includes('new zealand')) return 'Oceania';
  if (c.includes('egypt') || c.includes('south africa') || c.includes('nigeria') || c.includes('kenya') || c.includes('morocco') || c.includes('algeria') || c.includes('congo') || c.includes('ethiopia')) return 'Africa';

  // Geographic bounding box approximations
  if (lat < -60) return 'Antarctica';
  if (lat >= -10 && lat <= 80 && lon >= 25 && lon <= 180) return 'Asia';
  if (lat >= 35 && lat <= 72 && lon >= -25 && lon <= 45) return 'Europe';
  if (lat >= -35 && lat <= 38 && lon >= -18 && lon <= 52) return 'Africa';
  if (lat >= 7 && lat <= 85 && lon >= -170 && lon <= -50) return 'North America';
  if (lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34) return 'South America';
  if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return 'Oceania';
  return 'Global';
}

function formatConfidence(val) {
  const v = parseFloat(val);
  if (isNaN(v)) return 'N/A';
  return `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;
}

function formatCoordinates(lat, lon) {
  const nLat = parseFloat(lat);
  const nLon = parseFloat(lon);
  if (isNaN(nLat) || isNaN(nLon)) return 'N/A';
  return `${Math.abs(nLat).toFixed(4)}° ${nLat >= 0 ? 'N' : 'S'}, ${Math.abs(nLon).toFixed(4)}° ${nLon >= 0 ? 'E' : 'W'}`;
}

export function EarthIntelligenceView({
  detections = [],
  analytics,
  selectedDetection = null,
  onSelectDetection = () => {},
  onNavigate = () => {},
  onFocusDetection = () => {},
  onOpenAiAssistant = () => {},
  deepZoomTarget = null,
  onClearDeepZoomTarget = () => {},
}) {
const { effectiveTheme } = useTheme();
const isLight = effectiveTheme === 'light';

// View mode: '3d' (default realistic Earth) | '2d' (high-res Leaflet satellite)
// Deep zoom animation orchestration state: null | 'LOCATING' (3D) | 'FLYING' (2D) | 'LOCKED' (final)
const isDeepZoomFromUpload = Boolean(deepZoomTarget || selectedDetection?.isUploadedDeepZoom);
const [viewMode, setViewMode] = useState(isDeepZoomFromUpload ? '3d' : (selectedDetection ? '2d' : '3d'));
const [deepZoomStage, setDeepZoomStage] = useState(isDeepZoomFromUpload ? 'LOCATING' : null);
const deepZoomHandledRef = useRef(null);

// Client-side cache for GIS query responses (lat_lon_radius -> data)
const gisClientCacheRef = useRef(new Map());

  // Search input & feedback state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState(null);

  // Triggers for EarthGlobe3D camera actions
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);

  // Fullscreen state
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Copied coordinates state
  const [copiedCoords, setCopiedCoords] = useState(false);

  // PS 26162: Configurable Investigation Radius (1000m default, 2000m, 5000m)
  const [investigationRadius, setInvestigationRadius] = useState(1000);
  const [activeFeature, setActiveFeature] = useState(null);
  const [isFeaturesExpanded, setIsFeaturesExpanded] = useState(true);

  // Real GIS Physical Features & Counts State (from Backend FastAPI GIS Service)
  const [gisData, setGisData] = useState({
    status: 'idle',
    radius_m: 1000,
    summary: {
      industrial: 0,
      factories: 0,
      roads: 0,
      buildings: 0,
      forest: 0,
      settlements: 0,
      water: 0,
      other: 0,
    },
    features: [],
    message: null,
  });
  const [isGisLoading, setIsGisLoading] = useState(false);
  const [gisError, setGisError] = useState(null);

  // Real Reverse Geocoding & Administrative Context State
  const [locationContext, setLocationContext] = useState({
    resolvedAddress: null,
    continent: '',
    country: '',
    state: '',
    city: '',
    loading: false,
    source: '',
  });

  // 2D Leaflet map references
  const leafletContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const [leafletMapInstance, setLeafletMapInstance] = useState(null);
  const leafletMarkersRef = useRef(null);

  // User Current Device Geolocation (Google Maps-like location dot, Section 1, 2, 3, 9)
  const [userLocation, setUserLocation] = useState(null); // { latitude, longitude, accuracy, timestamp }
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [focusUserTrigger, setFocusUserTrigger] = useState(0);
  const geoWatchIdRef = useRef(null);
  const lastCenteredDetIdRef = useRef(null);

  // Native Browser/Device Geolocation Handler (Section 1, 4, 5, 9, 10, 15)
  const handleActivateMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setLocationError(null);
    setIsLocatingUser(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || null;

        const loc = {
          latitude: lat,
          longitude: lon,
          accuracy: accuracy,
          timestamp: pos.timestamp,
        };
        setUserLocation(loc);

        // Smooth camera transition to user location (Section 5, 11, 12, 13)
        if (viewMode === '2d' && leafletMapRef.current) {
          leafletMapRef.current.flyTo([lat, lon], 15, { duration: 1.8, easeLinearity: 0.25 });
        } else if (viewMode === '3d') {
          setFocusUserTrigger((p) => p + 1);
        }

        // Start continuous watcher to update blue dot if user moves (Section 9, 11)
        if (geoWatchIdRef.current == null) {
          geoWatchIdRef.current = navigator.geolocation.watchPosition(
            (watchPos) => {
              setUserLocation({
                latitude: watchPos.coords.latitude,
                longitude: watchPos.coords.longitude,
                accuracy: watchPos.coords.accuracy || null,
                timestamp: watchPos.timestamp,
              });
            },
            (watchErr) => {
              console.warn('[SATRA Geolocation] Watch update error:', watchErr);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 5000,
            }
          );
        }
      },
      (err) => {
        setIsLocatingUser(false);
        let msg = 'Unable to obtain current location. Try again.';
        if (err.code === 1) {
          msg = 'Location permission denied. Enable location access in your browser to show your current position.';
        } else if (err.code === 2) {
          msg = 'Current location unavailable.';
        } else if (err.code === 3) {
          msg = 'Unable to obtain current location. Try again.';
        }
        setLocationError(msg);
        setTimeout(() => setLocationError(null), 6500);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [viewMode]);

  // Clean up geolocation watcher on unmount (Section 9)
  useEffect(() => {
    return () => {
      if (geoWatchIdRef.current != null) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, []);

  // Calculate actual geodesic distance between User Location and Selected Detection (Section 7)
  const userToDetectionDistance = useMemo(() => {
    if (!userLocation || !selectedDetection) return null;
    const uLat = parseFloat(userLocation.latitude);
    const uLon = parseFloat(userLocation.longitude);
    const dLat = parseFloat(selectedDetection.latitude);
    const dLon = parseFloat(selectedDetection.longitude);
    if (isNaN(uLat) || isNaN(uLon) || isNaN(dLat) || isNaN(dLon)) return null;
    return calculateHaversineDistanceMeters(uLat, uLon, dLat, dLon);
  }, [userLocation, selectedDetection]);

  // Automatically switch to 2D Satellite GIS View whenever a detection is selected (unless 3D deep zoom is running)
  useEffect(() => {
    if (selectedDetection) {
      if (deepZoomStage === 'LOCATING') {
        // Allow 3D globe to smoothly orient and zoom toward target region first
        return;
      }
      if (!selectedDetection.isUploadedDeepZoom && !deepZoomTarget) {
        setViewMode('2d');
        setActiveFeature(null);
      }
    }
  }, [selectedDetection, deepZoomStage, deepZoomTarget]);

  // Deep Zoom Orchestrator: Multi-stage geographic transition (Sections 2, 3, 4, 12)
  useEffect(() => {
    const target = deepZoomTarget || (selectedDetection?.isUploadedDeepZoom ? selectedDetection : null);
    if (!target) return;
    if (deepZoomHandledRef.current === target.id) return;
    deepZoomHandledRef.current = target.id;

    const lat = parseFloat(target.latitude);
    const lon = parseFloat(target.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    if (viewMode === '3d') {
      // Step 1: Smoothly rotate 3D Earth toward target region
      setDeepZoomStage('LOCATING');
      setFocusTrigger((p) => p + 1);

      // Step 2: After 1.3s of 3D globe flight, switch to 2D Leaflet Satellite
      const t = setTimeout(() => {
        setViewMode('2d');
        setDeepZoomStage('FLYING');
      }, 1300);

      return () => clearTimeout(t);
    } else {
      // Already in 2D GIS: fly directly
      setDeepZoomStage('FLYING');
    }
  }, [deepZoomTarget, selectedDetection, viewMode]);

  // Step 3: Cinematic Leaflet flyTo down to local investigation level (zoom 15)
  useEffect(() => {
    const map = leafletMapInstance || leafletMapRef.current;
    if (deepZoomStage !== 'FLYING' || !map || !selectedDetection) return;

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // Start at regional scale (zoom 6) to show country/regional context
    map.setView([lat, lon], 6, { animate: false });

    // Multi-stage deep flyTo sequence down to zoom 15
    map.flyTo([lat, lon], 15, {
      duration: 2.2,
      easeLinearity: 0.25,
    });

    const handleFlyEnd = () => {
      map.off('moveend', handleFlyEnd);
      setDeepZoomStage('LOCKED');
      if (onClearDeepZoomTarget) onClearDeepZoomTarget();
      setTimeout(() => {
        setDeepZoomStage(null);
      }, 3500);
    };

    map.on('moveend', handleFlyEnd);

    return () => {
      map.off('moveend', handleFlyEnd);
    };
  }, [deepZoomStage, selectedDetection, leafletMapInstance, onClearDeepZoomTarget]);

  // 1. Resolve Administrative Geography (Nominatim) and Real Physical GIS Features (Backend Service)
  useEffect(() => {
    if (!selectedDetection) {
      setLocationContext({
        resolvedAddress: null,
        continent: '',
        country: '',
        state: '',
        city: '',
        loading: false,
        source: '',
      });
      setGisData({
        status: 'idle',
        radius_m: investigationRadius,
        summary: {
          industrial: 0,
          factories: 0,
          roads: 0,
          buildings: 0,
          forest: 0,
          settlements: 0,
          water: 0,
          other: 0,
        },
        features: [],
        message: null,
      });
      setIsGisLoading(false);
      setGisError(null);
      return;
    }

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    let isMounted = true;
    const controller = new AbortController();
    setLocationContext((prev) => ({ ...prev, loading: true }));
    setIsGisLoading(true);
    setGisError(null);

    const fetchGeoData = async () => {
      let resolvedCountry = '';
      let resolvedState = '';
      let resolvedCity = '';
      let resolvedSummary = '';

      // A. Reverse Geocoding for Place Name (Nominatim)
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
          {
            signal: controller.signal,
            headers: { 'Accept-Language': 'en' },
          }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (nomData && nomData.address) {
            const a = nomData.address;
            resolvedCountry = a.country || '';
            resolvedState = a.state || a.region || a.province || a.state_district || '';
            resolvedCity = a.city || a.town || a.village || a.county || a.municipality || a.suburb || '';
            resolvedSummary = [resolvedCity, resolvedState, resolvedCountry].filter(Boolean).join(', ');
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('Nominatim reverse lookup failed:', err);
      }

      if (!resolvedSummary) {
        resolvedSummary = formatCoordinates(lat, lon);
      }

      // B. Fetch Real Physical Infrastructure from Backend GIS Service (Zero Mock Data, Cached)
      const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${investigationRadius}`;
      if (gisClientCacheRef.current.has(cacheKey)) {
        const cached = gisClientCacheRef.current.get(cacheKey);
        if (isMounted) {
          setGisData(cached);
          setIsGisLoading(false);
          setGisError(null);
        }
      } else {
        try {
          const res = await getNearbyGis({ lat, lon, radius: investigationRadius });
          if (isMounted) {
            if (res && res.status === 'success') {
              gisClientCacheRef.current.set(cacheKey, res);
              setGisData(res);
              setGisError(null);
            } else if (res && res.status === 'unavailable') {
              setGisData(res);
              setGisError(res.message || 'Nearby GIS context temporarily unavailable.');
            }
          }
        } catch (err) {
          if (!isMounted) return;
          console.warn('Backend GIS query error:', err);
          setGisError('Nearby GIS context temporarily unavailable.');
          setGisData({
            status: 'unavailable',
            radius_m: investigationRadius,
            summary: {
              industrial: 0,
              factories: 0,
              roads: 0,
              buildings: 0,
              forest: 0,
              settlements: 0,
              water: 0,
              other: 0,
            },
            features: [],
            message: 'Nearby GIS context temporarily unavailable.',
          });
        } finally {
          if (isMounted) {
            setIsGisLoading(false);
          }
        }
      }

      if (isMounted) {
        setLocationContext({
          resolvedAddress: resolvedSummary,
          continent: getContinent(lat, lon, resolvedCountry),
          country: resolvedCountry,
          state: resolvedState,
          city: resolvedCity,
          loading: false,
          source: 'OpenStreetMap GIS Service',
        });
      }
    };

    fetchGeoData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedDetection, investigationRadius]);

  // 2. Search Bar Handler: Supports Coordinates, ID, or Geocoded Location
  const handleSearchSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const query = (searchQuery || '').trim();
    if (!query) return;

    setIsSearching(true);
    setSearchFeedback(null);

    // A. Coordinate match (e.g. "11.0168, 76.9558" or "11.0168 76.9558")
    const coordRegex = /^([-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))$/;
    const coordMatch = query.match(coordRegex);

    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);

      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        // Look for existing real detection within 35 km
        let closest = null;
        let minDist = Infinity;
        (detections || []).forEach((d) => {
          const dlat = parseFloat(d.latitude);
          const dlon = parseFloat(d.longitude);
          if (!isNaN(dlat) && !isNaN(dlon)) {
            const dist = calculateHaversineMeters(lat, lon, dlat, dlon);
            if (dist < minDist) {
              minDist = dist;
              closest = d;
            }
          }
        });

        if (closest && minDist <= 35000) {
          onSelectDetection(closest);
          setFocusTrigger((p) => p + 1);
          setSearchFeedback({
            type: 'success',
            text: `Centered on Detection #${closest.id} at [${lat.toFixed(4)}, ${lon.toFixed(4)}] (${(minDist / 1000).toFixed(1)} km away).`,
          });
        } else {
          // Custom coordinate target object
          const customTarget = {
            id: `coord-${lat.toFixed(3)}-${lon.toFixed(3)}`,
            latitude: lat,
            longitude: lon,
            predicted_class: 'Geographic Search Target',
            prediction_confidence: 1.0,
            risk_level: 'TARGET_LOCKED',
            data_provenance: 'USER_COORDINATES',
            source: 'EXACT_COORDINATES',
            acq_date: new Date().toISOString().split('T')[0],
            acq_time: new Date().toISOString().split('T')[1].slice(0, 5),
          };
          onSelectDetection(customTarget);
          setFocusTrigger((p) => p + 1);
          setSearchFeedback({
            type: 'info',
            text: `Orbit camera oriented to coordinate [${lat.toFixed(4)}, ${lon.toFixed(4)}].`,
          });
        }
        setIsSearching(false);
        return;
      }
    }

    // B. Detection ID match (e.g. "#12" or "12")
    const idClean = query.replace(/^#/, '');
    const matchedById = (detections || []).find((d) => String(d.id) === idClean || String(d.detection_id) === idClean);
    if (matchedById) {
      onSelectDetection(matchedById);
      setFocusTrigger((p) => p + 1);
      setSearchFeedback({
        type: 'success',
        text: `Target locked: Detection #${matchedById.id} (${matchedById.predicted_class || 'Hotspot'}).`,
      });
      setIsSearching(false);
      return;
    }

    // C. Nominatim Place Geocode (city, country, region)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);

          // Find closest detection to this location
          let closest = null;
          let minDist = Infinity;
          (detections || []).forEach((d) => {
            const dlat = parseFloat(d.latitude);
            const dlon = parseFloat(d.longitude);
            if (!isNaN(dlat) && !isNaN(dlon)) {
              const dist = calculateHaversineMeters(lat, lon, dlat, dlon);
              if (dist < minDist) {
                minDist = dist;
                closest = d;
              }
            }
          });

          if (closest && minDist <= 50000) {
            onSelectDetection(closest);
            setFocusTrigger((p) => p + 1);
            setSearchFeedback({
              type: 'success',
              text: `Located ${results[0].display_name.split(',')[0]}: focused on nearest detection (${(minDist / 1000).toFixed(1)} km away).`,
            });
          } else {
            const locTarget = {
              id: `geo-${Date.now()}`,
              latitude: lat,
              longitude: lon,
              predicted_class: 'Geographic Place Target',
              location_name: results[0].display_name,
              prediction_confidence: 1.0,
              risk_level: 'EXPLORATION',
              data_provenance: 'NOMINATIM_GEOCODE',
              source: 'OPENSTREETMAP',
              acq_date: new Date().toISOString().split('T')[0],
              acq_time: new Date().toISOString().split('T')[1].slice(0, 5),
            };
            onSelectDetection(locTarget);
            setFocusTrigger((p) => p + 1);
            setSearchFeedback({
              type: 'info',
              text: `Camera focused on ${results[0].display_name.split(',')[0]} [${lat.toFixed(4)}, ${lon.toFixed(4)}].`,
            });
          }
        } else {
          setSearchFeedback({
            type: 'warn',
            text: `No matching geographic location or detection found for "${query}".`,
          });
        }
      }
    } catch {
      setSearchFeedback({
        type: 'warn',
        text: 'Geocoding service unavailable. Enter numeric coordinates (e.g. 22.30, 70.80).',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // 3. Initialize & Update 2D Leaflet Satellite Map when viewMode === '2d'
  useEffect(() => {
    if (viewMode !== '2d') {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletMarkersRef.current = null;
        setLeafletMapInstance(null);
      }
      return;
    }
    if (!leafletContainerRef.current) return;

    if (!leafletMapRef.current) {
      const centerLat = selectedDetection ? parseFloat(selectedDetection.latitude) : 22.3;
      const centerLon = selectedDetection ? parseFloat(selectedDetection.longitude) : 75.0;
      const initialZoom = deepZoomStage === 'FLYING' ? 6 : (selectedDetection ? 15 : 5);
      const map = L.map(leafletContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: false,
      });

      // Real ESRI World Imagery Satellite Basemap
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
      }).addTo(map);

      // CartoDB Dark Matter Labels overlay
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd',
        opacity: 0.85,
      }).addTo(map);

      leafletMapRef.current = map;
      leafletMarkersRef.current = L.layerGroup().addTo(map);
      setLeafletMapInstance(map);
    }

    const map = leafletMapRef.current;
    const markersGroup = leafletMarkersRef.current;
    if (markersGroup) markersGroup.clearLayers();

    // Plot background detections
    (detections || []).forEach((d) => {
      if (selectedDetection && String(selectedDetection.id) === String(d.id)) return;
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const key = normalizeClassKey(d.predicted_class || d.classification);
      const color = TAXONOMY[key]?.color || '#FACC15';

      const marker = L.circleMarker([lat, lon], {
        radius: 5,
        color: '#FFFFFF',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.75,
      });

      marker.bindTooltip(
        `<div style="font-family: sans-serif; font-size: 11px; color: #FFFFFF; background: #0B1320; padding: 6px 10px; border-radius: 4px; border: 1px solid ${color};">
          <strong>${d.predicted_class || 'Thermal Anomaly'}</strong><br/>
          Lat: ${lat.toFixed(4)}°, Lon: ${lon.toFixed(4)}°<br/>
          FRP: ${d.frp != null ? `${parseFloat(d.frp).toFixed(1)} MW` : 'N/A'}
        </div>`,
        { direction: 'top', className: 'tactical-map-tooltip' }
      );

      marker.on('click', () => {
        onSelectDetection(d);
      });

      marker.addTo(markersGroup);
    });

    // If a detection is selected, plot exact tactical marker, radius circle, and nearby features
    if (selectedDetection) {
      const detLat = parseFloat(selectedDetection.latitude);
      const detLon = parseFloat(selectedDetection.longitude);

      if (!isNaN(detLat) && !isNaN(detLon)) {
        const key = normalizeClassKey(selectedDetection.predicted_class || selectedDetection.classification);
        const color = TAXONOMY[key]?.color || '#EF4444';

        // 1. Radius Circle Overlay
        const radiusCircle = L.circle([detLat, detLon], {
          radius: investigationRadius,
          color: '#38BDF8',
          weight: 1.5,
          dashArray: '5, 5',
          fillColor: '#0284C7',
          fillOpacity: 0.05,
        });
        radiusCircle.addTo(markersGroup);

        // 2. Exact Detection Marker with distinctive label banner & pulsing radar (Section 7)
        const pulseIcon = L.divIcon({
          className: 'satra-detection-marker-node',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
              <div style="
                position: absolute;
                top: -24px;
                background: rgba(239, 68, 68, 0.95);
                color: #FFFFFF;
                font-family: sans-serif;
                font-size: 9.5px;
                font-weight: 800;
                letter-spacing: 0.05em;
                padding: 2px 7px;
                border-radius: 4px;
                border: 1px solid #FCA5A5;
                box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
                white-space: nowrap;
                text-transform: uppercase;
                pointer-events: none;
              ">
                🔥 EXACT DETECTION
              </div>
              <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: ${color}; opacity: 0.35; animation: satraPulse 2s infinite ease-out;"></div>
              <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: ${color}; border: 2.5px solid #FFFFFF; box-shadow: 0 0 16px ${color};"></div>
              <div style="position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #FFFFFF;"></div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const detMarker = L.marker([detLat, detLon], { icon: pulseIcon, zIndexOffset: 3000 });
        detMarker.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11.5px; color: #FFFFFF; background: #0B1320; padding: 8px 12px; border-radius: 6px; border: 1.5px solid ${color}; line-height: 1.5;">
            <div style="font-weight: 800; color: ${color}; text-transform: uppercase; margin-bottom: 2px;">
              EXACT DETECTION LOCATION
            </div>
            <strong>AI Classification:</strong> ${selectedDetection.predicted_class || 'Thermal Anomaly'}<br/>
            <strong>Confidence:</strong> ${formatConfidence(selectedDetection.prediction_confidence)}<br/>
            <strong>Coordinates:</strong> ${detLat.toFixed(6)}°, ${detLon.toFixed(6)}°<br/>
            ${selectedDetection.frp ? `<strong>FRP:</strong> ${parseFloat(selectedDetection.frp).toFixed(1)} MW<br/>` : ''}
            <strong>Satellite:</strong> ${selectedDetection.source || selectedDetection.satellite || 'VIIRS'}
          </div>`,
          { direction: 'top', className: 'tactical-map-tooltip' }
        );
        detMarker.on('click', () => {
          map.setView([detLat, detLon], 15, { animate: true });
          setActiveFeature(null);
        });
        detMarker.addTo(markersGroup);

        // 3. Nearby Real GIS Features
        const badgeMap = {
          industrial: { icon: '🏭', color: '#F97316' },
          roads: { icon: '🛣️', color: '#38BDF8' },
          forest: { icon: '🌳', color: '#10B981' },
          buildings: { icon: '🏢', color: '#818CF8' },
          settlements: { icon: '🏘️', color: '#C084FC' },
          water: { icon: '💧', color: '#06B6D4' },
          other: { icon: '📍', color: '#94A3B8' },
        };

        (gisData.features || []).forEach((feat) => {
          if (feat.latitude == null || feat.longitude == null) return;
          const badge = badgeMap[feat.type] || badgeMap.other;
          const isActive = activeFeature && activeFeature.id === feat.id;

          const featIcon = L.divIcon({
            className: 'satra-gis-node',
            html: `
              <div style="
                display: flex; align-items: center; justify-content: center;
                width: ${isActive ? '34px' : '26px'};
                height: ${isActive ? '34px' : '26px'};
                border-radius: 50%;
                background: #0B1320;
                border: 2px solid ${isActive ? '#FFFFFF' : badge.color};
                box-shadow: ${isActive ? `0 0 16px #FFFFFF, 0 0 10px ${badge.color}` : '0 2px 8px rgba(0,0,0,0.7)'};
                font-size: ${isActive ? '15px' : '13px'};
                cursor: pointer;
                transition: all 0.2s ease;
              ">
                ${badge.icon}
              </div>
            `,
            iconSize: [isActive ? 34 : 26, isActive ? 34 : 26],
            iconAnchor: [isActive ? 17 : 13, isActive ? 17 : 13],
          });

          const fMarker = L.marker([feat.latitude, feat.longitude], {
            icon: featIcon,
            zIndexOffset: isActive ? 1500 : 500,
          });

          const distLabel = feat.distance_m < 1000 ? `${feat.distance_m} m` : `${(feat.distance_m / 1000).toFixed(2)} km`;
          fMarker.bindTooltip(
            `<div style="font-family: sans-serif; font-size: 11px; color: #FFFFFF; background: #0B1320; padding: 6px 10px; border-radius: 6px; border: 1px solid ${badge.color};">
              <strong>${badge.icon} ${feat.name}</strong><br/>
              <span style="color: #94A3B8;">${feat.category_label} &bull; ${distLabel} (${feat.direction})</span>
            </div>`,
            { direction: 'top', className: 'tactical-map-tooltip' }
          );

          fMarker.on('click', () => {
            setActiveFeature(feat);
            // Pan smoothly while keeping detection coordinate in visible view bounds (Section 9)
            if (map) {
              const bounds = L.latLngBounds([
                [detLat, detLon],
                [feat.latitude, feat.longitude],
              ]).pad(0.3);
              map.fitBounds(bounds, { maxZoom: 16, animate: true });
            }
          });

          fMarker.addTo(markersGroup);
        });

        // 4. Tactical Proximity Distance Lines to Nearby Mapped Infrastructure (Section 6)
        if (gisData.features && gisData.features.length > 0) {
          const sortedFeats = [...gisData.features].sort((a, b) => (a.distance_m || 0) - (b.distance_m || 0));
          const keyFeats = sortedFeats
            .filter((f) => {
              if (activeFeature && activeFeature.id === f.id) return true;
              return f.type === 'industrial' || f.type === 'roads' || f.type === 'forest';
            })
            .slice(0, 4);
          const featsToConnect = keyFeats.length >= 2 ? keyFeats : sortedFeats.slice(0, 3);

          featsToConnect.forEach((feat) => {
            if (feat.latitude == null || feat.longitude == null) return;
            const isFeatActive = activeFeature && activeFeature.id === feat.id;

            // Dashed connection polyline
            const line = L.polyline([[detLat, detLon], [feat.latitude, feat.longitude]], {
              color: isFeatActive ? '#38BDF8' : 'rgba(56, 189, 248, 0.45)',
              weight: isFeatActive ? 2.5 : 1.5,
              dashArray: isFeatActive ? '6, 6' : '4, 6',
              opacity: isFeatActive ? 1.0 : 0.65,
            });
            line.addTo(markersGroup);

            // Midpoint distance badge with real calculated geodesic distance
            const midLat = (detLat + feat.latitude) / 2;
            const midLon = (detLon + feat.longitude) / 2;
            const distBadge = L.divIcon({
              className: 'satra-dist-line-badge',
              html: `
                <div style="
                  background: rgba(11, 23, 38, 0.94);
                  border: 1px solid ${isFeatActive ? '#38BDF8' : 'rgba(56, 189, 248, 0.45)'};
                  border-radius: 4px;
                  padding: 1px 6px;
                  font-family: monospace;
                  font-size: 10px;
                  font-weight: 700;
                  color: ${isFeatActive ? '#FFFFFF' : '#38BDF8'};
                  box-shadow: 0 2px 8px rgba(0,0,0,0.7);
                  white-space: nowrap;
                  pointer-events: none;
                  transform: translate(-50%, -50%);
                ">
                  ${feat.distance_m < 1000 ? `${feat.distance_m} m` : `${(feat.distance_m / 1000).toFixed(1)} km`}
                </div>
              `,
              iconSize: [40, 16],
              iconAnchor: [20, 8],
            });
            L.marker([midLat, midLon], { icon: distBadge, interactive: false }).addTo(markersGroup);
          });
        }

        // Center on detection or active feature (only when detection/feature changes, never on user background movement)
        if (deepZoomStage !== 'FLYING') {
          if (activeFeature && activeFeature.latitude && activeFeature.longitude) {
            const bounds = L.latLngBounds([
              [detLat, detLon],
              [activeFeature.latitude, activeFeature.longitude],
            ]).pad(0.3);
            map.fitBounds(bounds, { maxZoom: 16, animate: true });
          } else if (lastCenteredDetIdRef.current !== selectedDetection.id) {
            lastCenteredDetIdRef.current = selectedDetection.id;
            map.setView([detLat, detLon], 15, { animate: true });
          }
        }
      }
    }

    // 4. Plot User Current Location (Google Maps-style blue location dot + accuracy circle, Section 2, 3, 6, 13)
    if (userLocation && userLocation.latitude != null && userLocation.longitude != null) {
      const uLat = parseFloat(userLocation.latitude);
      const uLon = parseFloat(userLocation.longitude);

      if (!isNaN(uLat) && !isNaN(uLon)) {
        // A. Accuracy Circle (Translucent blue)
        if (userLocation.accuracy && userLocation.accuracy > 0) {
          const accCircle = L.circle([uLat, uLon], {
            radius: userLocation.accuracy,
            color: '#3B82F6',
            weight: 1,
            dashArray: '3, 4',
            fillColor: '#3B82F6',
            fillOpacity: 0.12,
            interactive: false,
          });
          accCircle.addTo(markersGroup);
        }

        // B. Google Maps-like Blue Location Marker (Section 2)
        const userIcon = L.divIcon({
          className: 'satra-user-location-node',
          html: `
            <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <!-- Pulsing outer halo -->
              <div style="
                position: absolute;
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: rgba(59, 130, 246, 0.45);
                animation: satraUserPulse 2s infinite ease-out;
                pointer-events: none;
              "></div>
              <!-- Crisp white rim with vibrant blue core -->
              <div style="
                position: relative;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #2563EB;
                border: 3px solid #FFFFFF;
                box-shadow: 0 0 12px rgba(37, 99, 235, 0.95), 0 2px 6px rgba(0, 0, 0, 0.6);
              "></div>
              <div style="
                position: absolute;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #FFFFFF;
              "></div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const uMarker = L.marker([uLat, uLon], {
          icon: userIcon,
          zIndexOffset: 2500,
        });

        uMarker.bindTooltip(
          `<div style="font-family: sans-serif; font-size: 11.5px; color: #FFFFFF; background: #0B1320; padding: 7px 11px; border-radius: 6px; border: 1.5px solid #3B82F6; line-height: 1.5;">
            <div style="font-weight: 800; color: #60A5FA; text-transform: uppercase; margin-bottom: 2px;">
              🔵 Your Current Device Location
            </div>
            <strong>Coordinates:</strong> ${uLat.toFixed(6)}°, ${uLon.toFixed(6)}°<br/>
            ${userLocation.accuracy ? `<strong>Accuracy:</strong> &plusmn;${Math.round(userLocation.accuracy)} m<br/>` : ''}
            <span style="font-size: 10px; color: #94A3B8;">Source: Native Browser Geolocation</span>
          </div>`,
          { direction: 'top', className: 'tactical-map-tooltip' }
        );

        uMarker.on('click', () => {
          if (map) {
            map.flyTo([uLat, uLon], Math.max(map.getZoom(), 15), { duration: 1.2 });
          }
        });

        uMarker.addTo(markersGroup);

        // C. Distance Vector connecting User to Selected Detection (Section 6, 7)
        if (selectedDetection) {
          const dLat = parseFloat(selectedDetection.latitude);
          const dLon = parseFloat(selectedDetection.longitude);
          if (!isNaN(dLat) && !isNaN(dLon)) {
            const distMeters = calculateHaversineDistanceMeters(uLat, uLon, dLat, dLon);
            const userLine = L.polyline([[uLat, uLon], [dLat, dLon]], {
              color: '#3B82F6',
              weight: 2,
              dashArray: '5, 6',
              opacity: 0.8,
              interactive: false,
            });
            userLine.addTo(markersGroup);

            // Midpoint distance badge
            const midLat = (uLat + dLat) / 2;
            const midLon = (uLon + dLon) / 2;
            const distText = distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(2)} km`;
            const userDistBadge = L.divIcon({
              className: 'satra-user-dist-badge',
              html: `
                <div style="
                  background: rgba(11, 23, 38, 0.95);
                  border: 1.5px solid #3B82F6;
                  border-radius: 4px;
                  padding: 2px 7px;
                  font-family: monospace;
                  font-size: 10px;
                  font-weight: 700;
                  color: #60A5FA;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.7);
                  white-space: nowrap;
                  pointer-events: none;
                  transform: translate(-50%, -50%);
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <span>🔵 ➔ 🔥</span>
                  <span>${distText} from you</span>
                </div>
              `,
              iconSize: [95, 18],
              iconAnchor: [47, 9],
            });
            L.marker([midLat, midLon], { icon: userDistBadge, interactive: false }).addTo(markersGroup);
          }
        }
      }
    }
  }, [viewMode, detections, selectedDetection, gisData, activeFeature, investigationRadius, onSelectDetection, userLocation]);

  // 4. Zoom control for 3D Earth and 2D Satellite
  const handleZoom = (delta) => {
    if (viewMode === '2d' && leafletMapRef.current) {
      if (delta < 0) leafletMapRef.current.zoomIn();
      else leafletMapRef.current.zoomOut();
    } else {
      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, bubbles: true, cancelable: true }));
      }
    }
  };

  // 5. Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // 6. Copy coordinates helper
  const handleCopyCoords = (lat, lon) => {
    if (!lat || !lon) return;
    const str = `${parseFloat(lat).toFixed(6)}, ${parseFloat(lon).toFixed(6)}`;
    navigator.clipboard.writeText(str);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // 7. Dynamic Geographic Breadcrumb Computation
  const breadcrumbItems = useMemo(() => {
    const items = [
      {
        label: '🌍 Global',
        onClick: () => {
          onSelectDetection(null);
          setResetTrigger((p) => p + 1);
          setViewMode('3d');
        },
      },
    ];

    if (selectedDetection) {
      const lat = parseFloat(selectedDetection.latitude);
      const lon = parseFloat(selectedDetection.longitude);
      const continent = locationContext.continent || getContinent(lat, lon, locationContext.country);
      if (continent && continent !== 'Global') items.push({ label: continent });
      if (locationContext.country) items.push({ label: locationContext.country });
      if (locationContext.state) items.push({ label: locationContext.state });
      if (locationContext.city) items.push({ label: locationContext.city });
      items.push({
        label: selectedDetection.id ? `Detection #${selectedDetection.id}` : `[${lat.toFixed(4)}°, ${lon.toFixed(4)}°]`,
        isTarget: true,
      });
    }

    return items;
  }, [selectedDetection, locationContext, onSelectDetection]);

  return (
    <div
      ref={containerRef}
      className="earth-intelligence-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isFullscreen ? '100vh' : 'calc(100vh - 120px)',
        minHeight: isFullscreen ? '100vh' : '540px',
        width: '100%',
        background: '#070A12',
        borderRadius: isFullscreen ? 0 : '12px',
        border: isFullscreen ? 'none' : '1px solid rgba(56, 189, 248, 0.18)',
        boxShadow: isFullscreen ? 'none' : '0 12px 40px rgba(0, 0, 0, 0.6)',
        color: '#F8FAFC',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes satraUserPulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          70% { transform: scale(1.9); opacity: 0.15; }
          100% { transform: scale(2.3); opacity: 0; }
        }
      `}</style>
      {/* ============================================================ */}
      {/* {/* 1. TOP CONTROL & METRICS HEADER BAR                       */}
      {/* ============================================================ */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: isLight ? '#FFFFFF' : 'rgba(10, 15, 26, 0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: isLight ? '1px solid #DCE5EE' : '1px solid rgba(56, 189, 248, 0.15)',
          zIndex: 30,
          flexShrink: 0,
          gap: '16px',
        }}
      >
        {/* Left: Title & Subtitle */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#0EA5E9',
                boxShadow: '0 0 8px #0EA5E9',
              }}
            />
            <h1
              style={{
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: isLight ? '#0F172A' : '#FFFFFF',
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              Earth Intelligence
            </h1>
          </div>
          <p
            style={{
              fontSize: '11.5px',
              color: isLight ? '#64748B' : '#94A3B8',
              margin: '3px 0 0 0',
              fontWeight: 400,
            }}
          >
            Global geographic intelligence for satellite thermal detections.
          </p>
        </div>

        {/* Right: Search Bar & 3D / 2D Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Location Search Form */}
          <form
            onSubmit={handleSearchSubmit}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                color: isSearching ? '#0EA5E9' : (isLight ? '#64748B' : '#64748B'),
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search location, coordinates, or Detection ID..."
              style={{
                width: '320px',
                background: isLight ? '#F8FAFC' : 'rgba(15, 23, 42, 0.85)',
                border: isLight ? '1px solid #CBD5E1' : '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '6px',
                padding: '7px 32px',
                color: isLight ? '#0F172A' : '#F8FAFC',
                fontSize: '12px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchFeedback(null);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: isLight ? '#64748B' : '#94A3B8',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </form>

          {/* View Mode Toggle (3D Earth <-> 2D Satellite) */}
          <div
            style={{
              display: 'flex',
              background: isLight ? '#F1F5F9' : 'rgba(15, 23, 42, 0.85)',
              borderRadius: '6px',
              border: isLight ? '1px solid #DCE5EE' : '1px solid rgba(56, 189, 248, 0.25)',
              padding: '2px',
            }}
          >
            <button
              onClick={() => {
                setViewMode('3d');
                onSelectDetection(null);
                setResetTrigger((p) => p + 1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: viewMode === '3d' ? (isLight ? '#FFFFFF' : 'rgba(56, 189, 248, 0.22)') : 'transparent',
                color: viewMode === '3d' ? (isLight ? '#0284C7' : '#38BDF8') : (isLight ? '#64748B' : '#94A3B8'),
                border: 'none',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: viewMode === '3d' && isLight ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Globe size={13} />
              <span>3D Earth</span>
            </button>
            <button
              onClick={() => setViewMode('2d')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: viewMode === '2d' ? (isLight ? '#FFFFFF' : 'rgba(56, 189, 248, 0.22)') : 'transparent',
                color: viewMode === '2d' ? (isLight ? '#0284C7' : '#38BDF8') : (isLight ? '#64748B' : '#94A3B8'),
                border: 'none',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: viewMode === '2d' && isLight ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <MapPin size={13} />
              <span>2D GIS</span>
            </button>
          </div>

          {/* Real Live Ingestion Status Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#34D399',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 6px #10B981',
              }}
            />
            <span>{detections.length} REAL DETECTIONS</span>
          </div>
        </div>
      </header>

      {/* Search Feedback Notification Banner */}
      {searchFeedback && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${
              searchFeedback.type === 'success'
                ? 'rgba(16, 185, 129, 0.4)'
                : searchFeedback.type === 'warn'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(56, 189, 248, 0.4)'
            }`,
            borderRadius: '8px',
            padding: '7px 16px',
            color:
              searchFeedback.type === 'success'
                ? '#34D399'
                : searchFeedback.type === 'warn'
                ? '#F87171'
                : '#38BDF8',
            fontSize: '12px',
            fontWeight: 500,
            zIndex: 40,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{searchFeedback.text}</span>
          <button
            onClick={() => setSearchFeedback(null)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. MAIN WORKSPACE: 2-COLUMN (Center Earth + Right Panel)     */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* ========================================================== */}
        {/* CENTER COLUMN: Large 3D Earth / Geographic Visualization   */}
        {/* Occupies 65-75% of visual area, completely unobstructed    */}
        {/* ========================================================== */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Dynamic Geographic Breadcrumb Bar */}
          <div
            style={{
              padding: '8px 20px',
              background: isLight ? '#FFFFFF' : 'rgba(10, 16, 30, 0.65)',
              borderBottom: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: isLight ? '#64748B' : '#94A3B8',
              zIndex: 15,
              flexShrink: 0,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {breadcrumbItems.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight size={12} style={{ color: isLight ? '#CBD5E1' : '#475569', flexShrink: 0 }} />}
                <span
                  onClick={item.onClick}
                  style={{
                    color: item.isTarget ? '#0284C7' : item.onClick ? (isLight ? '#0F172A' : '#F8FAFC') : (isLight ? '#64748B' : '#94A3B8'),
                    fontWeight: item.isTarget ? 700 : item.onClick ? 600 : 400,
                    cursor: item.onClick ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {item.label}
                </span>
              </React.Fragment>
            ))}
          </div>

          {/* Primary Visualization Viewport (3D Earth or 2D Satellite) */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Tactical Deep Zoom Status Indicator (Section 2 & 3) */}
            {deepZoomStage && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 100,
                  background: 'rgba(11, 23, 38, 0.94)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid #38BDF8',
                  borderRadius: '24px',
                  padding: '8px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(56, 189, 248, 0.35)',
                  pointerEvents: 'none',
                }}
              >
                <Crosshair size={15} className={deepZoomStage !== 'LOCKED' ? 'spin' : ''} style={{ color: '#38BDF8' }} />
                <span style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.05em', color: '#F8FAFC' }}>
                  {deepZoomStage === 'LOCATING' && 'LOCATING DETECTION... TARGET REGION ACQUISITION'}
                  {deepZoomStage === 'FLYING' && 'DEEP ZOOM TO EXACT COORDINATES... SATELLITE PASS'}
                  {deepZoomStage === 'LOCKED' && 'EXACT DETECTION REACHED • REAL GIS CONTEXT LOADED'}
                </span>
              </div>
            )}
            {/* 3D Realistic Earth Canvas */}
            {viewMode === '3d' && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
                <EarthGlobe3D
                  detections={detections}
                  selectedDetection={selectedDetection}
                  onSelectDetection={onSelectDetection}
                  onSwitchTo2D={() => setViewMode('2d')}
                  focusTrigger={focusTrigger}
                  resetTrigger={resetTrigger}
                  zoomInTrigger={zoomInTrigger}
                  zoomOutTrigger={zoomOutTrigger}
                  hideSidePanel={true}
                  isEarthIntelligence={true}
                  palette="thermal"
                  autoRotate={true}
                  userLocation={userLocation}
                  onActivateMyLocation={handleActivateMyLocation}
                  focusUserLocationTrigger={focusUserTrigger}
                />
              </div>
            )}

            {/* 2D Satellite Viewport */}
            {viewMode === '2d' && (
              <div
                ref={leafletContainerRef}
                style={{ position: 'absolute', inset: 0, zIndex: 1, background: '#050B14' }}
              />
            )}

            {/* Tactical Focus Detection Floating Action on Map */}
            {viewMode === '2d' && selectedDetection && (
              <button
                onClick={() => {
                  setActiveFeature(null);
                  if (leafletMapRef.current) {
                    const dlat = parseFloat(selectedDetection.latitude);
                    const dlon = parseFloat(selectedDetection.longitude);
                    if (!isNaN(dlat) && !isNaN(dlon)) {
                      leafletMapRef.current.setView([dlat, dlon], 15, { animate: true });
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  zIndex: 20,
                  background: 'rgba(11, 23, 38, 0.94)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid #38BDF8',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 14px rgba(56, 189, 248, 0.3)',
                  transition: 'all 0.15s ease',
                }}
                title="Center map on exact satellite thermal coordinate"
              >
                <Crosshair size={14} style={{ color: '#38BDF8' }} />
                <span>FOCUS DETECTION [{parseFloat(selectedDetection.latitude).toFixed(4)}°, {parseFloat(selectedDetection.longitude).toFixed(4)}°]</span>
              </button>
            )}

            {/* Honest Empty State Banner if no detections exist */}
            {(!detections || detections.length === 0) && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: isLight ? '#FFFFFF' : 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(12px)',
                  border: isLight ? '1px solid #FECACA' : '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  color: '#EF4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  zIndex: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  letterSpacing: '0.04em',
                  boxShadow: isLight ? '0 4px 16px rgba(15, 23, 42, 0.08)' : 'none',
                }}
              >
                <AlertTriangle size={15} />
                <span>NO REAL SATELLITE DETECTIONS AVAILABLE</span>
              </div>
            )}

            {/* Single Earth Control Group (Source of Truth) */}
            <aside
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                background: isLight ? '#FFFFFF' : 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(16px)',
                border: isLight ? '1px solid #DCE5EE' : '1px solid rgba(56, 189, 248, 0.28)',
                borderRadius: '8px',
                padding: '4px',
                boxShadow: isLight ? '0 4px 16px rgba(15, 23, 42, 0.08)' : '0 8px 32px rgba(0, 0, 0, 0.65)',
              }}
            >
              {/* 1. Zoom In (+) */}
              <button
                onClick={() => {
                  if (viewMode === '2d' && leafletMapRef.current) {
                    leafletMapRef.current.zoomIn();
                  } else {
                    setZoomInTrigger((p) => p + 1);
                  }
                }}
                title="Zoom In"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLight ? '#0F172A' : '#FFFFFF',
                  cursor: 'pointer',
                  padding: '5px 7px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  lineHeight: 1,
                  width: '32px',
                  height: '32px',
                  transition: 'background 0.15s ease',
                }}
              >
                +
              </button>

              {/* 2. Zoom Out (−) */}
              <button
                onClick={() => {
                  if (viewMode === '2d' && leafletMapRef.current) {
                    leafletMapRef.current.zoomOut();
                  } else {
                    setZoomOutTrigger((p) => p + 1);
                  }
                }}
                title="Zoom Out"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLight ? '#0F172A' : '#FFFFFF',
                  cursor: 'pointer',
                  padding: '5px 7px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  lineHeight: 1,
                  width: '32px',
                  height: '32px',
                  transition: 'background 0.15s ease',
                }}
              >
                &minus;
              </button>

              <div style={{ height: '1px', background: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.12)', margin: '2px 4px' }} />

              {/* 3. Focus Detection Point (Satellite) */}
              <button
                onClick={() => {
                  if (selectedDetection) {
                    setFocusTrigger((p) => p + 1);
                    if (viewMode === '2d' && leafletMapRef.current) {
                      const lat = parseFloat(selectedDetection.latitude);
                      const lon = parseFloat(selectedDetection.longitude);
                      if (!isNaN(lat) && !isNaN(lon)) leafletMapRef.current.setView([lat, lon], 12, { animate: true });
                    }
                  } else if (detections.length > 0) {
                    onSelectDetection(detections[0]);
                    setFocusTrigger((p) => p + 1);
                    if (viewMode === '2d' && leafletMapRef.current) {
                      const lat = parseFloat(detections[0].latitude);
                      const lon = parseFloat(detections[0].longitude);
                      if (!isNaN(lat) && !isNaN(lon)) leafletMapRef.current.setView([lat, lon], 12, { animate: true });
                    }
                  }
                }}
                title="Focus Detection Point (Satellite)"
                style={{
                  background: selectedDetection ? (isLight ? '#EFF6FF' : 'rgba(56, 189, 248, 0.22)') : 'transparent',
                  border: 'none',
                  color: selectedDetection ? '#0284C7' : (isLight ? '#0F172A' : '#FFFFFF'),
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Crosshair size={16} />
              </button>

              {/* 3b. My Current Location (Device Geolocation - Section 4, 5) */}
              <button
                onClick={handleActivateMyLocation}
                title={
                  isLocatingUser
                    ? 'Acquiring device geolocation...'
                    : userLocation
                    ? 'My Location (Active - Click to center)'
                    : 'My Location (Browser Geolocation)'
                }
                style={{
                  background: userLocation
                    ? 'rgba(59, 130, 246, 0.25)'
                    : isLocatingUser
                    ? 'rgba(56, 189, 248, 0.2)'
                    : 'transparent',
                  border: userLocation ? '1px solid rgba(59, 130, 246, 0.5)' : 'none',
                  color: userLocation ? '#60A5FA' : '#FFFFFF',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Navigation
                  size={16}
                  className={isLocatingUser ? 'spin' : ''}
                  style={{ transform: userLocation ? 'none' : 'rotate(-45deg)' }}
                />
              </button>

              {/* 4. Reset / Global View */}
              <button
                onClick={() => {
                  onSelectDetection(null);
                  setResetTrigger((p) => p + 1);
                  if (viewMode === '2d') {
                    setViewMode('3d');
                  } else if (leafletMapRef.current) {
                    leafletMapRef.current.setView([21, 78], 4, { animate: true });
                  }
                }}
                title="Reset / Global View"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLight ? '#64748B' : '#94A3B8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  transition: 'background 0.15s ease',
                }}
              >
                <Globe size={15} />
              </button>

              {/* 5. Fullscreen */}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLight ? '#64748B' : '#94A3B8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  transition: 'background 0.15s ease',
                }}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </aside>
          </div>
        </div>

        {/* ========================================================== */}
        {/* RIGHT COLUMN: Dedicated Detection / Location Panel        */}
        {/* Width: 360px fixed, NEVER overlaps Earth                  */}
        {/* ========================================================== */}
        <aside
          style={{
            width: '360px',
            flexShrink: 0,
            height: '100%',
            background: isLight ? '#FFFFFF' : 'rgba(10, 16, 30, 0.96)',
            backdropFilter: 'blur(20px)',
            borderLeft: isLight ? '1px solid #DCE5EE' : '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 25,
            overflowY: 'auto',
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={16} style={{ color: '#0EA5E9' }} />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: isLight ? '#0F172A' : '#F8FAFC',
                  textTransform: 'uppercase',
                }}
              >
                Location Intelligence
              </span>
            </div>
            {selectedDetection && (
              <button
                onClick={() => {
                  onSelectDetection(null);
                  setResetTrigger((p) => p + 1);
                }}
                title="Deselect Location"
                style={{
                  background: 'none',
                  border: 'none',
                  color: isLight ? '#64748B' : '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Panel Body */}
          {!selectedDetection ? (
            /* Empty State when no detection is selected */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 24px',
                textAlign: 'center',
                color: '#64748B',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: isLight ? '#F0F9FF' : 'rgba(56, 189, 248, 0.08)',
                  border: isLight ? '1px solid #BAE6FD' : '1px solid rgba(56, 189, 248, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: '#0EA5E9',
                }}
              >
                <Compass size={26} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: isLight ? '#0F172A' : '#E2E8F0', marginBottom: '8px' }}>
                No Detection Selected
              </div>
              <p style={{ fontSize: '12.5px', lineHeight: 1.6, margin: 0, maxWidth: '280px', color: isLight ? '#64748B' : '#94A3B8' }}>
                Select a detection or search for a location to inspect geographic intelligence.
              </p>
            </div>
          ) : (
            /* Dedicated Details when Detection is Selected */
            <div
              style={{
                flex: 1,
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Section 1: Detection Details */}
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: isLight ? '#0284C7' : '#38BDF8',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Detection Details</span>
                  <span style={{ color: isLight ? '#64748B' : '#64748B', fontFamily: 'monospace' }}>
                    ID #{selectedDetection.id || selectedDetection.detection_id || 'N/A'}
                  </span>
                </div>

                {/* Classification & Status Badges */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <ClassBadge predictedClass={selectedDetection.predicted_class || selectedDetection.classification} />
                  <ProvenanceBadge provenance={selectedDetection.data_provenance || selectedDetection.source} />
                </div>

                {/* Canonical Coordinates Card with Copy */}
                <div
                  style={{
                    background: isLight ? '#F0F9FF' : 'rgba(56, 189, 248, 0.08)',
                    border: isLight ? '1px solid #BAE6FD' : '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: isLight ? '#0284C7' : '#38BDF8', letterSpacing: '0.04em' }}>
                      CANONICAL COORDINATES
                    </span>
                    <button
                      onClick={() => handleCopyCoords(selectedDetection.latitude, selectedDetection.longitude)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'none',
                        border: 'none',
                        color: copiedCoords ? '#10B981' : (isLight ? '#0284C7' : '#38BDF8'),
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {copiedCoords ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedCoords ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: isLight ? '#64748B' : '#94A3B8' }}>LATITUDE</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: isLight ? '#0F172A' : '#FFFFFF' }}>
                        {parseFloat(selectedDetection.latitude).toFixed(6)}°
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: isLight ? '#64748B' : '#94A3B8' }}>LONGITUDE</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: isLight ? '#0F172A' : '#FFFFFF' }}>
                        {parseFloat(selectedDetection.longitude).toFixed(6)}°
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: isLight ? '#64748B' : '#94A3B8' }}>Confidence</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284C7', marginTop: '2px' }}>
                      {formatConfidence(selectedDetection.prediction_confidence)}
                    </div>
                  </div>

                  <div
                    style={{
                      background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: isLight ? '#64748B' : '#94A3B8' }}>Risk Level</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: isLight ? '#0F172A' : '#F8FAFC', marginTop: '2px' }}>
                      {selectedDetection.risk_level || selectedDetection.risk || 'N/A'}
                    </div>
                  </div>

                  <div
                    style={{
                      background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: isLight ? '#64748B' : '#94A3B8' }}>Radiative Power</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }}>
                      {selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
                    </div>
                  </div>

                  <div
                    style={{
                      background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: isLight ? '#64748B' : '#94A3B8' }}>Satellite Sensor</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isLight ? '#0F172A' : '#FFFFFF', marginTop: '2px' }}>
                      {selectedDetection.source || selectedDetection.satellite || 'VIIRS'}
                    </div>
                  </div>
                </div>

                {/* Metadata Row */}
                <div
                  style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '6px',
                    border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '11px',
                    color: isLight ? '#475569' : '#94A3B8',
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    Acquisition Date:{' '}
                    <strong style={{ color: isLight ? '#0F172A' : '#FFFFFF' }}>
                      {selectedDetection.acq_date || (selectedDetection.timestamp ? selectedDetection.timestamp.split('T')[0] : 'N/A')}
                    </strong>
                  </div>
                  <div>
                    Acquisition Time:{' '}
                    <strong style={{ color: isLight ? '#0F172A' : '#FFFFFF' }}>
                      {selectedDetection.acq_time ? `${selectedDetection.acq_time} UTC` : 'N/A'}
                    </strong>
                  </div>
                  <div>
                    Data Provenance:{' '}
                    <strong style={{ color: '#10B981' }}>
                      {selectedDetection.data_provenance || selectedDetection.source || 'NASA FIRMS'}
                    </strong>
                  </div>
                </div>

                {/* Section 1b: User Device Geolocation & Proximity (Section 7, 14) */}
                <div
                  style={{
                    marginTop: '10px',
                    background: userLocation ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${userLocation ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.06)'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: userLocation ? '#60A5FA' : '#94A3B8', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: userLocation ? '#3B82F6' : '#64748B',
                        boxShadow: userLocation ? '0 0 8px #3B82F6' : 'none',
                      }}></span>
                      YOUR DEVICE LOCATION
                    </span>
                    <button
                      onClick={handleActivateMyLocation}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38BDF8',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: 0,
                      }}
                      title="Request / Update current browser location"
                    >
                      <Navigation size={11} className={isLocatingUser ? 'spin' : ''} />
                      <span>{isLocatingUser ? 'Locating...' : userLocation ? 'Update' : 'Locate Device'}</span>
                    </button>
                  </div>

                  {userLocation ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                        <div>
                          <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>YOUR LATITUDE</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>
                            {userLocation.latitude.toFixed(6)}°
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>YOUR LONGITUDE</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF' }}>
                            {userLocation.longitude.toFixed(6)}°
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '10.5px' }}>
                        <span style={{ color: '#94A3B8' }}>
                          Accuracy: <strong style={{ color: '#93C5FD' }}>{userLocation.accuracy ? `±${Math.round(userLocation.accuracy)} m` : 'Standard'}</strong>
                        </span>
                        <button
                          onClick={() => {
                            if (viewMode === '2d' && leafletMapRef.current) {
                              leafletMapRef.current.flyTo([userLocation.latitude, userLocation.longitude], 15, { duration: 1.5 });
                            } else if (viewMode === '3d') {
                              setFocusUserTrigger((p) => p + 1);
                            }
                          }}
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            borderRadius: '4px',
                            color: '#60A5FA',
                            fontSize: '10px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                          }}
                        >
                          Center on Me
                        </button>
                      </div>

                      {userToDetectionDistance != null && (
                        <div style={{
                          marginTop: '8px',
                          paddingTop: '6px',
                          borderTop: '1px dashed rgba(59, 130, 246, 0.25)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#CBD5E1', letterSpacing: '0.03em' }}>
                            DISTANCE FROM YOU:
                          </span>
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 800,
                            color: '#60A5FA',
                            background: 'rgba(59, 130, 246, 0.15)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                          }}>
                            {userToDetectionDistance < 1000 ? `${userToDetectionDistance} m` : `${(userToDetectionDistance / 1000).toFixed(2)} km`}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                      <span>Distance from you: </span>
                      <span style={{ color: '#64748B', fontStyle: 'italic' }}>Your location unavailable</span>
                      {locationError && (
                        <div style={{ color: '#F87171', fontSize: '10.5px', marginTop: '4px' }}>
                          {locationError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Investigation Radius & Geographic Context (PS 26162) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Investigation Radius Selector */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: isLight ? '#0284C7' : '#38BDF8', letterSpacing: '0.05em' }}>
                      INVESTIGATION RADIUS
                    </span>
                    <span style={{ fontSize: '10px', color: isLight ? '#64748B' : '#94A3B8' }}>
                      Around exact detection
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1000, 2000, 5000].map((rad) => {
                      const isActive = investigationRadius === rad;
                      return (
                        <button
                          key={rad}
                          onClick={() => {
                            setInvestigationRadius(rad);
                            setActiveFeature(null);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: isActive ? 700 : 500,
                            background: isActive
                              ? (isLight ? '#EFF6FF' : 'rgba(56, 189, 248, 0.22)')
                              : (isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)'),
                            border: `1px solid ${isActive ? '#38BDF8' : (isLight ? '#DCE5EE' : 'rgba(255, 255, 255, 0.08)')}`,
                            color: isActive ? '#0284C7' : (isLight ? '#64748B' : '#94A3B8'),
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {rad / 1000} km {rad === 1000 ? '(Default)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Location Context */}
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: isLight ? '#0284C7' : '#38BDF8',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  Location Context
                </div>

                {/* Resolved Administrative Area Banner */}
                <div
                  style={{
                    padding: '8px 12px',
                    background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '6px',
                    border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '12px',
                    color: isLight ? '#0F172A' : '#F8FAFC',
                    marginBottom: '10px',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, marginBottom: '2px' }}>
                    ADMINISTRATIVE REGION
                  </div>
                  {locationContext.loading ? (
                    <span style={{ color: isLight ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>Resolving spatial geography...</span>
                  ) : (
                    locationContext.resolvedAddress || formatCoordinates(selectedDetection.latitude, selectedDetection.longitude)
                  )}
                </div>

                {/* GEOGRAPHIC CONTEXT (Summary Counts from Real GIS Query) */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>GEOGRAPHIC CONTEXT</span>
                    <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>
                      Radius: {investigationRadius / 1000} km
                    </span>
                  </div>

                  {/* Active Selected Nearby Feature Card (Section 9) */}
                  {activeFeature && (
                    <div
                      style={{
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid #38BDF8',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#38BDF8', fontWeight: 800, letterSpacing: '0.04em' }}>
                            INVESTIGATED NEARBY FEATURE
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                            {activeFeature.name || (activeFeature.type === 'industrial' ? 'Unnamed industrial feature' : `Unnamed ${activeFeature.category_label || 'feature'}`)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#E2E8F0', marginTop: '3px' }}>
                            <strong>{activeFeature.category_label}</strong> &bull; <span style={{ color: '#38BDF8', fontWeight: 700 }}>
                              {activeFeature.distance_m < 1000 ? `${activeFeature.distance_m} m from detection` : `${(activeFeature.distance_m / 1000).toFixed(2)} km from detection`}
                            </span> ({activeFeature.direction})
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveFeature(null)}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '4px',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            fontSize: '11px',
                          }}
                          title="Clear feature focus"
                        >
                          ✕ Reset
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '6px',
                      marginBottom: '6px',
                    }}
                  >
                    {/* Industrial Facilities */}
                    <div style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#FDBA74', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🏭 Industrial</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.industrial || 0}
                      </div>
                    </div>

                    {/* Factories */}
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🏭 Factories</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.factories || 0}
                      </div>
                    </div>

                    {/* Roads */}
                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#BAE6FD', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🛣️ Roads</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.roads || 0}
                      </div>
                    </div>

                    {/* Buildings */}
                    <div style={{ background: 'rgba(129, 140, 248, 0.08)', border: '1px solid rgba(129, 140, 248, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#C7D2FE', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🏢 Buildings</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.buildings || 0}
                      </div>
                    </div>

                    {/* Forest / Vegetation */}
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#A7F3D0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🌳 Forest / Woodland</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.forest || 0}
                      </div>
                    </div>

                    {/* Settlements */}
                    <div style={{ background: 'rgba(192, 132, 252, 0.08)', border: '1px solid rgba(192, 132, 252, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#E9D5FF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🏘️ Settlements</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.settlements || 0}
                      </div>
                    </div>

                    {/* Water Bodies */}
                    <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#A5F3FC', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>💧 Water Bodies</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.water || 0}
                      </div>
                    </div>

                    {/* Other POIs */}
                    <div style={{ background: 'rgba(148, 163, 184, 0.08)', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '6px', padding: '6px 10px' }}>
                      <div style={{ fontSize: '10px', color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>📍 Other POIs</span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                        {gisData.summary?.other || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI-SPECIFIC INVESTIGATION EVIDENCE CARD (Sections 7, 8, 9, 17) */}
                {(() => {
                  const detClassKey = normalizeClassKey(selectedDetection.predicted_class || selectedDetection.classification);
                  const nearestIndustrial = (gisData.features || []).find((f) => f.type === 'industrial');
                  const nearestForest = (gisData.features || []).find((f) => f.type === 'forest');

                  if (detClassKey === 'industrial') {
                    return (
                      <div
                        style={{
                          background: isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.08)',
                          border: isLight ? '1px solid #FECACA' : '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: '#EF4444',
                            letterSpacing: '0.05em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '6px',
                          }}
                        >
                          <Flame size={14} />
                          <span>INDUSTRIAL CONTEXT (AI PREDICTED INDUSTRIAL FIRE)</span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#E2E8F0', lineHeight: 1.55 }}>
                          <div>
                            Nearby industrial facilities: <strong>{gisData.summary?.industrial || 0}</strong>
                          </div>
                          {nearestIndustrial ? (
                            <div style={{ marginTop: '4px' }}>
                              Nearest industrial facility: <strong style={{ color: '#FFFFFF' }}>{nearestIndustrial.name}</strong><br/>
                              Distance: <strong style={{ color: '#38BDF8' }}>
                                {nearestIndustrial.distance_m < 1000 ? `${nearestIndustrial.distance_m} m` : `${(nearestIndustrial.distance_m / 1000).toFixed(2)} km`}
                              </strong> ({nearestIndustrial.direction})
                            </div>
                          ) : (
                            <div style={{ marginTop: '4px', color: '#94A3B8', fontStyle: 'italic' }}>
                              No mapped industrial facility within {investigationRadius / 1000} km.
                            </div>
                          )}
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: '10.5px', color: '#94A3B8' }}>
                            Evidence Note: Industrial-context feature located within search perimeter. AI classification and geographic evidence remain separate observations.
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (detClassKey === 'forest') {
                    return (
                      <div
                        style={{
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: '#10B981',
                            letterSpacing: '0.05em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '6px',
                          }}
                        >
                          <Trees size={14} />
                          <span>FOREST / LAND CONTEXT (AI PREDICTED FOREST FIRE)</span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#E2E8F0', lineHeight: 1.55 }}>
                          <div>
                            Nearby forest / woodland: <strong>{gisData.summary?.forest || 0}</strong>
                          </div>
                          {nearestForest ? (
                            <div style={{ marginTop: '4px' }}>
                              Nearest forest / woodland: <strong style={{ color: '#FFFFFF' }}>{nearestForest.name}</strong><br/>
                              Distance: <strong style={{ color: '#38BDF8' }}>
                                {nearestForest.distance_m < 1000 ? `${nearestForest.distance_m} m` : `${(nearestForest.distance_m / 1000).toFixed(2)} km`}
                              </strong> ({nearestForest.direction})
                            </div>
                          ) : (
                            <div style={{ marginTop: '4px', color: '#94A3B8', fontStyle: 'italic' }}>
                              No mapped forest/woodland within {investigationRadius / 1000} km.
                            </div>
                          )}
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: '10.5px', color: '#94A3B8' }}>
                            Evidence Note: Nearby vegetation/land-use feature detected. Physical GIS evidence evaluated separately from thermal radiometry.
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (detClassKey === 'persistent') {
                    return (
                      <div
                        style={{
                          background: 'rgba(168, 85, 247, 0.08)',
                          border: '1px solid rgba(168, 85, 247, 0.35)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: '#A855F7',
                            letterSpacing: '0.05em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '6px',
                          }}
                        >
                          <Factory size={14} />
                          <span>THERMAL PERSISTENCE + GEOGRAPHIC CONTEXT</span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#E2E8F0', lineHeight: 1.55 }}>
                          <div>Persistence: <strong>High (Multi-temporal recurring signature)</strong></div>
                          <div>Nearby industrial features: <strong>{gisData.summary?.industrial || 0}</strong></div>
                          <div>Nearby factories: <strong>{gisData.summary?.factories || 0}</strong></div>
                          {nearestIndustrial && (
                            <div style={{ marginTop: '4px' }}>
                              Nearest mapped facility: <strong style={{ color: '#FFFFFF' }}>{nearestIndustrial.name}</strong><br/>
                              Distance: <strong style={{ color: '#38BDF8' }}>
                                {nearestIndustrial.distance_m < 1000 ? `${nearestIndustrial.distance_m} m` : `${(nearestIndustrial.distance_m / 1000).toFixed(2)} km`}
                              </strong> ({nearestIndustrial.direction})
                            </div>
                          )}
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: '10.5px', color: '#94A3B8' }}>
                            Evidence Note: Stationary thermal source correlated with surrounding spatial infrastructure.
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Section: NEARBY FEATURES (Compact Expandable List) */}
                <div>
                  <div
                    onClick={() => setIsFeaturesExpanded(!isFeaturesExpanded)}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      color: '#38BDF8',
                      textTransform: 'uppercase',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span>NEARBY FEATURES ({gisData.features?.length || 0})</span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      {isFeaturesExpanded ? 'Collapse ▲' : 'Expand ▼'}
                    </span>
                  </div>

                  {isFeaturesExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                      {isGisLoading ? (
                        <div style={{ fontSize: '11.5px', color: '#64748B', fontStyle: 'italic', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RefreshCw size={13} className="spin" />
                          <span>Querying real OpenStreetMap spatial features...</span>
                        </div>
                      ) : gisError ? (
                        <div
                          style={{
                            fontSize: '11.5px',
                            color: '#F87171',
                            padding: '8px 12px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                          }}
                        >
                          {gisError}
                        </div>
                      ) : gisData.features && gisData.features.length > 0 ? (
                        gisData.features.map((feat, idx) => {
                          const isFeatureSelected = activeFeature && activeFeature.id === feat.id;
                          const icon =
                            feat.type === 'industrial' ? '🏭' :
                            feat.type === 'roads' ? '🛣️' :
                            feat.type === 'forest' ? '🌳' :
                            feat.type === 'buildings' ? '🏢' :
                            feat.type === 'settlements' ? '🏘️' :
                            feat.type === 'water' ? '💧' : '📍';

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setActiveFeature(feat);
                                if (leafletMapRef.current && selectedDetection) {
                                  const detLat = parseFloat(selectedDetection.latitude);
                                  const detLon = parseFloat(selectedDetection.longitude);
                                  const bounds = L.latLngBounds([
                                    [detLat, detLon],
                                    [feat.latitude, feat.longitude],
                                  ]).pad(0.35);
                                  leafletMapRef.current.fitBounds(bounds, { maxZoom: 16, animate: true });
                                } else if (leafletMapRef.current) {
                                  leafletMapRef.current.setView([feat.latitude, feat.longitude], 16, { animate: true });
                                }
                              }}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '11.5px',
                                padding: '8px 10px',
                                background: isFeatureSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '6px',
                                border: `1px solid ${isFeatureSelected ? '#38BDF8' : 'rgba(255, 255, 255, 0.06)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                              title="Click to focus feature on map"
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '220px',
                                }}
                              >
                                <span style={{ fontSize: '13px', flexShrink: 0 }}>{icon}</span>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <div style={{ color: isFeatureSelected ? '#38BDF8' : '#FFFFFF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {feat.name}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                                    {feat.category_label}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 700,
                                    padding: '2px 5px',
                                    borderRadius: '4px',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    color: '#38BDF8',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {feat.direction}
                                </span>
                                <span style={{ color: '#F8FAFC', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>
                                  {feat.distance_m < 1000 ? `${feat.distance_m} m` : `${(feat.distance_m / 1000).toFixed(1)} km`}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div
                          style={{
                            fontSize: '11.5px',
                            color: '#64748B',
                            fontStyle: 'italic',
                            padding: '10px 12px',
                            background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '6px',
                            border: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.04)',
                            textAlign: 'center',
                          }}
                        >
                          No mapped nearby features found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Action Buttons */}
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingTop: '12px',
                  borderTop: isLight ? '1px solid #E2E8F0' : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Focus Detection Button */}
                <button
                  onClick={() => {
                    setActiveFeature(null);
                    if (leafletMapRef.current) {
                      const dlat = parseFloat(selectedDetection.latitude);
                      const dlon = parseFloat(selectedDetection.longitude);
                      if (!isNaN(dlat) && !isNaN(dlon)) {
                        leafletMapRef.current.setView([dlat, dlon], 15, { animate: true });
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '9px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid #38BDF8',
                    borderRadius: '6px',
                    color: '#38BDF8',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Target size={14} />
                  <span>FOCUS DETECTION POINT</span>
                </button>

                {/* Fit View: You & Detection (When both are available) */}
                {userLocation && selectedDetection && (
                  <button
                    onClick={() => {
                      if (leafletMapRef.current) {
                        const dlat = parseFloat(selectedDetection.latitude);
                        const dlon = parseFloat(selectedDetection.longitude);
                        const ulat = parseFloat(userLocation.latitude);
                        const ulon = parseFloat(userLocation.longitude);
                        if (!isNaN(dlat) && !isNaN(dlon) && !isNaN(ulat) && !isNaN(ulon)) {
                          const bounds = L.latLngBounds([[dlat, dlon], [ulat, ulon]]).pad(0.35);
                          leafletMapRef.current.fitBounds(bounds, { maxZoom: 16, animate: true });
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '6px',
                      color: '#60A5FA',
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Compass size={13} />
                    <span>FIT VIEW: YOU & DETECTION</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    onFocusDetection(selectedDetection);
                    onNavigate('detection-explorer');
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '9.5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'linear-gradient(90deg, #0284C7 0%, #0EA5E9 100%)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  <MapPin size={14} />
                  <span>VIEW DETAILS IN EXPLORER</span>
                </button>

                <button
                  onClick={() => {
                    onFocusDetection(selectedDetection);
                    onNavigate('gis-investigation');
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '8.5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: isLight ? '#F0F9FF' : 'rgba(255, 255, 255, 0.05)',
                    border: isLight ? '1px solid #BAE6FD' : '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    color: isLight ? '#0284C7' : '#38BDF8',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  <Target size={14} />
                  <span>INVESTIGATE LOCATION</span>
                </button>

                {/* Optional Google Street View if API key is present */}
                {import.meta.env.VITE_GOOGLE_MAPS_API_KEY &&
                  selectedDetection.latitude &&
                  selectedDetection.longitude && (
                    <button
                      onClick={() => {
                        const lat = selectedDetection.latitude;
                        const lon = selectedDetection.longitude;
                        window.open(
                          `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
                          '_blank'
                        );
                      }}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '7px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.03)',
                        border: isLight ? '1px solid #DCE5EE' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        color: isLight ? '#64748B' : '#94A3B8',
                        cursor: 'pointer',
                      }}
                    >
                      <ExternalLink size={12} />
                      <span>OPEN STREET VIEW (OPTIONAL)</span>
                    </button>
                  )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
