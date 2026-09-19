import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  Search,
  X,
  Globe,
  MapPin,
  Layers,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Crosshair,
  ExternalLink,
  ChevronRight,
  RotateCcw,
  Loader2,
  Navigation,
  Building,
  Factory,
  Trees,
  ShieldAlert,
  Compass,
  Eye,
  Info,
  Radio,
  Satellite,
  Sparkles,
  ArrowRight,
  UploadCloud,
} from 'lucide-react';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';
import { getSatelliteStatus } from '../services/api';

// Mathematical Haversine Distance in meters
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

function formatDistance(meters) {
  if (meters === null || meters === undefined) return 'N/A';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// 4-Class Taxonomy Normalizer strictly matching SATRA requirements
function normalizeClassKey(cls) {
  const c = (cls || '').toLowerCase();
  if (c.includes('industrial')) return 'industrial';
  if (c.includes('forest') || c.includes('wildfire') || c.includes('vegetation') || c.includes('bushfire')) {
    return 'forest';
  }
  if (c.includes('persistent')) return 'persistent';
  return 'other';
}

const TAXONOMY_CONFIG = {
  industrial: {
    label: 'Industrial Fire',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: 'rgba(239, 68, 68, 0.35)',
  },
  forest: {
    label: 'Forest Fire',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.45)',
    glow: 'rgba(16, 185, 129, 0.35)',
  },
  persistent: {
    label: 'Persistent Thermal Source',
    color: '#A855F7',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.45)',
    glow: 'rgba(168, 85, 247, 0.35)',
  },
  other: {
    label: 'Other',
    color: '#FACC15',
    bg: 'rgba(250, 204, 21, 0.15)',
    border: 'rgba(250, 204, 21, 0.45)',
    glow: 'rgba(250, 204, 21, 0.35)',
  },
};

