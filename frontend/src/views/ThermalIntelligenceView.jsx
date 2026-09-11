import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Flame,
  Activity,
  Zap,
  Radio,
  Satellite,
  Sun,
  Moon,
  Info,
  Layers,
  TrendingUp,
  Download,
  RefreshCw,
  Search,
  Filter,
  Maximize2,
  Minimize2,
  RotateCcw,
  Compass,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
  TreePine,
  Factory,
} from 'lucide-react';
import { KpiCard } from '../components/KpiCard';
import { ClassBadge, StatusBadge, ProvenanceBadge } from '../components/StatusBadge';
import { getSatelliteStatus } from '../services/api';

// Helper: FRP intensity classification (Low -> Yellow, Medium -> Orange, High -> Red)
function getFrpTier(frpValue) {
  const v = parseFloat(frpValue) || 0;
  if (v >= 50) return { key: 'HIGH', label: 'High (≥ 50 MW)', color: '#EF4444', radius: 9 };
  if (v >= 20) return { key: 'MEDIUM', label: 'Medium (20 - 50 MW)', color: '#F97316', radius: 7 };
  return { key: 'LOW', label: 'Low (< 20 MW)', color: '#FACC15', radius: 5 };
}

// Helper: Format coordinate string
function formatCoords(lat, lon) {
  const nLat = parseFloat(lat);
  const nLon = parseFloat(lon);
  if (isNaN(nLat) || isNaN(nLon)) return 'Unknown';
  const latDir = nLat >= 0 ? 'N' : 'S';
  const lonDir = nLon >= 0 ? 'E' : 'W';
  return `${Math.abs(nLat).toFixed(4)}° ${latDir}, ${Math.abs(nLon).toFixed(4)}° ${lonDir}`;
}

export function ThermalIntelligenceView({
  detections = [],
  analytics,
  onFocusDetection,
  selectedDetection = null,
  onSelectDetection = () => {},
  onNavigate = () => {},
  onRefresh = () => {},
  isBackendHealthy = true,
}) {
  // --------------------------------------------------------------------------
  // 1. Dynamic System Clock (UTC & Browser Local Time)
  // --------------------------------------------------------------------------
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedUtc = useMemo(() => {
    return currentDateTime.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  }, [currentDateTime]);

  // --------------------------------------------------------------------------
  // NASA FIRMS Live Connection & Satellite Layer State
  // --------------------------------------------------------------------------
  const [firmsStatus, setFirmsStatus] = useState(null);
  const [activeLayer, setActiveLayer] = useState('nasa_viirs'); // 'nasa_viirs' | 'nasa_modis' | 'satellite_hires'
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [searchMessage, setSearchMessage] = useState(null);
  const baseTileLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);

  const loadFirmsStatus = useCallback(async () => {
    try {
      const res = await getSatelliteStatus();
      setFirmsStatus(res);
    } catch (e) {
      console.warn('Failed to load NASA FIRMS status:', e);
    }
  }, []);

  useEffect(() => {
    loadFirmsStatus();
  }, [loadFirmsStatus, isBackendHealthy]);

  // --------------------------------------------------------------------------
  // 2. Synchronized Filter State
  // --------------------------------------------------------------------------
  const [classFilter, setClassFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [satelliteFilter, setSatelliteFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'today' | '7d' | '30d'
  const [frpTierFilter, setFrpTierFilter] = useState('ALL'); // 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  const [searchQuery, setSearchQuery] = useState('');

  // Active Detection ID (derived from prop or local selection)
  const [activeDetectionId, setActiveDetectionId] = useState(() => selectedDetection?.id || null);

  useEffect(() => {
    if (selectedDetection?.id) {
      setActiveDetectionId(selectedDetection.id);
    }
  }, [selectedDetection]);

  const handleSelectDetection = useCallback((detection) => {
    setActiveDetectionId(detection.id);
    onSelectDetection(detection);
  }, [onSelectDetection]);

  // Reset all active filters
  const resetFilters = () => {
    setClassFilter('ALL');
    setRiskFilter('ALL');
    setSatelliteFilter('ALL');
    setTimeFilter('all');
    setFrpTierFilter('ALL');
    setSearchQuery('');
  };

  const isAnyFilterActive =
    classFilter !== 'ALL' ||
    riskFilter !== 'ALL' ||
    satelliteFilter !== 'ALL' ||
    timeFilter !== 'all' ||
    frpTierFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  // --------------------------------------------------------------------------
  // 3. Filter Execution
  // --------------------------------------------------------------------------
  const filteredDetections = useMemo(() => {
    const now = new Date();

    return detections.filter((d) => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const idStr = String(d.id || '');
        const clsStr = (d.predicted_class || '').toLowerCase();
        const srcStr = (d.source || d.instrument || '').toLowerCase();
        const coordsStr = `${d.latitude},${d.longitude}`;
        if (!idStr.includes(q) && !clsStr.includes(q) && !srcStr.includes(q) && !coordsStr.includes(q)) {
          return false;
        }
      }

      // Classification Filter
      if (classFilter !== 'ALL') {
        const cls = (d.predicted_class || '').toLowerCase();
        if (classFilter === 'Industrial Fire' && !cls.includes('industrial')) return false;
        if (classFilter === 'Forest Fire' && !cls.includes('forest') && !cls.includes('wildfire')) return false;
        if (classFilter === 'Persistent Thermal Source' && !cls.includes('persistent') && !cls.includes('flare')) return false;
        if (classFilter === 'Other' && (cls.includes('industrial') || cls.includes('forest') || cls.includes('persistent') || cls.includes('flare'))) return false;
      }

      // Risk Filter
      if (riskFilter !== 'ALL') {
        const risk = (d.alert_level || 'MEDIUM').toUpperCase();
        if (risk !== riskFilter) return false;
      }

      // Satellite Filter
      if (satelliteFilter !== 'ALL') {
        const satStr = `${d.source || ''} ${d.instrument || ''} ${d.satellite || ''}`.toUpperCase();
        if (satelliteFilter === 'VIIRS' && !satStr.includes('VIIRS')) return false;
        if (satelliteFilter === 'MODIS' && !satStr.includes('MODIS')) return false;
      }

      // FRP Tier Filter
      if (frpTierFilter !== 'ALL') {
        const tier = getFrpTier(d.frp);
        if (tier.key !== frpTierFilter) return false;
      }

      // Time Filter
      if (timeFilter !== 'all') {
        let detectionDate = null;
        if (d.acq_date) {
          detectionDate = new Date(d.acq_date);
        } else if (d.created_at) {
          detectionDate = new Date(d.created_at);
        }

        if (detectionDate && !isNaN(detectionDate.getTime())) {
          const diffDays = (now.getTime() - detectionDate.getTime()) / (1000 * 3600 * 24);
          if (timeFilter === 'today' && diffDays > 1.5) return false;
          if (timeFilter === '7d' && diffDays > 7.5) return false;
          if (timeFilter === '30d' && diffDays > 30.5) return false;
        }
      }

      return true;
    });
  }, [detections, searchQuery, classFilter, riskFilter, satelliteFilter, frpTierFilter, timeFilter]);

  // Selected Detection Object
  const currentSelectedDetection = useMemo(() => {
    if (!activeDetectionId) {
      return filteredDetections[0] || detections[0] || null;
    }
    return detections.find((d) => d.id === activeDetectionId) || filteredDetections[0] || null;
  }, [activeDetectionId, detections, filteredDetections]);

  // --------------------------------------------------------------------------
  // 4. KPI Calculations (Exact Real Counts, No Fake Percentages)
  // --------------------------------------------------------------------------
  const totalCount = filteredDetections.length;
  const forestCount = useMemo(() => {
    return filteredDetections.filter((d) => {
      const c = (d.predicted_class || '').toLowerCase();
      return c.includes('forest') || c.includes('wildfire');
    }).length;
  }, [filteredDetections]);

  const industrialCount = useMemo(() => {
    return filteredDetections.filter((d) => {
      const c = (d.predicted_class || '').toLowerCase();
      return c.includes('industrial');
    }).length;
  }, [filteredDetections]);

  const persistentCount = useMemo(() => {
    return filteredDetections.filter((d) => {
      const c = (d.predicted_class || '').toLowerCase();
      return c.includes('persistent') || c.includes('flare') || c.includes('smelter');
    }).length;
  }, [filteredDetections]);

  const otherCount = totalCount - forestCount - industrialCount - persistentCount;

  // Cumulative FRP
  const frpValues = useMemo(() => {
    return filteredDetections
      .map((d) => parseFloat(d.frp))
      .filter((v) => !isNaN(v) && v > 0);
  }, [filteredDetections]);

  const totalFrp = frpValues.reduce((a, b) => a + b, 0).toFixed(1);
  const peakFrp = frpValues.length ? Math.max(...frpValues).toFixed(1) : '0.0';
  const avgFrp = frpValues.length ? (totalFrp / frpValues.length).toFixed(1) : '0.0';

  // --------------------------------------------------------------------------
  // 5. Global Thermal Activity Map (Leaflet Integration)
  // --------------------------------------------------------------------------
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [mapZoomLevel, setMapZoomLevel] = useState(3);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  // Initialize Map with NASA GIBS Satellite Imagery (No CARTO dependency)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Aerospace Geographic Center: Centered over South Asia / Indian Ocean
    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
    });

    // 1. Primary NASA GIBS True Color Satellite Layer (VIIRS SNPP TrueColor 375m)
    const gibsViirsTiles = L.tileLayer(
      'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
      {
        subdomains: 'abc',
        maxNativeZoom: 9,
        maxZoom: 18,
        className: 'nasa-gibs-viirs-tiles',
      }
    );

    gibsViirsTiles.on('tileerror', (e) => {
      if (e.tile) e.tile.style.display = 'none';
    });
    gibsViirsTiles.addTo(map);
    baseTileLayerRef.current = gibsViirsTiles;

    // 2. High-precision geographic boundaries & places overlay
    const labelsTiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        opacity: 0.8,
      }
    );
    labelsTiles.on('tileerror', (e) => {
      if (e.tile) e.tile.style.display = 'none';
    });
    labelsTiles.addTo(map);
    labelsLayerRef.current = labelsTiles;

    // Track mouse coordinate telemetry
    map.on('mousemove', (e) => {
      setHoverCoords({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    });

    map.on('zoomend', () => {
      setMapZoomLevel(map.getZoom());
    });

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Synchronize Active Satellite Imagery Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !baseTileLayerRef.current) return;
    const map = mapInstanceRef.current;
    map.removeLayer(baseTileLayerRef.current);

    let newTileLayer;
    if (activeLayer === 'nasa_viirs') {
      newTileLayer = L.tileLayer(
        'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        {
          subdomains: 'abc',
          maxNativeZoom: 9,
          maxZoom: 18,
          className: 'nasa-gibs-viirs-tiles',
        }
      );
    } else if (activeLayer === 'nasa_modis') {
      newTileLayer = L.tileLayer(
        'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        {
          subdomains: 'abc',
          maxNativeZoom: 9,
          maxZoom: 18,
          className: 'nasa-gibs-modis-tiles',
        }
      );
    } else {
      // High-resolution local satellite imagery
      newTileLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          className: 'highres-satellite-tiles',
        }
      );
    }

    newTileLayer.on('tileerror', (e) => {
      if (e.tile) e.tile.style.display = 'none';
    });
    newTileLayer.addTo(map);
    baseTileLayerRef.current = newTileLayer;

    if (labelsLayerRef.current) {
      labelsLayerRef.current.bringToFront();
    }
  }, [activeLayer]);

  // Update Markers: Real FIRMS observations overlaid with FRP color tiers & pulse
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    filteredDetections.forEach((d) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const tier = getFrpTier(d.frp);
      const isSelected = activeDetectionId === d.id;

      // Circle Marker: Low FRP -> Yellow (#FACC15), Medium -> Orange (#F97316), High -> Red (#EF4444)
      const markerColor = isSelected ? '#FF0033' : tier.color;
      const circle = L.circleMarker([lat, lon], {
        radius: isSelected ? tier.radius + 4 : tier.radius,
        fillColor: markerColor,
        color: isSelected ? '#FFFFFF' : markerColor,
        weight: isSelected ? 3 : 1.2,
        opacity: 0.95,
        fillOpacity: isSelected ? 0.95 : 0.8,
      });

      // Hover Tooltip displaying actual FIRMS telemetry
      const confPercent = d.prediction_confidence
        ? `${(parseFloat(d.prediction_confidence) * 100).toFixed(1)}%`
        : d.confidence || 'Nominal';
      const frpText = d.frp ? `${parseFloat(d.frp).toFixed(1)} MW` : 'N/A';
      const satText = d.source || d.satellite || d.instrument || 'VIIRS';
      const timeText = `${d.acq_date || ''} ${d.acq_time || ''}`.trim() || 'Live Observation';
      const isRealFirms = d.data_provenance === 'REAL_FIRMS';

      const tooltipContent = `
        <div style="font-family: var(--font-sans); min-width: 185px;">
          <div style="font-weight: 700; color: #FFFFFF; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
            <span>${d.predicted_class || 'Thermal Hotspot'}</span>
            <span style="font-size: 10px; color: ${tier.color}; font-weight: 800;">${tier.key}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.5;">
            <div>FRP: <strong style="color: ${tier.color};">${frpText}</strong></div>
            <div>AI Confidence: <strong style="color: #FFFFFF;">${confPercent}</strong></div>
            <div>Coords: <span style="font-family: var(--font-mono);">${lat.toFixed(4)}°, ${lon.toFixed(4)}°</span></div>
            <div>Satellite: <span style="color: var(--ice-blue);">${satText}</span></div>
            <div>Acq Time: <span style="font-family: var(--font-mono);">${timeText} UTC</span></div>
            <div style="margin-top: 4px; font-size: 9.5px; font-weight: 700; color: ${isRealFirms ? '#10B981' : '#BAE6FD'};">
              ${isRealFirms ? 'PROVENANCE: REAL FIRMS DATA' : 'PROVENANCE: SATELLITE TELEMETRY'}
            </div>
          </div>
        </div>
      `;

      circle.bindTooltip(tooltipContent, {
        className: 'satra-thermal-tooltip',
        direction: 'top',
        offset: [0, -5],
      });

      circle.on('click', () => {
        handleSelectDetection(d);
      });

      markersGroup.addLayer(circle);

      // Selected Detection Pulse Ring Marker
      if (isSelected) {
        const pulseIcon = L.divIcon({
          className: 'selected-hotspot-container',
          html: '<div class="selected-hotspot-ring"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const pulseMarker = L.marker([lat, lon], {
          icon: pulseIcon,
          interactive: false,
        });
        markersGroup.addLayer(pulseMarker);
      }
    });
  }, [filteredDetections, activeDetectionId, handleSelectDetection]);

  // Real Geographic Location Search (OpenStreetMap Nominatim Geocoding)
  const handleExecuteLocationSearch = async (overrideQuery) => {
    const q = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    if (!q) {
      setSearchedLocation(null);
      setSearchMessage(null);
      return;
    }

    setIsSearchingLocation(true);
    setSearchMessage(null);

    try {
      // Check if coordinates entered directly e.g. "13.08, 80.27"
      const coordMatch = q.match(/^([-+]?\d{1,2}\.?\d*)[,\s]+([-+]?\d{1,3}\.?\d*)$/);
      let targetLat = null;
      let targetLon = null;
      let targetName = q;

      if (coordMatch) {
        targetLat = parseFloat(coordMatch[1]);
        targetLon = parseFloat(coordMatch[2]);
        targetName = `${targetLat.toFixed(4)}°, ${targetLon.toFixed(4)}°`;
      } else {
        // Query Nominatim OpenStreetMap Geocoder
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
          { headers: { 'Accept': 'application/json' } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          targetLat = parseFloat(data[0].lat);
          targetLon = parseFloat(data[0].lon);
          targetName = data[0].display_name;
        }
      }

      if (targetLat !== null && targetLon !== null) {
        // Move & zoom map smoothly to real coordinates
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([targetLat, targetLon], 10, { duration: 1.5 });
        }

        // Find existing FIRMS observations in database near this location (within ~0.6 deg / ~65km)
        const nearby = detections.filter((d) => {
          const dLat = parseFloat(d.latitude);
          const dLon = parseFloat(d.longitude);
          return Math.abs(dLat - targetLat) <= 0.6 && Math.abs(dLon - targetLon) <= 0.6;
        });

        if (nearby.length > 0) {
          setSearchedLocation({
            name: targetName,
            lat: targetLat,
            lon: targetLon,
            count: nearby.length,
          });
          setSearchMessage(null);
          // Select closest detection
          handleSelectDetection(nearby[0]);
        } else {
          setSearchedLocation({
            name: targetName,
            lat: targetLat,
            lon: targetLon,
            count: 0,
          });
          // Explicit message required by prompt; DO NOT create fake hotspots
          setSearchMessage('No recent NASA FIRMS thermal observations found for this area.');
        }
      } else {
        setSearchMessage(`Location "${q}" not found. Please try a valid city name or coordinates.`);
      }
    } catch (err) {
      console.warn('Geocoding error:', err);
      setSearchMessage(`Unable to resolve location "${q}".`);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  // Map Navigation Controls
  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const handleResetMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20.5937, 78.9629], 4, { animate: true });
    }
    setSearchedLocation(null);
    setSearchMessage(null);
  };

  const handleFitToWorld = () => {
    if (!mapInstanceRef.current) return;
    if (filteredDetections.length > 0) {
      const validPoints = filteredDetections
        .map((d) => [parseFloat(d.latitude), parseFloat(d.longitude)])
        .filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon));
      if (validPoints.length > 0) {
        const bounds = L.latLngBounds(validPoints);
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
        return;
      }
    }
    mapInstanceRef.current.fitBounds([[-55, -160], [70, 160]]);
  };

  const toggleMapFullscreen = () => {
    const el = mapContainerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsMapFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsMapFullscreen(false);
    }
  };

  // Center on selected detection
  const focusOnDetectionInMap = useCallback((d) => {
    if (!mapInstanceRef.current || !d) return;
    const lat = parseFloat(d.latitude);
    const lon = parseFloat(d.longitude);
    if (!isNaN(lat) && !isNaN(lon)) {
      mapInstanceRef.current.setView([lat, lon], Math.max(mapInstanceRef.current.getZoom(), 8), {
        animate: true,
      });
    }
  }, []);

  // --------------------------------------------------------------------------
  // 6. Thermal Activity Trend Data (Line/Area Chart)
  // --------------------------------------------------------------------------
  const [trendRange, setTrendRange] = useState('7d'); // '24h' | '7d' | '30d'
  const [trendHoverItem, setTrendHoverItem] = useState(null);

  const trendData = useMemo(() => {
    // Generate chronological buckets based on selected range
    const bucketCount = trendRange === '24h' ? 24 : trendRange === '7d' ? 7 : 14;
    const buckets = [];
    const now = new Date();

    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now);
      if (trendRange === '24h') {
        d.setHours(now.getHours() - i);
        buckets.push({
          label: `${d.getHours()}:00`,
          timeKey: d.toISOString().substring(0, 13),
          total: 0,
          industrial: 0,
          forest: 0,
          other: 0,
          avgFrp: 0,
          peakFrp: 0,
          frpList: [],
        });
      } else {
        d.setDate(now.getDate() - i);
        const month = d.toLocaleString('en-US', { month: 'short' });
        const day = d.getDate();
        buckets.push({
          label: `${month} ${day}`,
          timeKey: d.toISOString().substring(0, 10),
          total: 0,
          industrial: 0,
          forest: 0,
          other: 0,
          avgFrp: 0,
          peakFrp: 0,
          frpList: [],
        });
      }
    }

    // Populate with real detections
    filteredDetections.forEach((det) => {
      const rawDate = det.acq_date || (det.created_at ? det.created_at.substring(0, 10) : null);
      if (!rawDate) return;

      const detClass = (det.predicted_class || '').toLowerCase();
      const frpVal = parseFloat(det.frp) || 0;

      buckets.forEach((b) => {
        if (rawDate.startsWith(b.timeKey.substring(0, 10))) {
          b.total += 1;
          if (detClass.includes('industrial')) b.industrial += 1;
          else if (detClass.includes('forest') || detClass.includes('wildfire')) b.forest += 1;
          else b.other += 1;

          if (frpVal > 0) {
            b.frpList.push(frpVal);
            if (frpVal > b.peakFrp) b.peakFrp = frpVal;
          }
        }
      });
    });

    // Compute averages
    buckets.forEach((b) => {
      if (b.frpList.length > 0) {
        b.avgFrp = parseFloat((b.frpList.reduce((acc, v) => acc + v, 0) / b.frpList.length).toFixed(1));
      }
    });

    return buckets;
  }, [filteredDetections, trendRange]);

  const maxTrendTotal = useMemo(() => {
    return Math.max(...trendData.map((b) => b.total), 1);
  }, [trendData]);

  const maxTrendFrp = useMemo(() => {
    return Math.max(...trendData.map((b) => b.peakFrp), 10);
  }, [trendData]);

  // --------------------------------------------------------------------------
  // 7. Donut Chart Aggregations (Classification, Risk, Satellite)
  // --------------------------------------------------------------------------
  const classificationDonut = useMemo(() => {
    const total = totalCount || 1;
    const items = [
      { key: 'Industrial Fire', label: 'Industrial Fire', count: industrialCount, color: '#EF4444' },
      { key: 'Forest Fire', label: 'Forest Fire', count: forestCount, color: '#10B981' },
      { key: 'Persistent Thermal Source', label: 'Persistent Thermal Source', count: persistentCount, color: '#F59E0B' },
      { key: 'Other', label: 'Other', count: Math.max(0, otherCount), color: '#38BDF8' },
    ];
    return items.map((item) => ({
      ...item,
      percentage: totalCount > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0',
    }));
  }, [totalCount, industrialCount, forestCount, persistentCount, otherCount]);

  const riskDonut = useMemo(() => {
    const total = totalCount || 1;
    const critical = filteredDetections.filter((d) => (d.alert_level || '').toUpperCase() === 'CRITICAL').length;
    const high = filteredDetections.filter((d) => (d.alert_level || '').toUpperCase() === 'HIGH').length;
    const medium = filteredDetections.filter((d) => (d.alert_level || 'MEDIUM').toUpperCase() === 'MEDIUM').length;
    const low = filteredDetections.filter((d) => (d.alert_level || '').toUpperCase() === 'LOW').length;

    const items = [
      { key: 'CRITICAL', label: 'Critical', count: critical, color: '#FF1744' },
      { key: 'HIGH', label: 'High', count: high, color: '#FF453A' },
      { key: 'MEDIUM', label: 'Medium', count: medium, color: '#FF8A00' },
      { key: 'LOW', label: 'Low', count: low, color: '#45C8F5' },
    ];

    return items.map((item) => ({
      ...item,
      percentage: totalCount > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0',
    }));
  }, [totalCount, filteredDetections]);

  const satelliteDistribution = useMemo(() => {
    const total = totalCount || 1;
    const viirsCount = filteredDetections.filter((d) => {
      const s = `${d.source || ''} ${d.instrument || ''} ${d.satellite || ''}`.toUpperCase();
      return s.includes('VIIRS') || s.includes('SNPP') || s.includes('NOAA');
    }).length;

    const modisCount = filteredDetections.filter((d) => {
      const s = `${d.source || ''} ${d.instrument || ''} ${d.satellite || ''}`.toUpperCase();
      return s.includes('MODIS') || s.includes('TERRA') || s.includes('AQUA');
    }).length;

    const otherSources = totalCount - viirsCount - modisCount;

    return [
      { key: 'VIIRS', label: 'VIIRS (Suomi-NPP / NOAA-20)', count: viirsCount, color: '#45C8F5', percentage: totalCount > 0 ? ((viirsCount / total) * 100).toFixed(1) : '0.0' },
      { key: 'MODIS', label: 'MODIS (Terra / Aqua)', count: modisCount, color: '#8DE7FF', percentage: totalCount > 0 ? ((modisCount / total) * 100).toFixed(1) : '0.0' },
      ...(otherSources > 0 ? [{ key: 'OTHER', label: 'Other Telesensors', count: otherSources, color: '#9AAFC2', percentage: ((otherSources / total) * 100).toFixed(1) }] : []),
    ];
  }, [totalCount, filteredDetections]);

  // Donut Path Generator Helper
  const createDonutSegments = (items, totalVal) => {
    const radius = 64;
    const strokeWidth = 18;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    return items.map((item) => {
      const val = totalVal > 0 ? (item.count / totalVal) * circumference : 0;
      const strokeDasharray = `${val} ${circumference}`;
      const strokeDashoffset = -accumulatedAngle;
      accumulatedAngle += val;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  };

  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  // --------------------------------------------------------------------------
  // 8. Recent Thermal Detections Table (Sorting, Filtering, Pagination)
  // --------------------------------------------------------------------------
  const [tableSort, setTableSort] = useState({ column: 'frp', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const handleSort = (column) => {
    setTableSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'desc' };
    });
  };

  const sortedDetections = useMemo(() => {
    const list = [...filteredDetections];
    const { column, direction } = tableSort;
    const mult = direction === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (column === 'frp') {
        return ((parseFloat(a.frp) || 0) - (parseFloat(b.frp) || 0)) * mult;
      }
      if (column === 'confidence') {
        return ((parseFloat(a.prediction_confidence) || 0) - (parseFloat(b.prediction_confidence) || 0)) * mult;
      }
      if (column === 'brightness') {
        return ((parseFloat(a.brightness) || 0) - (parseFloat(b.brightness) || 0)) * mult;
      }
      if (column === 'id') {
        return ((a.id || 0) - (b.id || 0)) * mult;
      }
      if (column === 'time') {
        const timeA = `${a.acq_date || ''} ${a.acq_time || ''}`;
        const timeB = `${b.acq_date || ''} ${b.acq_time || ''}`;
        return timeA.localeCompare(timeB) * mult;
      }
      return 0;
    });

    return list;
  }, [filteredDetections, tableSort]);

  const totalPages = Math.ceil(sortedDetections.length / itemsPerPage) || 1;
  const paginatedDetections = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedDetections.slice(start, start + itemsPerPage);
  }, [sortedDetections, currentPage]);

  // --------------------------------------------------------------------------
  // 9. Export Filtered Data to CSV
  // --------------------------------------------------------------------------
  const exportFilteredData = () => {
    if (filteredDetections.length === 0) return;

    const headers = [
      'id',
      'latitude',
      'longitude',
      'acq_date',
      'acq_time',
      'frp_mw',
      'brightness_k',
      'predicted_class',
      'confidence',
      'risk_level',
      'satellite_source',
      'model_version',
      'provenance',
    ];

    const rows = filteredDetections.map((d) => [
      d.id,
      d.latitude,
      d.longitude,
      d.acq_date || '',
      d.acq_time || '',
      d.frp || '',
      d.brightness || '',
      `"${(d.predicted_class || '').replace(/"/g, '""')}"`,
      d.prediction_confidence || '',
      d.alert_level || 'MEDIUM',
      `"${(d.source || d.instrument || 'VIIRS').replace(/"/g, '""')}"`,
      d.model_version || '2.0.0',
      d.data_provenance || 'SAMPLE',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `satra_thermal_detections_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ======================================================================
          TOP HEADER
          Left: THERMAL INTELLIGENCE + Subtitle
          Right: Search + Dynamic UTC Clock + Live Telemetry + Refresh + Export
          ====================================================================== */}
      <div
        className="card-panel"
        style={{
          margin: 0,
          padding: '16px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#FFFFFF',
                margin: 0,
              }}
            >
              THERMAL INTELLIGENCE
            </h1>
            <span
              style={{
                fontSize: '10.5px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(69, 200, 245, 0.12)',
                color: 'var(--primary-cyan)',
                border: '1px solid rgba(69, 200, 245, 0.3)',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              Where is thermal activity strongest?
            </span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ice-blue)', marginTop: '3px', fontWeight: 500 }}>
            "Visualize the intensity and distribution of detected thermal activity."
          </div>
        </div>

        {/* Header Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Working Location Search Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecuteLocationSearch();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(5, 11, 20, 0.7)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '4px 10px',
              gap: '8px',
              minWidth: '280px',
            }}
          >
            <Search size={14} style={{ color: isSearchingLocation ? 'var(--primary-cyan)' : 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search location (e.g. Chennai, Tiruppur)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12px',
                width: '100%',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchedLocation(null);
                  setSearchMessage(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
                title="Clear search"
              >
                &times;
              </button>
            )}
            <button
              type="submit"
              disabled={isSearchingLocation}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38BDF8',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isSearchingLocation ? 'Locating...' : 'Locate'}
            </button>
          </form>

          {/* Dynamic UTC & Local Timestamp */}
          <div
            style={{
              background: 'rgba(15, 32, 50, 0.6)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ice-blue)',
            }}
            title="System UTC Clock (distinct from satellite observation time)"
          >
            <Clock size={13} style={{ color: 'var(--primary-cyan)' }} />
            <span>SYS: {formattedUtc}</span>
          </div>

          {/* NASA FIRMS Real API Status Indicator */}
          {(() => {
            const st = firmsStatus?.status || (isBackendHealthy ? 'STANDBY' : 'API ERROR');
            let color = '#F59E0B';
            let bg = 'rgba(245, 158, 11, 0.1)';
            let border = 'rgba(245, 158, 11, 0.3)';
            let label = 'NASA FIRMS API KEY REQUIRED';

            if (st === 'CONNECTED') {
              color = '#10B981';
              bg = 'rgba(16, 185, 129, 0.1)';
              border = 'rgba(16, 185, 129, 0.3)';
              label = 'NASA FIRMS CONNECTED';
            } else if (st === 'NO DATA') {
              color = '#38BDF8';
              bg = 'rgba(56, 189, 248, 0.1)';
              border = 'rgba(56, 189, 248, 0.3)';
              label = 'NASA FIRMS NO DATA';
            } else if (st === 'API ERROR') {
              color = '#EF4444';
              bg = 'rgba(239, 68, 68, 0.1)';
              border = 'rgba(239, 68, 68, 0.3)';
              label = 'NASA FIRMS API ERROR';
            }

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: bg,
                  border: `1px solid ${border}`,
                  color: color,
                }}
                title={firmsStatus?.message || 'Real-time NASA FIRMS satellite telemetry feed'}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}`,
                  }}
                />
                {label}
              </div>
            );
          })()}

          {/* Refresh Action */}
          <button
            onClick={() => {
              onRefresh();
              loadFirmsStatus();
            }}
            className="satra-icon-btn"
            title="Refresh satellite telemetry feed"
          >
            <RefreshCw size={14} />
          </button>

          {/* Export Data Action */}
          <button
            onClick={exportFilteredData}
            className="btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Export filtered dataset to CSV"
          >
            <Download size={13} />
            EXPORT DATA
          </button>
        </div>
      </div>

      {/* ======================================================================
          TOP KPI ROW (4 Cards)
          Card 1: TOTAL DETECTIONS (actual real count)
          Card 2: FOREST FIRES (actual count)
          Card 3: INDUSTRIAL FIRES (actual count)
          Card 4: OTHER THERMAL SOURCES (actual count)
          ====================================================================== */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', margin: 0 }}>
        <KpiCard
          title="TOTAL DETECTIONS"
          value={totalCount.toString()}
          subtext="Verified spaceborne infrared anomalies"
          icon={Flame}
          accentColor="orange"
          badgeText="Active Hotspots"
        />

        <KpiCard
          title="FOREST FIRES"
          value={forestCount.toString()}
          subtext="Vegetation canopy & wildfire detections"
          icon={TreePine}
          accentColor="emerald"
          badgeText="Forest / Wildfire"
        />

        <KpiCard
          title="INDUSTRIAL FIRES"
          value={industrialCount.toString()}
          subtext="Refinery, flare & thermal surges"
          icon={Factory}
          accentColor="red"
          badgeText="Industrial"
        />

        <KpiCard
          title="OTHER THERMAL SOURCES"
          value={otherCount.toString()}
          subtext="Persistent smelters, gas flares & agro"
          icon={Radio}
          accentColor="cyan"
          badgeText="Persistent / Other"
        />
      </div>

      {/* ======================================================================
          FILTER BAR (Classification, Risk, Satellite, Time, FRP Tier)
          ====================================================================== */}
      <div
        className="card-panel"
        style={{
          margin: 0,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'rgba(11, 23, 38, 0.75)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
            <Filter size={13} style={{ color: 'var(--primary-cyan)' }} />
            FILTERS:
          </div>

          {/* Classification */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Class:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{
                background: 'rgba(16, 34, 55, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11.5px',
                outline: 'none',
              }}
            >
              <option value="ALL">All Classes</option>
              <option value="Industrial Fire">Industrial Fire</option>
              <option value="Forest Fire">Forest Fire</option>
              <option value="Persistent Thermal Source">Persistent Thermal Source</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Risk Level */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Risk:</span>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={{
                background: 'rgba(16, 34, 55, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11.5px',
                outline: 'none',
              }}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Satellite Source */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Satellite:</span>
            <select
              value={satelliteFilter}
              onChange={(e) => setSatelliteFilter(e.target.value)}
              style={{
                background: 'rgba(16, 34, 55, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11.5px',
                outline: 'none',
              }}
            >
              <option value="ALL">All Constellations</option>
              <option value="VIIRS">VIIRS (SNPP / NOAA-20)</option>
              <option value="MODIS">MODIS (Terra / Aqua)</option>
            </select>
          </div>

          {/* FRP Tier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>FRP Power:</span>
            <select
              value={frpTierFilter}
              onChange={(e) => setFrpTierFilter(e.target.value)}
              style={{
                background: 'rgba(16, 34, 55, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11.5px',
                outline: 'none',
              }}
            >
              <option value="ALL">All FRP Ranges</option>
              <option value="LOW">Low (&lt; 20 MW)</option>
              <option value="MEDIUM">Medium (20 &ndash; 50 MW)</option>
              <option value="HIGH">High (50 &ndash; 100 MW)</option>
              <option value="CRITICAL">Critical (&gt; 100 MW)</option>
            </select>
          </div>

          {/* Time Window */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Time:</span>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              style={{
                background: 'rgba(16, 34, 55, 0.9)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '4px 10px',
                fontSize: '11.5px',
                outline: 'none',
              }}
            >
              <option value="all">All Available Records</option>
              <option value="today">Today (&lt; 24h)</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Filter Reset & Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Showing <strong style={{ color: 'var(--ice-blue)' }}>{totalCount}</strong> of {detections.length} detections
          </span>
          {isAnyFilterActive && (
            <button
              onClick={resetFilters}
              style={{
                background: 'rgba(255, 69, 58, 0.1)',
                border: '1px solid rgba(255, 69, 58, 0.3)',
                borderRadius: '5px',
                color: '#FF6B6B',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ======================================================================
          MAIN VISUAL SECTION
          Left: GLOBAL THERMAL ACTIVITY MAP
          Right: THERMAL INTENSITY ANALYSIS PANEL
          ====================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.8fr) minmax(360px, 1.15fr)',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* GLOBAL THERMAL ACTIVITY MAP */}
        <div className="card-panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ marginBottom: '12px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={17} style={{ color: 'var(--thermal-orange)' }} />
                <span>GLOBAL THERMAL ACTIVITY MAP</span>
              </div>
              <div className="panel-subtitle">
                Spaceborne infrared radiometric observations plotted at exact telemetry coordinates
              </div>
            </div>

            {/* Layer Switcher & Quick Map Controls Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(5, 11, 20, 0.8)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveLayer('nasa_viirs')}
                  style={{
                    background: activeLayer === 'nasa_viirs' ? 'rgba(69, 200, 245, 0.25)' : 'transparent',
                    color: activeLayer === 'nasa_viirs' ? '#FFFFFF' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="NASA GIBS VIIRS True Color spaceborne imagery"
                >
                  NASA VIIRS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayer('nasa_modis')}
                  style={{
                    background: activeLayer === 'nasa_modis' ? 'rgba(69, 200, 245, 0.25)' : 'transparent',
                    color: activeLayer === 'nasa_modis' ? '#FFFFFF' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="NASA GIBS MODIS Terra True Color imagery"
                >
                  NASA MODIS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayer('satellite_hires')}
                  style={{
                    background: activeLayer === 'satellite_hires' ? 'rgba(69, 200, 245, 0.25)' : 'transparent',
                    color: activeLayer === 'satellite_hires' ? '#FFFFFF' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="High-Resolution Satellite Imagery for sub-meter local terrain & facility inspection"
                >
                  High-Res
                </button>
              </div>

              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                ZOOM: {mapZoomLevel}x
              </span>
            </div>
          </div>

          {/* Interactive Map Canvas Container */}
          <div
            className="satra-thermal-map-container"
            style={{
              position: 'relative',
              width: '100%',
              height: '520px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              background: '#050B14',
            }}
          >
            {/* The Actual Leaflet Map Element */}
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* Location Search Floating Alert Banner */}
            {(searchMessage || (searchedLocation && searchedLocation.count > 0)) && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  zIndex: 1000,
                  background: searchMessage ? 'rgba(15, 23, 42, 0.94)' : 'rgba(6, 78, 119, 0.92)',
                  border: `1px solid ${searchMessage ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  maxWidth: '380px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: searchMessage ? '#FF6B6B' : '#45D483' }}>
                    <MapPin size={15} />
                    <span>{searchMessage ? 'Location Notice' : 'Location Identified'}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSearchedLocation(null);
                      setSearchMessage(null);
                    }}
                    style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '14px' }}
                    title="Close banner"
                  >
                    &times;
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: '#FFFFFF', lineHeight: 1.4 }}>
                  {searchMessage || `Showing ${searchedLocation?.count} NASA FIRMS thermal observations in vicinity.`}
                </div>
                {searchedLocation && (
                  <div style={{ fontSize: '11px', color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>
                    {searchedLocation.name.split(',').slice(0, 3).join(',')} ({searchedLocation.lat.toFixed(4)}°, {searchedLocation.lon.toFixed(4)}°)
                  </div>
                )}
              </div>
            )}

            {/* Map Telemetry Graticule Overlay Badge (Bottom Left) */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                zIndex: 1000,
                background: 'rgba(5, 11, 20, 0.88)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--ice-blue)',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div>
                {hoverCoords ? (
                  <span>
                    LAT: {Math.abs(hoverCoords.lat).toFixed(4)}° {hoverCoords.lat >= 0 ? 'N' : 'S'} &bull; LON:{' '}
                    {Math.abs(hoverCoords.lng).toFixed(4)}° {hoverCoords.lng >= 0 ? 'E' : 'W'}
                  </span>
                ) : (
                  <span>HOVER MAP FOR COORDINATES &bull; REAL DATA OVERLAY</span>
                )}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                IMAGERY: NASA GIBS / NASA WORLDVIEW SATELLITE
              </div>
            </div>

            {/* Aerospace Map Control Buttons (Top Right HUD) */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <button onClick={handleZoomIn} className="thermal-hud-btn" title="Zoom In (+)">
                +
              </button>
              <button onClick={handleZoomOut} className="thermal-hud-btn" title="Zoom Out (−)">
                &minus;
              </button>
              <button onClick={handleResetMap} className="thermal-hud-btn" title="Reset to India / Regional View">
                <RotateCcw size={14} />
              </button>
              <button onClick={handleFitToWorld} className="thermal-hud-btn" title="Fit to Hotspots / World">
                <Compass size={14} />
              </button>
              <button onClick={toggleMapFullscreen} className="thermal-hud-btn" title="Toggle Fullscreen">
                {isMapFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>

            {/* Clean Single Thermal Intensity Legend (Inside Map, Bottom Right) */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                zIndex: 1000,
                background: 'rgba(11, 23, 38, 0.92)',
                backdropFilter: 'blur(10px)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '10px 14px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                THERMAL INTENSITY (FRP)
              </div>
              {/* Visual Gradient Bar (Low Yellow -> Medium Orange -> High Red) */}
              <div
                style={{
                  height: '6px',
                  width: '180px',
                  borderRadius: '3px',
                  background: 'linear-gradient(to right, #FACC15, #F97316, #EF4444)',
                  marginBottom: '6px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '9.5px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: '#FACC15' }}>Low &lt;20</span>
                <span style={{ color: '#F97316' }}>Med 20-50</span>
                <span style={{ color: '#EF4444', fontWeight: 700 }}>High &ge;50 MW</span>
              </div>
            </div>
          </div>
        </div>

        {/* THERMAL INTENSITY ANALYSIS PANEL */}
        <div
          className="card-panel"
          style={{
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="panel-header" style={{ marginBottom: '14px' }}>
              <div>
                <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={17} style={{ color: 'var(--primary-cyan)' }} />
                  <span>THERMAL INTENSITY ANALYSIS</span>
                </div>
                <div className="panel-subtitle">Granular radiometric telemetry inspection</div>
              </div>
              {currentSelectedDetection && (
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ice-blue)',
                    background: 'rgba(69, 200, 245, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(69, 200, 245, 0.25)',
                  }}
                >
                  #{currentSelectedDetection.id}
                </span>
              )}
            </div>

            {/* Inspection Content */}
            {!currentSelectedDetection ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <Flame size={32} style={{ color: 'var(--text-muted)' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                  Select a thermal detection to inspect
                </div>
                <div style={{ fontSize: '12px', maxWidth: '280px', lineHeight: 1.5 }}>
                  Click any hotspot marker on the satellite map or choose an observation from the telemetry table below.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Header Provenance & Location Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 32, 50, 0.7)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={15} style={{ color: 'var(--primary-cyan)' }} />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {formatCoords(currentSelectedDetection.latitude, currentSelectedDetection.longitude)}
                    </span>
                  </div>

                  <div>
                    {currentSelectedDetection.data_provenance === 'REAL_FIRMS' ? (
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          color: '#10B981',
                          letterSpacing: '0.04em',
                        }}
                      >
                        DATA PROVENANCE: REAL FIRMS DATA
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          color: '#BAE6FD',
                        }}
                      >
                        PROVENANCE: {currentSelectedDetection.data_provenance || 'SATELLITE TELEMETRY'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 1. NASA FIRMS OBSERVATION (Physical Sensor Telemetry) */}
                <div
                  style={{
                    background: 'rgba(11, 23, 38, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Satellite size={14} style={{ color: 'var(--ice-blue)' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ice-blue)', letterSpacing: '0.05em' }}>
                        NASA FIRMS OBSERVATION
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      Physical Anomaly Detected
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* FRP */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fire Radiative Power</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: getFrpTier(currentSelectedDetection.frp).color, fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {currentSelectedDetection.frp ? `${parseFloat(currentSelectedDetection.frp).toFixed(1)} MW` : 'N/A'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{getFrpTier(currentSelectedDetection.frp).label}</div>
                    </div>

                    {/* Brightness Temperature */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Brightness Temp (4µm)</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {currentSelectedDetection.brightness ? `${parseFloat(currentSelectedDetection.brightness).toFixed(1)} K` : 'N/A'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Infrared Radiance</div>
                    </div>

                    {/* Satellite Platform & Instrument */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Satellite & Sensor</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-cyan)', marginTop: '2px' }}>
                        {currentSelectedDetection.source || currentSelectedDetection.satellite || 'VIIRS'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {currentSelectedDetection.instrument || 'Infrared Suite'}
                      </div>
                    </div>

                    {/* Acquisition Timestamp */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Acquisition Timestamp</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {currentSelectedDetection.acq_date || 'N/A'} {currentSelectedDetection.acq_time || ''} UTC
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {currentSelectedDetection.daynight === 'D' ? 'Daytime (D)' : currentSelectedDetection.daynight === 'N' ? 'Nighttime (N)' : 'Illuminated'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. SATRA AI PREDICTION (Machine Learning Decision Support) */}
                <div
                  style={{
                    background: 'rgba(11, 23, 38, 0.7)',
                    border: '1px solid rgba(167, 139, 250, 0.25)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} style={{ color: 'var(--accent-purple)' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-purple)', letterSpacing: '0.05em' }}>
                        SATRA AI PREDICTION
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--accent-purple)', background: 'rgba(167, 139, 250, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      Model v2.0.0
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* Likely Classification */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Likely Classification</div>
                      <div style={{ marginTop: '4px' }}>
                        <ClassBadge predictedClass={currentSelectedDetection.predicted_class} />
                      </div>
                    </div>

                    {/* AI Confidence */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>AI Confidence</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {currentSelectedDetection.prediction_confidence
                          ? `${(parseFloat(currentSelectedDetection.prediction_confidence) * 100).toFixed(1)}%`
                          : currentSelectedDetection.confidence || 'Nominal'}
                      </div>
                    </div>

                    {/* Operational Risk */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Risk Level</div>
                      <div style={{ marginTop: '4px' }}>
                        <StatusBadge status={currentSelectedDetection.alert_level || 'MEDIUM'} type="severity" />
                      </div>
                    </div>

                    {/* Verification Status */}
                    <div style={{ background: 'rgba(16, 34, 55, 0.6)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verification Status</div>
                      <div style={{ marginTop: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#F59E0B',
                            display: 'inline-block',
                          }}
                        >
                          {currentSelectedDetection.verification_status || 'AI Prediction — Requires Verification'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Scientific Rule Notice (Requirement 8) */}
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      background: 'rgba(5, 11, 20, 0.5)',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      borderLeft: '2px solid var(--primary-cyan)',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ color: '#E2E8F0' }}>Scientific Protocol:</strong> NASA FIRMS thermal detections indicate physical spaceborne radiometric heat anomalies. SATRA AI classifies candidate source types for operational decision-support triage.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {currentSelectedDetection && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                onClick={() => {
                  focusOnDetectionInMap(currentSelectedDetection);
                  if (onFocusDetection) onFocusDetection(currentSelectedDetection);
                }}
                className="btn-secondary"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  fontSize: '12px',
                }}
              >
                <MapPin size={14} />
                Focus Detection
              </button>

              <button
                onClick={() => {
                  if (onSelectDetection) onSelectDetection(currentSelectedDetection);
                  if (onNavigate) onNavigate('gis-investigation');
                }}
                className="btn-primary"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '9px 12px',
                  fontSize: '12px',
                }}
              >
                <ExternalLink size={14} />
                Open GIS Deck
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================================
          ANALYTICAL TRENDS SECTION
          Col 1: THERMAL ACTIVITY TREND (Line/Area Chart with 24H, 7D, 30D tabs)
          Col 2: FRP INTENSITY TREND (Line/Area Chart with Peak and Mean FRP)
          ====================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: '20px',
        }}
      >
        {/* THERMAL ACTIVITY TREND */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div className="panel-header" style={{ marginBottom: '14px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={17} style={{ color: 'var(--primary-cyan)' }} />
                <span>THERMAL ACTIVITY TREND</span>
              </div>
              <div className="panel-subtitle">Temporal cadence of satellite thermal detections</div>
            </div>

            {/* Time Window Selector Buttons */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(5, 11, 20, 0.7)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              {['24h', '7d', '30d'].map((r) => (
                <button
                  key={r}
                  onClick={() => setTrendRange(r)}
                  style={{
                    background: trendRange === r ? 'var(--primary-cyan)' : 'transparent',
                    color: trendRange === r ? '#050B14' : 'var(--text-secondary)',
                    fontWeight: trendRange === r ? 700 : 500,
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r === '24h' ? '24 Hours' : r === '7d' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Line / Area Chart */}
          <div style={{ position: 'relative', height: '190px', width: '100%', marginTop: '10px' }}>
            {trendData.length === 0 || maxTrendTotal === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No thermal activity records in selected timeframe
              </div>
            ) : (
              <svg width="100%" height="100%" viewBox="0 0 500 160" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="thermalTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#45C8F5" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#45C8F5" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                  <line
                    key={i}
                    x1="0"
                    y1={130 - pct * 105}
                    x2="500"
                    y2={130 - pct * 105}
                    stroke="rgba(120, 200, 240, 0.08)"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Area Fill */}
                <polygon
                  points={`0,130 ${trendData
                    .map((d, idx) => {
                      const x = (idx / (trendData.length - 1 || 1)) * 500;
                      const y = 130 - (d.total / maxTrendTotal) * 105;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')} 500,130`}
                  fill="url(#thermalTrendGrad)"
                />

                {/* Line Path */}
                <polyline
                  fill="none"
                  stroke="#45C8F5"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={trendData
                    .map((d, idx) => {
                      const x = (idx / (trendData.length - 1 || 1)) * 500;
                      const y = 130 - (d.total / maxTrendTotal) * 105;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />

                {/* Data Points with Hover Interaction */}
                {trendData.map((d, idx) => {
                  const x = (idx / (trendData.length - 1 || 1)) * 500;
                  const y = 130 - (d.total / maxTrendTotal) * 105;
                  const isHovered = trendHoverItem?.label === d.label;
                  return (
                    <g key={idx} onMouseEnter={() => setTrendHoverItem(d)} onMouseLeave={() => setTrendHoverItem(null)}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 5.5 : 3}
                        fill={isHovered ? '#FFFFFF' : '#45C8F5'}
                        stroke="#050B14"
                        strokeWidth="1.5"
                        style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      />
                    </g>
                  );
                })}

                {/* X-axis Labels */}
                {trendData.filter((_, idx) => idx % Math.ceil(trendData.length / 6) === 0 || idx === trendData.length - 1).map((d, idx, arr) => {
                  const x = (trendData.indexOf(d) / (trendData.length - 1 || 1)) * 500;
                  return (
                    <text
                      key={idx}
                      x={x}
                      y="150"
                      fill="var(--text-muted)"
                      fontSize="10"
                      textAnchor={x < 30 ? 'start' : x > 470 ? 'end' : 'middle'}
                      fontFamily="var(--font-mono)"
                    >
                      {d.label}
                    </text>
                  );
                })}
              </svg>
            )}

            {/* Hover Tooltip Overlay */}
            {trendHoverItem && (
              <div
                style={{
                  position: 'absolute',
                  top: '0',
                  right: '0',
                  background: 'rgba(11, 23, 38, 0.95)',
                  border: '1px solid var(--primary-cyan)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '3px' }}>
                  {trendHoverItem.label}: {trendHoverItem.total} Detections
                </div>
                <div style={{ color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                  <span>Ind: {trendHoverItem.industrial}</span>
                  <span>Forest: {trendHoverItem.forest}</span>
                  <span>Other: {trendHoverItem.other}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FRP INTENSITY TREND */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div className="panel-header" style={{ marginBottom: '14px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={17} style={{ color: 'var(--thermal-orange)' }} />
                <span>FRP INTENSITY TREND</span>
              </div>
              <div className="panel-subtitle">Peak radiative intensity & average megawatts over time</div>
            </div>

            <div style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)', color: 'var(--thermal-orange)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>PEAK:</span>
              <strong>{peakFrp} MW</strong>
            </div>
          </div>

          {/* FRP Chart */}
          <div style={{ position: 'relative', height: '190px', width: '100%', marginTop: '10px' }}>
            {trendData.length === 0 || maxTrendFrp === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                FRP telemetry data unavailable for current interval
              </div>
            ) : (
              <svg width="100%" height="100%" viewBox="0 0 500 160" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="frpTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF8A00" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#FF8A00" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                  <line
                    key={i}
                    x1="0"
                    y1={130 - pct * 105}
                    x2="500"
                    y2={130 - pct * 105}
                    stroke="rgba(255, 138, 0, 0.08)"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Area Fill for Peak FRP */}
                <polygon
                  points={`0,130 ${trendData
                    .map((d, idx) => {
                      const x = (idx / (trendData.length - 1 || 1)) * 500;
                      const y = 130 - (d.peakFrp / maxTrendFrp) * 105;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')} 500,130`}
                  fill="url(#frpTrendGrad)"
                />

                {/* Peak FRP Line */}
                <polyline
                  fill="none"
                  stroke="#FF453A"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={trendData
                    .map((d, idx) => {
                      const x = (idx / (trendData.length - 1 || 1)) * 500;
                      const y = 130 - (d.peakFrp / maxTrendFrp) * 105;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />

                {/* Avg FRP Line (dashed orange) */}
                <polyline
                  fill="none"
                  stroke="#FF8A00"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={trendData
                    .map((d, idx) => {
                      const x = (idx / (trendData.length - 1 || 1)) * 500;
                      const y = 130 - (d.avgFrp / maxTrendFrp) * 105;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />

                {/* Data Points */}
                {trendData.map((d, idx) => {
                  const x = (idx / (trendData.length - 1 || 1)) * 500;
                  const y = 130 - (d.peakFrp / maxTrendFrp) * 105;
                  const isHovered = trendHoverItem?.label === d.label;
                  return (
                    <circle
                      key={idx}
                      cx={x}
                      cy={y}
                      r={isHovered ? 5 : 2.5}
                      fill={isHovered ? '#FFFFFF' : '#FF453A'}
                      stroke="#050B14"
                      strokeWidth="1.2"
                      onMouseEnter={() => setTrendHoverItem(d)}
                      onMouseLeave={() => setTrendHoverItem(null)}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}

                {/* X-axis Labels */}
                {trendData.filter((_, idx) => idx % Math.ceil(trendData.length / 6) === 0 || idx === trendData.length - 1).map((d, idx) => {
                  const x = (trendData.indexOf(d) / (trendData.length - 1 || 1)) * 500;
                  return (
                    <text
                      key={idx}
                      x={x}
                      y="150"
                      fill="var(--text-muted)"
                      fontSize="10"
                      textAnchor={x < 30 ? 'start' : x > 470 ? 'end' : 'middle'}
                      fontFamily="var(--font-mono)"
                    >
                      {d.label}
                    </text>
                  );
                })}
              </svg>
            )}

            {/* Legend bottom */}
            <div style={{ display: 'flex', gap: '14px', fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '2px', background: '#FF453A' }} /> Peak Radiative FRP
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '2px', background: '#FF8A00', borderBottom: '1px dashed #FF8A00' }} /> Mean FRP Output
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          DISTRIBUTION CHARTS SECTION (3 Columns)
          Col 1: DETECTION CLASSIFICATION DONUT
          Col 2: THERMAL RISK DISTRIBUTION DONUT
          Col 3: SATELLITE SOURCE DISTRIBUTION
          ====================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '20px',
        }}
      >
        {/* DETECTION CLASSIFICATION DONUT */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div className="panel-header" style={{ marginBottom: '10px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={16} style={{ color: 'var(--thermal-red)' }} />
                <span>DETECTION CLASSIFICATION</span>
              </div>
              <div className="panel-subtitle">Multi-class inference distribution</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '14px', marginTop: '10px' }}>
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
              <svg width="140" height="140" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="64" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                {createDonutSegments(classificationDonut, totalCount).map((seg, i) => (
                  <circle
                    key={i}
                    cx="80"
                    cy="80"
                    r="64"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    transform="rotate(-90 80 80)"
                    style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
                    onMouseEnter={() => setHoveredDonutSegment(seg)}
                    onMouseLeave={() => setHoveredDonutSegment(null)}
                    onClick={() => setClassFilter(classFilter === seg.key ? 'ALL' : seg.key)}
                  />
                ))}
              </svg>

              {/* Donut Center Count */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                  {totalCount}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  TOTAL
                </div>
              </div>
            </div>

            {/* Donut Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '130px' }}>
              {classificationDonut.map((item) => (
                <div
                  key={item.key}
                  onClick={() => setClassFilter(classFilter === item.key ? 'ALL' : item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    background: classFilter === item.key ? 'rgba(69, 200, 245, 0.12)' : 'transparent',
                    border: classFilter === item.key ? '1px solid rgba(69, 200, 245, 0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                      {item.label}
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#FFFFFF' }}>
                    {item.count} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({item.percentage}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* THERMAL RISK DISTRIBUTION DONUT */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div className="panel-header" style={{ marginBottom: '10px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} style={{ color: 'var(--critical-red)' }} />
                <span>THERMAL RISK DISTRIBUTION</span>
              </div>
              <div className="panel-subtitle">Calculated alert priority matrix</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '14px', marginTop: '10px' }}>
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
              <svg width="140" height="140" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="64" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                {createDonutSegments(riskDonut, totalCount).map((seg, i) => (
                  <circle
                    key={i}
                    cx="80"
                    cy="80"
                    r="64"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    transform="rotate(-90 80 80)"
                    style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
                    onMouseEnter={() => setHoveredDonutSegment(seg)}
                    onMouseLeave={() => setHoveredDonutSegment(null)}
                    onClick={() => setRiskFilter(riskFilter === seg.key ? 'ALL' : seg.key)}
                  />
                ))}
              </svg>

              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                  {totalCount}
                </div>
                <div style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  RISK EVENTS
                </div>
              </div>
            </div>

            {/* Donut Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '130px' }}>
              {riskDonut.map((item) => (
                <div
                  key={item.key}
                  onClick={() => setRiskFilter(riskFilter === item.key ? 'ALL' : item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    background: riskFilter === item.key ? 'rgba(69, 200, 245, 0.12)' : 'transparent',
                    border: riskFilter === item.key ? '1px solid rgba(69, 200, 245, 0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#FFFFFF' }}>
                    {item.count} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({item.percentage}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SATELLITE SOURCE DISTRIBUTION */}
        <div className="card-panel" style={{ margin: 0 }}>
          <div className="panel-header" style={{ marginBottom: '10px' }}>
            <div>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Satellite size={16} style={{ color: 'var(--ice-blue)' }} />
                <span>SATELLITE SOURCE</span>
              </div>
              <div className="panel-subtitle">Spaceborne observation platform ratio</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {satelliteDistribution.map((item) => (
              <div
                key={item.key}
                onClick={() => setSatelliteFilter(satelliteFilter === item.key ? 'ALL' : item.key)}
                style={{
                  cursor: 'pointer',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: satelliteFilter === item.key ? 'rgba(69, 200, 245, 0.12)' : 'rgba(16, 34, 55, 0.5)',
                  border: satelliteFilter === item.key ? '1px solid var(--primary-cyan)' : '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: item.color }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${item.percentage}%`,
                      height: '100%',
                      backgroundColor: item.color,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======================================================================
          RECENT THERMAL DETECTIONS TABLE
          Columns: TIME, LOCATION, CLASSIFICATION, FRP, BRIGHTNESS, CONFIDENCE, SATELLITE, RISK, STATUS
          Supports: Sorting, Filtering, Search, Pagination, Row Click (Selects everywhere)
          ====================================================================== */}
      <div className="card-panel" style={{ margin: 0 }}>
        <div
          className="panel-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <div>
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={17} style={{ color: 'var(--thermal-orange)' }} />
              <span>RECENT THERMAL DETECTIONS</span>
            </div>
            <div className="panel-subtitle">
              Live spaceborne telemetry records synchronized across map, charts, and analysis deck
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Page {currentPage} of {totalPages}
            </span>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="thermal-hud-btn"
                style={{ width: '28px', height: '28px', opacity: currentPage <= 1 ? 0.4 : 1 }}
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="thermal-hud-btn"
                style={{ width: '28px', height: '28px', opacity: currentPage >= totalPages ? 0.4 : 1 }}
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('time')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    OBSERVATION TIME
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th>LOCATION (LAT, LON)</th>
                <th>CLASSIFICATION</th>
                <th onClick={() => handleSort('frp')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    FRP (MW)
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th onClick={() => handleSort('brightness')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    BRIGHTNESS (K)
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th onClick={() => handleSort('confidence')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    CONFIDENCE
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th>SATELLITE</th>
                <th>RISK</th>
                <th>STATUS</th>
                <th style={{ textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDetections.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No thermal detections available matching the active filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedDetections.map((d) => {
                  const isSelected = activeDetectionId === d.id;
                  const tier = getFrpTier(d.frp);
                  const confFormatted = d.prediction_confidence
                    ? `${(parseFloat(d.prediction_confidence) * 100).toFixed(1)}%`
                    : d.confidence || 'N/A';

                  return (
                    <tr
                      key={d.id}
                      onClick={() => handleSelectDetection(d)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(69, 200, 245, 0.12)' : undefined,
                        borderLeft: isSelected ? `3px solid ${tier.color}` : '3px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <td className="mono-cell" style={{ color: isSelected ? '#FFFFFF' : 'var(--text-secondary)' }}>
                        {d.acq_date || 'N/A'} {d.acq_time || ''}
                      </td>

                      <td className="mono-cell" style={{ color: '#FFFFFF', fontWeight: 600 }}>
                        {formatCoords(d.latitude, d.longitude)}
                      </td>

                      <td>
                        <ClassBadge predictedClass={d.predicted_class} />
                      </td>

                      <td className="mono-cell" style={{ color: tier.color, fontWeight: 700 }}>
                        {d.frp ? `${parseFloat(d.frp).toFixed(1)} MW` : '—'}
                      </td>

                      <td className="mono-cell">
                        {d.brightness ? `${parseFloat(d.brightness).toFixed(1)} K` : '—'}
                      </td>

                      <td className="mono-cell">
                        <span style={{ color: parseFloat(confFormatted) >= 90 ? '#45D483' : 'var(--text-primary)' }}>
                          {confFormatted}
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--ice-blue)',
                            background: 'rgba(141, 231, 255, 0.08)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(141, 231, 255, 0.2)',
                          }}
                        >
                          {d.instrument || d.source || 'VIIRS'}
                        </span>
                      </td>

                      <td>
                        <StatusBadge status={d.alert_level || 'MEDIUM'} type="severity" />
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            d.verification_status ||
                            (d.alert_level === 'CRITICAL' ? 'REQUIRES_VERIFICATION' : 'GROUND_VERIFIED')
                          }
                          type="verification"
                        />
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectDetection(d);
                            focusOnDetectionInMap(d);
                          }}
                          className="btn-secondary"
                          style={{
                            padding: '4px 9px',
                            fontSize: '11px',
                            borderColor: isSelected ? 'var(--primary-cyan)' : undefined,
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