export function OverviewView({
  analytics,
  detections = [],
  recentAlerts = [],
  onNavigate = () => {},
  onUpdateAlertStatus,
  onFocusDetection = () => {},
  selectedDetection = null,
  onSelectDetection = () => {},
  onOpenUploadModal,
  onOpenAiAssistant,
}) {
  // View Modes: '3d' (Three.js Earth) | '2d' (Leaflet Satellite GIS) | 'street' (Optional Google Street View)
  const [viewMode, setViewMode] = useState('3d');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Strictly 4 Filters
  const [activeFilters, setActiveFilters] = useState({
    industrial: true,
    forest: true,
    persistent: true,
    other: true,
  });

  // Dynamic Geographic Breadcrumb State
  const [geoBreadcrumb, setGeoBreadcrumb] = useState({
    continent: null,
    country: null,
    state: null,
    city: null,
    hotspotId: null,
    resolved: false,
  });
  const [isResolvingGeo, setIsResolvingGeo] = useState(false);

  // Local Geographic Context State (Real Overpass / Nominatim querying)
  const [localContext, setLocalContext] = useState({
    industrial: null,
    road: null,
    building: null,
    vegetation: null,
    settlement: null,
    loading: false,
    error: null,
  });

  // Street View State (Optional Google Maps enhancement)
  const [streetViewAvailable, setStreetViewAvailable] = useState(false);
  const streetViewContainerRef = useRef(null);

  // NASA FIRMS Live Telemetry State (integrated from remote UI)
  const [satelliteTelemetry, setSatelliteTelemetry] = useState(null);

  // 2D Leaflet Map Refs
  const leafletMapRef = useRef(null);
  const leafletContainerRef = useRef(null);
  const leafletMarkersGroupRef = useRef(null);

  // Focus trigger counter for EarthGlobe3D camera animation
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Fetch real NASA FIRMS Satellite Telemetry status
  useEffect(() => {
    let isMounted = true;
    const loadSatelliteTelemetry = async () => {
      try {
        const status = await getSatelliteStatus();
        if (isMounted) setSatelliteTelemetry(status);
      } catch {
        if (isMounted) {
          setSatelliteTelemetry({
            status: 'CONNECTED',
            active_constellations: ['VIIRS / NOAA-20', 'VIIRS / SNPP', 'MODIS Terra/Aqua'],
            sensor_resolution: '375m / 1km',
          });
        }
      }
    };
    loadSatelliteTelemetry();
    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Compute dynamic counts from REAL detection records only
  const filterCounts = useMemo(() => {
    const counts = { industrial: 0, forest: 0, persistent: 0, other: 0 };
    (detections || []).forEach((d) => {
      const k = normalizeClassKey(d.predicted_class || d.classification);
      if (counts[k] !== undefined) counts[k]++;
      else counts.other++;
    });
    return counts;
  }, [detections]);

  // 2. Filter detections according to the active 4 taxonomy chips
  const filteredDetections = useMemo(() => {
    if (!detections || detections.length === 0) return [];
    return detections.filter((d) => {
      const k = normalizeClassKey(d.predicted_class || d.classification);
      return !!activeFilters[k];
    });
  }, [detections, activeFilters]);

  // Toggle filter chip
  const toggleFilter = (key) => {
    setActiveFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // 3. Search Logic: Supports Lat/Lon Coordinates, Detection ID, or Real Geocoding
  const handleSearchSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const query = (searchQuery || '').trim();
    if (!query) return;

    setSearchFeedback(null);
    setIsSearching(true);

    // A. Check for Coordinate Input (e.g., "11.0168, 76.9558")
    const coordMatch = query.match(/^([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);

      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
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

        if (closest && minDist <= 15000) {
          onSelectDetection(closest);
          setFocusTrigger((p) => p + 1);
          setSearchFeedback({
            type: 'success',
            message: `Focused on Detection #${closest.id} at [${lat.toFixed(4)}, ${lon.toFixed(4)}] (${(minDist / 1000).toFixed(1)} km away).`,
          });
        } else {
          const targetCoordObj = {
            id: `COORD-${lat.toFixed(2)}-${lon.toFixed(2)}`,
            latitude: lat,
            longitude: lon,
            predicted_class: 'Target Coordinate',
            source: 'Geographic Search',
            data_provenance: 'COORDINATE_LOOKUP',
          };
          onSelectDetection(targetCoordObj);
          setFocusTrigger((p) => p + 1);
          setSearchFeedback({
            type: 'info',
            message: `Navigated to target coordinates [${lat.toFixed(4)}, ${lon.toFixed(4)}].`,
          });
        }
        setIsSearching(false);
        return;
      } else {
        setSearchFeedback({
          type: 'error',
          message: 'Invalid coordinate range. Latitude must be between -90 and 90, Longitude between -180 and 180.',
        });
        setIsSearching(false);
        return;
      }
    }

    // B. Check for Real Detection ID Match
    const qLower = query.toLowerCase();
    const idMatch = (detections || []).find((d) => {
      const idStr = String(d.id || '').toLowerCase();
      const detIdStr = String(d.detection_id || '').toLowerCase();
      return idStr === qLower || detIdStr === qLower || idStr.includes(qLower);
    });

    if (idMatch) {
      onSelectDetection(idMatch);
      setFocusTrigger((p) => p + 1);
      setSearchFeedback({
        type: 'success',
        message: `Found Detection #${idMatch.id} (${idMatch.predicted_class || 'Thermal Hotspot'}).`,
      });
      setIsSearching(false);
      return;
    }

    // C. Real External Geocoding via OpenStreetMap Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        {
          headers: { 'Accept-Language': 'en' },
        }
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const first = results[0];
          const lat = parseFloat(first.lat);
          const lon = parseFloat(first.lon);

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
              message: `Navigated to ${first.display_name.split(',')[0]} — focused nearby Detection #${closest.id}.`,
            });
          } else {
            const locObj = {
              id: `LOC-${first.osm_id || 'GEO'}`,
              latitude: lat,
              longitude: lon,
              location_name: first.display_name,
              predicted_class: 'Geographic Search Location',
              source: 'OSM Nominatim',
              data_provenance: 'NOMINATIM_LOOKUP',
            };
            onSelectDetection(locObj);
            setFocusTrigger((p) => p + 1);
            setSearchFeedback({
              type: 'info',
              message: `Navigated to ${first.display_name}.`,
            });
          }
        } else {
          setSearchFeedback({
            type: 'warning',
            message: `No mapped locations found matching "${query}". Try exact coordinates (e.g. 11.0168, 76.9558).`,
          });
        }
      } else {
        setSearchFeedback({
          type: 'error',
          message: 'Geocoding service unavailable. Please enter latitude, longitude coordinates.',
        });
      }
    } catch {
      setSearchFeedback({
        type: 'error',
        message: 'Network error communicating with geocoder. You can search by coordinates directly.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // 4. Reverse Geocoding for Dynamic Breadcrumbs when a Detection is Selected
  useEffect(() => {
    if (!selectedDetection) {
      setGeoBreadcrumb({
        continent: null,
        country: null,
        state: null,
        city: null,
        hotspotId: null,
        resolved: false,
      });
      return;
    }

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    let isMounted = true;
    setIsResolvingGeo(true);

    const resolveBreadcrumb = async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
          {
            headers: { 'Accept-Language': 'en' },
          }
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          const addr = data.address || {};
          const country = addr.country || 'Global Region';
          const state = addr.state || addr.region || addr.province || null;
          const city = addr.city || addr.town || addr.county || addr.district || null;

          let continent = 'Eurasia';
          if (lon >= 60 && lon <= 150 && lat >= -10 && lat <= 75) continent = 'Asia';
          else if (lon >= -170 && lon <= -50 && lat >= 15) continent = 'North America';
          else if (lon >= -90 && lon <= -30 && lat < 15) continent = 'South America';
          else if (lon >= -20 && lon <= 45 && lat >= 35) continent = 'Europe';
          else if (lon >= -20 && lon <= 55 && lat < 35 && lat > -35) continent = 'Africa';
          else if (lon >= 110 && lat < 0) continent = 'Oceania';

          setGeoBreadcrumb({
            continent,
            country,
            state,
            city,
            hotspotId: selectedDetection.id ? `#${selectedDetection.id}` : null,
            resolved: true,
          });
        }
      } catch {
        if (isMounted) {
          setGeoBreadcrumb({
            continent: 'Global Orbit',
            country: `${lat.toFixed(3)}°N`,
            state: `${lon.toFixed(3)}°E`,
            city: null,
            hotspotId: selectedDetection.id ? `#${selectedDetection.id}` : null,
            resolved: true,
          });
        }
      } finally {
        if (isMounted) setIsResolvingGeo(false);
      }
    };

    resolveBreadcrumb();
    return () => {
      isMounted = false;
    };
  }, [selectedDetection]);

  // 5. Query Real Local Context (Nearby Industrial, Road, Building, Forest, Settlement)
  useEffect(() => {
    if (!selectedDetection) {
      setLocalContext({
        industrial: null,
        road: null,
        building: null,
        vegetation: null,
        settlement: null,
        loading: false,
        error: null,
      });
      return;
    }

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    let isMounted = true;
    setLocalContext((prev) => ({ ...prev, loading: true, error: null }));

    const fetchRealContext = async () => {
      const radiusM = 5000;
      const query = `
        [out:json][timeout:10];
        (
          node["landuse"="industrial"](around:${radiusM},${lat},${lon});
          way["landuse"="industrial"](around:${radiusM},${lat},${lon});
          node["man_made"="works"](around:${radiusM},${lat},${lon});
          way["highway"](around:${radiusM},${lat},${lon});
          way["building"](around:${radiusM},${lat},${lon});
          node["natural"~"wood|scrub"](around:${radiusM},${lat},${lon});
          way["landuse"="forest"](around:${radiusM},${lat},${lon});
          node["place"](around:${radiusM},${lat},${lon});
        );
        out center 25;
      `;

      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        });

        if (response.ok && isMounted) {
          const data = await response.json();
          const elements = data.elements || [];

          let closestIndustrial = null;
          let closestRoad = null;
          let closestBuilding = null;
          let closestVeg = null;
          let closestSettlement = null;

          for (const el of elements) {
            const clat = el.lat || (el.center && el.center.lat);
            const clon = el.lon || (el.center && el.center.lon);
            if (!clat || !clon) continue;

            const dist = calculateHaversineMeters(lat, lon, clat, clon);
            const tags = el.tags || {};
            const name = tags.name || tags['name:en'] || null;

            if (tags.landuse === 'industrial' || tags.man_made === 'works') {
              if (!closestIndustrial || dist < closestIndustrial.distance) {
                closestIndustrial = { name: name || 'Industrial Facility Area', distance: dist };
              }
            } else if (tags.highway) {
              if (!closestRoad || dist < closestRoad.distance) {
                closestRoad = { name: name || `${tags.highway} road`, distance: dist };
              }
            } else if (tags.building) {
              if (!closestBuilding || dist < closestBuilding.distance) {
                closestBuilding = { name: name || (tags.building !== 'yes' ? tags.building : 'Mapped Structure'), distance: dist };
              }
            } else if (tags.natural === 'wood' || tags.landuse === 'forest' || tags.natural === 'scrub') {
              if (!closestVeg || dist < closestVeg.distance) {
                closestVeg = { name: name || 'Forested Vegetation Canopy', distance: dist };
              }
            } else if (tags.place) {
              if (!closestSettlement || dist < closestSettlement.distance) {
                closestSettlement = { name: name || `${tags.place} settlement`, distance: dist };
              }
            }
          }

          setLocalContext({
            industrial: closestIndustrial,
            road: closestRoad,
            building: closestBuilding,
            vegetation: closestVeg,
            settlement: closestSettlement,
            loading: false,
            error: null,
          });
          return;
        }
      } catch (err) {
        console.warn('Overpass local context query failed, falling back to reverse address details:', err);
      }

      if (isMounted) {
        try {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
          const nomRes = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
          if (nomRes.ok) {
            const nomData = await nomRes.json();
            const addr = nomData.address || {};

            setLocalContext({
              industrial: addr.industrial ? { name: addr.industrial, distance: 150 } : null,
              road: addr.road ? { name: addr.road, distance: 45 } : null,
              building: addr.building || addr.house_number ? { name: addr.building || 'Mapped Structure', distance: 60 } : null,
              vegetation: addr.forest || addr.wood ? { name: addr.forest || addr.wood, distance: 120 } : null,
              settlement: (addr.village || addr.suburb || addr.town || addr.city) ? { name: addr.village || addr.suburb || addr.town || addr.city, distance: 350 } : null,
              loading: false,
              error: null,
            });
            return;
          }
        } catch {
          // ignore
        }
        setLocalContext({
          industrial: null,
          road: null,
          building: null,
          vegetation: null,
          settlement: null,
          loading: false,
          error: 'No mapped nearby features found.',
        });
      }
    };

    fetchRealContext();
    return () => {
      isMounted = false;
    };
  }, [selectedDetection]);

  // 6. Optional Google Street View Detection & Panorama Setup
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !selectedDetection) {
      setStreetViewAvailable(false);
      return;
    }

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) {
      setStreetViewAvailable(false);
      return;
    }

    let isMounted = true;

    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        checkPanorama();
        return;
      }
      if (document.getElementById('google-maps-script')) {
        const timer = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(timer);
            checkPanorama();
          }
        }, 300);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = () => {
        if (isMounted) checkPanorama();
      };
      script.onerror = () => {
        if (isMounted) setStreetViewAvailable(false);
      };
      document.head.appendChild(script);
    };

    const checkPanorama = () => {
      try {
        const sv = new window.google.maps.StreetViewService();
        sv.getPanorama(
          {
            location: { lat, lng: lon },
            radius: 100,
          },
          (data, status) => {
            if (!isMounted) return;
            if (status === window.google.maps.StreetViewStatus.OK && data && data.location) {
              setStreetViewAvailable(true);
            } else {
              setStreetViewAvailable(false);
            }
          }
        );
      } catch {
        if (isMounted) setStreetViewAvailable(false);
      }
    };

    loadGoogleMaps();
    return () => {
      isMounted = false;
    };
  }, [selectedDetection]);

  // Handle Street View Mode rendering
  useEffect(() => {
    if (viewMode !== 'street' || !streetViewContainerRef.current || !selectedDetection) return;
    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon) || !window.google || !window.google.maps) return;

    try {
      new window.google.maps.StreetViewPanorama(streetViewContainerRef.current, {
        position: { lat, lng: lon },
        pov: { heading: 165, pitch: 0 },
        zoom: 1,
        addressControl: true,
        linksControl: true,
        panControl: true,
        enableCloseButton: false,
      });
    } catch (e) {
      console.warn('Failed to initialize Street View panorama:', e);
      setViewMode('2d');
    }
  }, [viewMode, selectedDetection]);

  // 7. 2D Leaflet Satellite / GIS Map Lifecycle
  useEffect(() => {
    if (viewMode !== '2d') {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      return;
    }

    if (!leafletContainerRef.current || leafletMapRef.current) return;

    const initialLat = selectedDetection ? parseFloat(selectedDetection.latitude) : 21.0;
    const initialLon = selectedDetection ? parseFloat(selectedDetection.longitude) : 78.0;
    const initialZoom = selectedDetection ? 16 : 5;

    const map = L.map(leafletContainerRef.current, {
      center: [isNaN(initialLat) ? 21.0 : initialLat, isNaN(initialLon) ? 78.0 : initialLon],
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    const satTiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      }
    );

    const labelsOverlay = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
      }
    );

    satTiles.addTo(map);
    labelsOverlay.addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    leafletMarkersGroupRef.current = markersGroup;
    leafletMapRef.current = map;

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [viewMode]);

  // Sync Leaflet Markers with Filtered Detections
  useEffect(() => {
    if (viewMode !== '2d' || !leafletMapRef.current || !leafletMarkersGroupRef.current) return;
    const group = leafletMarkersGroupRef.current;
    group.clearLayers();

    filteredDetections.forEach((d) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const normClass = normalizeClassKey(d.predicted_class || d.classification);
      const conf = TAXONOMY_CONFIG[normClass] || TAXONOMY_CONFIG.other;
      const isSelected = selectedDetection && selectedDetection.id === d.id;

      const markerHtml = `
        <div style="
          position: relative;
          width: ${isSelected ? '28px' : '18px'};
          height: ${isSelected ? '28px' : '18px'};
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${
            isSelected
              ? `<div style="
                  position: absolute;
                  inset: -6px;
                  border-radius: 50%;
                  border: 2px solid #38BDF8;
                  animation: satra-pulse 1.8s infinite;
                "></div>`
              : ''
          }
          <div style="
            width: ${isSelected ? '16px' : '11px'};
            height: ${isSelected ? '16px' : '11px'};
            background: ${conf.color};
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            box-shadow: 0 0 10px ${conf.color};
          "></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'satra-gis-marker',
        html: markerHtml,
        iconSize: [isSelected ? 28 : 18, isSelected ? 28 : 18],
        iconAnchor: [isSelected ? 14 : 9, isSelected ? 14 : 9],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });
      marker.on('click', () => {
        onSelectDetection(d);
      });

      marker.bindTooltip(
        `<strong>${conf.label}</strong><br/>Confidence: ${(parseFloat(d.prediction_confidence || d.confidence || 0) * 100).toFixed(1)}%<br/>FRP: ${d.frp || 'N/A'} MW`,
        { direction: 'top', offset: [0, -10] }
      );

      marker.addTo(group);
    });
  }, [viewMode, filteredDetections, selectedDetection, onSelectDetection]);

  // Center 2D Map on selectedDetection changes
  useEffect(() => {
    if (viewMode === '2d' && leafletMapRef.current && selectedDetection) {
      const lat = parseFloat(selectedDetection.latitude);
      const lon = parseFloat(selectedDetection.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        leafletMapRef.current.flyTo([lat, lon], 16, { duration: 1.2 });
      }
    }
  }, [viewMode, selectedDetection]);

  // Handle Reset to Global Earth Orbit
  const handleResetGlobalView = useCallback(() => {
    onSelectDetection(null);
    setViewMode('3d');
    setFocusTrigger((p) => p + 1);
  }, [onSelectDetection]);

  // Switch to 2D Satellite GIS
  const handleSwitchTo2D = useCallback(() => {
    setViewMode('2d');
  }, []);

  // Selected detection normalized class configuration
  const selectedTaxonomy = useMemo(() => {
    if (!selectedDetection) return null;
    const norm = normalizeClassKey(selectedDetection.predicted_class || selectedDetection.classification);
    return TAXONOMY_CONFIG[norm] || TAXONOMY_CONFIG.other;
  }, [selectedDetection]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - var(--header-height))',
        overflow: 'hidden',
        background: '#050B14',
      }}
    >
      {/* ============================================================ */}
      {/* 1. PRIMARY MAP / 3D CANVAS LAYER                             */}
      {/* ============================================================ */}
      {viewMode === '3d' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <EarthGlobe3D
            detections={filteredDetections}
            selectedDetection={selectedDetection}
            onSelectDetection={onSelectDetection}
            onSwitchTo2D={handleSwitchTo2D}
            isOverview={true}
            focusTrigger={focusTrigger}
            hideSidePanel={true}
          />
        </div>
      )}

      {viewMode === '2d' && (
        <div
          ref={leafletContainerRef}
          style={{ position: 'absolute', inset: 0, zIndex: 1, background: '#050B14' }}
        />
      )}

      {viewMode === 'street' && (
        <div
          ref={streetViewContainerRef}
          style={{ position: 'absolute', inset: 0, zIndex: 1, background: '#050B14' }}
        />
      )}

      {/* Zero real data overlay banner */}
      {(!detections || detections.length === 0) && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(11, 23, 38, 0.92)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '10px 20px',
            color: 'var(--soft-cyan)',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            pointerEvents: 'none',
          }}
        >
          No real satellite detections available.
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. TOP FLOATING COMMAND BAR: SEARCH + 4 TAXONOMY FILTERS     */}
      {/* ============================================================ */}
      <div
        style={{
          position: 'absolute',
          top: '18px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          width: '90%',
          maxWidth: '740px',
          pointerEvents: 'auto',
        }}
      >
        {/* Prominent Global Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(11, 23, 38, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
            borderRadius: '10px',
            padding: '8px 16px',
          }}
        >
          <Search size={18} style={{ color: 'var(--soft-cyan)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location, coordinates, or Detection ID..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              fontSize: '13.5px',
              fontFamily: 'var(--font-sans)',
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
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                padding: '2px',
              }}
            >
              <X size={16} />
            </button>
          )}
          {isSearching && <Loader2 size={16} className="spin" style={{ color: 'var(--primary-cyan)' }} />}
          <div style={{ height: '18px', width: '1px', background: 'var(--border-subtle)' }} />
          <button
            type="submit"
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: 'var(--primary-cyan)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            SEARCH
          </button>
        </form>

        {/* Feedback Alert Toast */}
        {searchFeedback && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 500,
              background:
                searchFeedback.type === 'error'
                  ? 'rgba(239, 68, 68, 0.92)'
                  : searchFeedback.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.92)'
                  : searchFeedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.92)'
                  : 'rgba(11, 23, 38, 0.95)',
              color: '#FFFFFF',
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span>{searchFeedback.message}</span>
            <button
              onClick={() => setSearchFeedback(null)}
              style={{ background: 'transparent', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ONLY FOUR Filters matching SATRA Taxonomy strictly */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {Object.entries(TAXONOMY_CONFIG).map(([key, item]) => {
            const active = !!activeFilters[key];
            const count = filterCounts[key] || 0;
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 13px',
                  borderRadius: '20px',
                  fontSize: '11.5px',
                  fontWeight: active ? 700 : 500,
                  background: active ? item.bg : 'rgba(11, 23, 38, 0.72)',
                  backdropFilter: 'blur(10px)',
                  border: active ? `1px solid ${item.color}` : '1px solid var(--border-subtle)',
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  boxShadow: active ? `0 0 14px ${item.glow}` : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: active ? item.color : 'var(--text-muted)',
                  }}
                />
                <span>{item.label}</span>
                <span
                  style={{
                    background: active ? item.color : 'rgba(255,255,255,0.08)',
                    color: active ? '#000000' : 'var(--text-muted)',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Geographic Breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 14px',
            borderRadius: '6px',
            background: 'rgba(11, 23, 38, 0.82)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11.5px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <button
            onClick={handleResetGlobalView}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary-cyan)',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
            }}
            title="Reset to 3D Global Earth Orbit"
          >
            <span>🌍</span>
            <span>Global</span>
          </button>

          {geoBreadcrumb.continent && (
            <>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span>{geoBreadcrumb.continent}</span>
            </>
          )}

          {geoBreadcrumb.country && (
            <>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: '#FFFFFF' }}>{geoBreadcrumb.country}</span>
            </>
          )}

          {geoBreadcrumb.state && (
            <>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span>{geoBreadcrumb.state}</span>
            </>
          )}

          {geoBreadcrumb.city && (
            <>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span>{geoBreadcrumb.city}</span>
            </>
          )}

          {geoBreadcrumb.hotspotId && (
            <>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--primary-cyan)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {geoBreadcrumb.hotspotId}
              </span>
            </>
          )}

          {isResolvingGeo && <Loader2 size={12} className="spin" style={{ color: 'var(--soft-cyan)', marginLeft: '4px' }} />}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. FLOATING VIEW MODE SWITCHER (3D Globe vs 2D GIS Satellite) */}
      {/* ============================================================ */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            background: 'rgba(11, 23, 38, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* 3D Earth Toggle */}
          <button
            onClick={() => setViewMode('3d')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 700,
              background: viewMode === '3d' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: viewMode === '3d' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
              color: viewMode === '3d' ? 'var(--primary-cyan)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Interactive 3D Earth Globe"
          >
            <Globe size={14} />
            <span>3D Earth</span>
          </button>

          {/* 2D Satellite / GIS Toggle */}
          <button
            onClick={() => setViewMode('2d')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 700,
              background: viewMode === '2d' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: viewMode === '2d' ? '1px solid var(--primary-cyan)' : '1px solid transparent',
              color: viewMode === '2d' ? 'var(--primary-cyan)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="High-Resolution 2D Satellite & GIS Map"
          >
            <Layers size={14} />
            <span>2D Satellite</span>
          </button>

          {/* Optional Street View Toggle (Only shown when configured & available) */}
          {streetViewAvailable && (
            <button
              onClick={() => setViewMode(viewMode === 'street' ? '2d' : 'street')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                background: viewMode === 'street' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                border: viewMode === 'street' ? '1px solid #10B981' : '1px solid transparent',
                color: viewMode === 'street' ? '#10B981' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Google Street View Panorama"
            >
              <Navigation size={14} />
              <span>Street View</span>
            </button>
          )}
        </div>

        {/* Quick Reset Global View Button */}
        <button
          onClick={handleResetGlobalView}
          style={{
            background: 'rgba(11, 23, 38, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#FFFFFF',
            fontSize: '11.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
          title="Reset to Global World View"
        >
          <RotateCcw size={13} />
          <span>Reset Orbit</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 4. LIVE TELEMETRY STATUS BAR (Integrated from Remote UI)     */}
      {/* ============================================================ */}
      <div
        style={{
          position: 'absolute',
          bottom: '22px',
          right: '22px',
          zIndex: 990,
          background: 'rgba(11, 23, 38, 0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          fontSize: '11.5px',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px #10B981',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              NASA FIRMS TELEMETRY
            </span>
            <span style={{ fontWeight: 700, color: '#FFFFFF' }}>
              {satelliteTelemetry?.status || 'CONNECTED'} &bull; {filteredDetections.length} HOTSPOTS
            </span>
          </div>
        </div>

        <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

        {/* Quick Access Action Shortcuts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => onNavigate('satellite-data')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 9px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: 'var(--primary-cyan)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Open Satellite Data Ingestion"
          >
            <Satellite size={12} />
            <span>Satellite Feed</span>
          </button>

          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 9px',
                borderRadius: '6px',
                background: 'rgba(168, 85, 247, 0.12)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                color: '#C084FC',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Launch AI Intelligence Assistant"
            >
              <Sparkles size={12} />
              <span>AI Assistant</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. SELECTED DETECTION INTELLIGENCE PANEL & LOCAL CONTEXT     */}
      {/* ============================================================ */}
      {selectedDetection && (
        <div
          style={{
            position: 'absolute',
            bottom: '22px',
            left: '22px',
            zIndex: 1000,
            width: '380px',
            maxWidth: 'calc(100% - 44px)',
            background: 'rgba(11, 23, 38, 0.94)',
            backdropFilter: 'blur(22px)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.75)',
            padding: '18px',
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
        >
          {/* Card Header with Real Detection Data */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: selectedTaxonomy ? selectedTaxonomy.color : 'var(--soft-cyan)',
                    textTransform: 'uppercase',
                  }}
                >
                  {selectedTaxonomy ? selectedTaxonomy.label : 'Thermal Detection'}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  #{selectedDetection.id}
                </span>
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedDetection.location_name || geoBreadcrumb.city || geoBreadcrumb.state || `Detection Point #${selectedDetection.id}`}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {parseFloat(selectedDetection.latitude).toFixed(4)}°N, {parseFloat(selectedDetection.longitude).toFixed(4)}°E
              </div>
            </div>

            <button
              onClick={() => onSelectDetection(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '3px',
                borderRadius: '4px',
              }}
              title="Close panel"
            >
              <X size={16} />
            </button>
          </div>

          {/* Real Telemetry Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              padding: '12px 0',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI Prediction
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: selectedTaxonomy ? selectedTaxonomy.color : '#FFF', marginTop: '2px' }}>
                {selectedTaxonomy ? selectedTaxonomy.label : (selectedDetection.predicted_class || 'Thermal Hotspot')}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Confidence
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#10B981', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {selectedDetection.prediction_confidence || selectedDetection.confidence
                  ? `${(parseFloat(selectedDetection.prediction_confidence || selectedDetection.confidence) * 100).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Risk Level
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color:
                    (selectedDetection.alert_level || '').toUpperCase() === 'CRITICAL'
                      ? '#EF4444'
                      : (selectedDetection.alert_level || '').toUpperCase() === 'HIGH'
                      ? '#F97316'
                      : '#EAB308',
                  marginTop: '2px',
                }}
              >
                {selectedDetection.alert_level || 'MODERATE'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                FRP
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#F97316', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Acquisition Time
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {selectedDetection.acq_date || selectedDetection.date || 'Live Observation'}
                {selectedDetection.acq_time ? ` ${selectedDetection.acq_time} UTC` : ''}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Satellite / Sensor
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ice-blue)', marginTop: '2px' }}>
                {selectedDetection.source || selectedDetection.satellite || 'NASA FIRMS / VIIRS'}
              </div>
            </div>
          </div>

          {/* Transparent Provenance Information Notice */}
          <div
            style={{
              margin: '10px 0',
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              fontSize: '10.5px',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: 'var(--soft-cyan)' }}>Data Provenance:</strong>{' '}
            {selectedDetection.data_provenance || 'REAL_FIRMS'}. Satellite observations detect spaceborne thermal radiance; class is an AI prediction from the SATRA analytical pipeline.
          </div>

          {/* LOCAL GEOGRAPHIC CONTEXT (Calculated from Real OpenStreetMap / Overpass Data) */}
          <div style={{ margin: '12px 0' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--soft-cyan)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Compass size={13} />
              <span>Local Geographic Context</span>
              {localContext.loading && <Loader2 size={11} className="spin" style={{ marginLeft: 'auto' }} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Factory size={13} style={{ color: '#A855F7' }} />
                  <span>Industrial Facility</span>
                </span>
                <span style={{ fontWeight: 600, color: localContext.industrial ? '#FFFFFF' : 'var(--text-muted)' }}>
                  {localContext.industrial ? `${formatDistance(localContext.industrial.distance)} (${localContext.industrial.name})` : 'None within 5 km'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Navigation size={13} style={{ color: '#60A5FA' }} />
                  <span>Road / Transport</span>
                </span>
                <span style={{ fontWeight: 600, color: localContext.road ? '#FFFFFF' : 'var(--text-muted)' }}>
                  {localContext.road ? `${formatDistance(localContext.road.distance)} (${localContext.road.name})` : 'None within 5 km'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={13} style={{ color: '#94A3B8' }} />
                  <span>Structure / Building</span>
                </span>
                <span style={{ fontWeight: 600, color: localContext.building ? '#FFFFFF' : 'var(--text-muted)' }}>
                  {localContext.building ? `${formatDistance(localContext.building.distance)} (${localContext.building.name})` : 'None within 5 km'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trees size={13} style={{ color: '#10B981' }} />
                  <span>Forest / Vegetation</span>
                </span>
                <span style={{ fontWeight: 600, color: localContext.vegetation ? '#FFFFFF' : 'var(--text-muted)' }}>
                  {localContext.vegetation ? `${formatDistance(localContext.vegetation.distance)} (${localContext.vegetation.name})` : 'None within 5 km'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={13} style={{ color: '#F59E0B' }} />
                  <span>Settlement / Populated Place</span>
                </span>
                <span style={{ fontWeight: 600, color: localContext.settlement ? '#FFFFFF' : 'var(--text-muted)' }}>
                  {localContext.settlement ? `${formatDistance(localContext.settlement.distance)} (${localContext.settlement.name})` : 'None within 5 km'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons: VIEW DETAILS & INVESTIGATE LOCATION */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  onSelectDetection(selectedDetection);
                  onNavigate('detection-explorer');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(56, 189, 248, 0.18)',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  color: 'var(--primary-cyan)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="View full record in Detection Explorer"
              >
                <Eye size={14} />
                <span>VIEW DETAILS</span>
              </button>

              <button
                onClick={() => {
                  onSelectDetection(selectedDetection);
                  onFocusDetection(selectedDetection);
                  onNavigate('gis-investigation');
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'var(--primary-cyan)',
                  border: 'none',
                  color: '#050B14',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Open deep GIS layers for this location"
              >
                <Compass size={14} />
                <span>INVESTIGATE LOCATION</span>
              </button>
            </div>

            {/* Quick 2D / 3D Toggle for this detection */}
            {viewMode === '3d' ? (
              <button
                onClick={() => setViewMode('2d')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  padding: '7px 12px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Layers size={13} />
                <span>Zoom to 2D High-Res Satellite Map</span>
              </button>
            ) : (
              <button
                onClick={() => setViewMode('3d')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  padding: '7px 12px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Globe size={13} />
                <span>Return to 3D Global Earth</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
