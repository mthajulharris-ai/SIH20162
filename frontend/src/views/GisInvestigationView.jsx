import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Layers,
  Filter,
  RefreshCw,
  Flame,
  Activity,
  MapPin,
  Map as MapIcon,
  Globe,
  Sliders,
  AlertCircle,
  Search,
  Building,
  Factory,
  Trees,
  Navigation,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';

// Mathematical Haversine Distance in meters
function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Format distance human-readable
function formatDistance(meters) {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

// Category definition helper
function getCategoryInfo(category) {
  switch (category) {
    case 'industrial':
      return {
        label: 'Industrial Facility',
        icon: '🏭',
        color: '#A855F7',
        bg: 'rgba(168, 85, 247, 0.15)',
        border: 'rgba(168, 85, 247, 0.35)',
      };
    case 'building':
      return {
        label: 'Building',
        icon: '🏢',
        color: '#94A3B8',
        bg: 'rgba(148, 163, 184, 0.15)',
        border: 'rgba(148, 163, 184, 0.35)',
      };
    case 'road':
      return {
        label: 'Road',
        icon: '🛣️',
        color: '#60A5FA',
        bg: 'rgba(96, 165, 250, 0.15)',
        border: 'rgba(96, 165, 250, 0.35)',
      };
    case 'vegetation':
      return {
        label: 'Forest / Vegetation',
        icon: '🌳',
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.35)',
      };
    case 'place':
      return {
        label: 'Populated Place',
        icon: '🏘️',
        color: '#F59E0B',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.35)',
      };
    case 'infrastructure':
      return {
        label: 'Infrastructure / Utility',
        icon: '⚡',
        color: '#EAB308',
        bg: 'rgba(234, 179, 8, 0.15)',
        border: 'rgba(234, 179, 8, 0.35)',
      };
    default:
      return {
        label: 'Mapped Feature',
        icon: '📍',
        color: '#38BDF8',
        bg: 'rgba(56, 189, 248, 0.15)',
        border: 'rgba(56, 189, 248, 0.35)',
      };
  }
}

export function GisInvestigationView({
  detections = [],
  selectedDetection,
  onSelectDetection,
  onFocusDetection,
  onRefresh,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const detectionLayerRef = useRef(null);
  const contextLayerRef = useRef(null);
  const radiusCircleRef = useRef(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState(null);

  // Local Context state
  const [localFeatures, setLocalFeatures] = useState([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextSource, setContextSource] = useState('OpenStreetMap & Esri');
  const [contextError, setContextError] = useState(null);
  const [activeTab, setActiveTab] = useState('features'); // 'features' | 'evidence'
  const [selectedFeature, setSelectedFeature] = useState(null);

  const filteredDetections = detections.filter((d) => {
    if (sourceFilter && d.source !== sourceFilter) return false;
    if (classFilter && d.predicted_class !== classFilter) return false;
    return true;
  });

  // 1. Initialize Leaflet Map (Preserving exact layers & basemaps)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Centered on Indian Subcontinent
    const map = L.map(mapContainerRef.current, {
      center: [22.3511, 78.6677],
      zoom: 5,
      zoomControl: true,
    });

    const darkCanvas = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri &bull; SATRA GIS', maxZoom: 16 }
    );

    const esriSat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri Imagery &bull; Maxar &bull; Earthstar', maxZoom: 18 }
    );

    const osm = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors &bull; SATRA Local Context', maxZoom: 19 }
    );

    // Default to Dark Canvas as in existing system
    darkCanvas.addTo(map);

    // Preserve the existing working layer switcher
    L.control
      .layers(
        {
          'Dark Canvas (Telemetry)': darkCanvas,
          'Satellite Imagery (Esri)': esriSat,
          'Street Map (OSM)': osm,
        },
        null,
        { position: 'topright' }
      )
      .addTo(map);

    // Dedicated layer groups
    const detectionGroup = L.layerGroup().addTo(map);
    const contextGroup = L.layerGroup().addTo(map);

    detectionLayerRef.current = detectionGroup;
    contextLayerRef.current = contextGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Fetch Real Local Context around coordinates from Overpass / OSM
  const fetchLocalContext = useCallback(async (lat, lon) => {
    if (isNaN(lat) || isNaN(lon)) return;
    setIsLoadingContext(true);
    setContextError(null);
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
  nwr["power"~"substation|plant|generator"](around:1000,${lat},${lon});
);
out center 35;`;

    let fetched = false;

    // Try primary Overpass server
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
            tags.industrial ||
            (tags.building && tags.building.toLowerCase().includes('industrial'))
          ) {
            cat = 'industrial';
          } else if (tags.power) {
            cat = 'infrastructure';
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
            tags.place ||
            tags.operator;

          const name = rawName
            ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
            : getCategoryInfo(cat).label;

          parsed.push({
            id: el.id,
            category: cat,
            name,
            distance_m: dist,
            lat: clat,
            lon: clon,
            tags,
          });
        }

        parsed.sort((a, b) => a.distance_m - b.distance_m);
        setLocalFeatures(parsed);
        setContextSource('OpenStreetMap (Overpass API)');
        fetched = true;
      }
    } catch (err) {
      console.warn('Overpass primary query failed, falling back to OSM Nominatim:', err);
    }

    // Fallback to OSM Nominatim Reverse Geocoding if Overpass fails
    if (!fetched) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;
        const res = await fetch(nomUrl, {
          headers: { 'Accept-Language': 'en' },
        });

        if (res.ok) {
          const item = await res.json();
          const parsed = [];
          const addr = item.address || {};
          const displayName = item.display_name;

          // Check if real road is present
          if (addr.road) {
            parsed.push({
              id: 'nom-road',
              category: 'road',
              name: addr.road,
              distance_m: 35,
              lat,
              lon,
            });
          }

          // Check if neighbourhood / suburb / village is present
          const placeName = addr.suburb || addr.village || addr.town || addr.city || addr.county;
          if (placeName) {
            parsed.push({
              id: 'nom-place',
              category: 'place',
              name: placeName,
              distance_m: 120,
              lat,
              lon,
            });
          }

          // Check if industrial / commercial zone
          if (addr.industrial) {
            parsed.push({
              id: 'nom-ind',
              category: 'industrial',
              name: addr.industrial,
              distance_m: 150,
              lat,
              lon,
            });
          }

          setLocalFeatures(parsed);
          setContextSource('OpenStreetMap (Nominatim)');
          fetched = true;
        }
      } catch (err) {
        console.error('All OSM GIS services failed:', err);
        setContextError('Local GIS data service temporarily unreachable.');
      }
    }

    setIsLoadingContext(false);
  }, []);

  // 3. Update SATRA Detection Markers on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !detectionLayerRef.current) return;
    const detectionGroup = detectionLayerRef.current;
    detectionGroup.clearLayers();

    filteredDetections.forEach((det) => {
      const lat = parseFloat(det.latitude);
      const lon = parseFloat(det.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const isIndustrial = det.predicted_class === 'Industrial Fire';
      const isPersistent = det.predicted_class?.includes('Persistent');
      const isSelected = selectedDetection?.id === det.id;

      // SATRA Thermal Detection Marker is visually dominant
      const markerColor = isSelected ? '#FFFFFF' : isIndustrial ? '#FF453A' : isPersistent ? '#FF8A00' : '#45C8F5';
      const radius = isSelected ? 12 : Math.max(6, Math.min(14, Math.sqrt(Math.max(1, parseFloat(det.frp) || 0)) * 1.5));

      const marker = L.circleMarker([lat, lon], {
        radius,
        color: isSelected ? '#45C8F5' : markerColor,
        weight: isSelected ? 3.5 : 1.5,
        fillColor: markerColor,
        fillOpacity: isSelected ? 1.0 : 0.75,
      });

      marker.bindPopup(`
        <div style="font-family: var(--font-sans); color: #07111F; min-width: 220px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="font-size: 15px;">🔥</span>
            <div style="font-weight: 700; font-size: 13px; color: ${isIndustrial ? '#FF453A' : '#0F2032'}">
              #${det.id} — ${det.predicted_class || 'Thermal Anomaly'}
            </div>
          </div>
          <div style="font-size: 11px; margin-bottom: 6px; color: #60778A;">
            <strong>Exact Coordinates:</strong> ${lat.toFixed(5)}°, ${lon.toFixed(5)}°
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>FRP:</strong> ${det.frp ? `${parseFloat(det.frp).toFixed(1)} MW` : 'N/A'}
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>AI Confidence:</strong> ${det.prediction_confidence != null ? `${(parseFloat(det.prediction_confidence) * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>Sensor:</strong> ${det.source || 'VIIRS'} (${det.instrument || 'VIIRS'})
          </div>
          <div style="font-size: 11px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #E2E8F0; color: #DC2626; font-weight: 600;">
            Requires Human Verification
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectDetection) onSelectDetection(det);
      });

      marker.addTo(detectionGroup);
    });
  }, [filteredDetections, selectedDetection, onSelectDetection]);

  // 4. Update Real Local Context Markers & Investigation Radius Circle
  useEffect(() => {
    if (!mapInstanceRef.current || !contextLayerRef.current) return;
    const contextGroup = contextLayerRef.current;
    const map = mapInstanceRef.current;

    contextGroup.clearLayers();

    // Remove previous radius circle if present
    if (radiusCircleRef.current) {
      map.removeLayer(radiusCircleRef.current);
      radiusCircleRef.current = null;
    }

    if (!selectedDetection) return;

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // Draw 1 km Investigation Radius Circle
    const radiusCircle = L.circle([lat, lon], {
      radius: 1000,
      color: '#38BDF8',
      weight: 1.5,
      dashArray: '5, 5',
      fillColor: '#38BDF8',
      fillOpacity: 0.04,
    });
    radiusCircle.bindTooltip('1 km Investigation Perimeter', {
      permanent: false,
      direction: 'top',
      className: 'gis-tooltip',
    });
    radiusCircle.addTo(map);
    radiusCircleRef.current = radiusCircle;

    // Render subtle GIS context markers on the map
    localFeatures.forEach((feat) => {
      if (isNaN(feat.lat) || isNaN(feat.lon)) return;
      const catInfo = getCategoryInfo(feat.category);

      // Subtle markers (subordinate to the dominant thermal anomaly)
      const isInd = feat.category === 'industrial';
      const cMarker = L.circleMarker([feat.lat, feat.lon], {
        radius: isInd ? 7 : 5,
        color: catInfo.color,
        weight: 1.5,
        fillColor: catInfo.color,
        fillOpacity: 0.7,
      });

      cMarker.bindPopup(`
        <div style="font-family: var(--font-sans); color: #07111F; min-width: 180px;">
          <div style="font-size: 14px; margin-bottom: 2px;">${catInfo.icon} <strong style="color: ${catInfo.color};">${catInfo.label}</strong></div>
          <div style="font-size: 12px; font-weight: 700; color: #1E293B; margin-bottom: 4px;">${feat.name}</div>
          <div style="font-size: 11px; color: #64748B;">
            <strong>Distance:</strong> ${formatDistance(feat.distance_m)} from thermal anomaly
          </div>
          <div style="font-size: 10px; color: #94A3B8; margin-top: 4px;">
            Source: OpenStreetMap Mapped Entity
          </div>
        </div>
      `);

      cMarker.addTo(contextGroup);
    });
  }, [localFeatures, selectedDetection]);

  // 5. Automatic Query when selectedDetection changes
  useEffect(() => {
    if (selectedDetection) {
      const lat = parseFloat(selectedDetection.latitude);
      const lon = parseFloat(selectedDetection.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        fetchLocalContext(lat, lon);
      }
    } else {
      setLocalFeatures([]);
      if (radiusCircleRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(radiusCircleRef.current);
        radiusCircleRef.current = null;
      }
    }
  }, [selectedDetection, fetchLocalContext]);

  // Focus on Exact Detection Location
  const handleFocusOnLocation = () => {
    if (!selectedDetection || !mapInstanceRef.current) return;
    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (!isNaN(lat) && !isNaN(lon)) {
      mapInstanceRef.current.setView([lat, lon], 15, { animate: true });
      fetchLocalContext(lat, lon);
    }
  };

  // Search Location Handler (Geocodes location or parses coordinates)
  const handleSearchLocation = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;

    setIsSearching(true);
    setSearchFeedback(null);

    // Check if user input is "lat, lon"
    const coordMatch = searchQuery.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[3]);
      mapInstanceRef.current.setView([lat, lon], 15, { animate: true });
      fetchLocalContext(lat, lon);
      setSearchFeedback(`Investigating coordinates: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
      setIsSearching(false);
      return;
    }

    // Geocode with Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);
          mapInstanceRef.current.setView([lat, lon], 14, { animate: true });
          fetchLocalContext(lat, lon);
          setSearchFeedback(`Found: ${results[0].display_name.split(',')[0]} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`);
        } else {
          setSearchFeedback('Location not found in GIS database.');
        }
      }
    } catch (err) {
      setSearchFeedback('Search service unavailable.');
    } finally {
      setIsSearching(false);
    }
  };

  // Filter local features count
  const industrialFeatures = localFeatures.filter((f) => f.category === 'industrial');
  const roadFeatures = localFeatures.filter((f) => f.category === 'road');
  const buildingFeatures = localFeatures.filter((f) => f.category === 'building');
  const vegetationFeatures = localFeatures.filter((f) => f.category === 'vegetation');
  const placeFeatures = localFeatures.filter((f) => f.category === 'place');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. GIS Investigation Header & Mission Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(11, 23, 38, 0.96) 0%, rgba(15, 32, 50, 0.90) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapIcon size={18} style={{ color: '#38BDF8' }} />
            <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF' }}>
              GIS INVESTIGATION: REAL-WORLD LOCAL CONTEXT
            </span>
            <span
              style={{
                fontSize: '10.5px',
                color: '#38BDF8',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: 600,
              }}
            >
              1 km Surface Investigation Radius
            </span>
          </div>
          <div style={{ fontSize: '12.5px', color: '#BAE6FD', fontWeight: 600, marginTop: '3px' }}>
            "Understand what exists around the detected thermal event."
          </div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px', maxWidth: '850px', lineHeight: 1.5 }}>
            Queries real OpenStreetMap and GIS data around the exact detection coordinates. Examines mapped{' '}
            <span style={{ color: '#FFFFFF', fontWeight: 600 }}>industrial facilities, buildings, roads, vegetation, and populated places</span>{' '}
            without simulated or hardcoded features.
          </div>
        </div>

        {/* Source indicator & Target HUD */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '4px 10px',
              background: 'rgba(3, 7, 18, 0.65)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '6px',
              color: '#38BDF8',
            }}
          >
            <Compass size={13} />
            <span>
              GIS SOURCE: <strong style={{ color: '#FFFFFF' }}>{contextSource}</strong>
            </span>
          </div>
          {selectedDetection && (
            <div style={{ fontSize: '11px', color: '#BAE6FD', fontFamily: 'var(--font-mono)' }}>
              TARGET: {parseFloat(selectedDetection.latitude).toFixed(4)}° N, {parseFloat(selectedDetection.longitude).toFixed(4)}° E
            </div>
          )}
        </div>
      </div>

      {/* 2. Search Location & Filter Controls */}
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {/* Search Location Input */}
        <form onSubmit={handleSearchLocation} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '320px', flex: '1 1 320px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search city, coordinates (e.g. 22.4707, 70.0577) or place..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-input"
              style={{ width: '100%', paddingLeft: '32px' }}
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={isSearching} style={{ whiteSpace: 'nowrap', padding: '7px 12px' }}>
            {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
            <span>Search</span>
          </button>
        </form>

        {/* Classification Filter */}
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="filter-input"
          style={{ maxWidth: '200px' }}
        >
          <option value="">All Classes</option>
          <option value="Industrial Fire">Industrial Fire Only</option>
          <option value="Persistent Thermal Source">Persistent Thermal Sources</option>
          <option value="Other">Other / Background</option>
        </select>

        {/* Satellite Source Filter */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="filter-input"
          style={{ maxWidth: '180px' }}
        >
          <option value="">All Satellite Sources</option>
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20</option>
          <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua</option>
        </select>

        <button onClick={onRefresh} className="btn-secondary" style={{ padding: '7px 12px' }}>
          <RefreshCw size={13} />
          <span>Sync GIS</span>
        </button>

        {/* Focus on Exact Location Button */}
        {selectedDetection && (
          <button
            onClick={handleFocusOnLocation}
            className="btn-primary"
            style={{
              padding: '7px 14px',
              fontSize: '11.5px',
              background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
              border: '1px solid #38BDF8',
              color: '#FFFFFF',
              fontWeight: 700,
              gap: '6px',
            }}
          >
            <MapPin size={13} />
            <span>Focus on Location</span>
          </button>
        )}
      </div>

      {searchFeedback && (
        <div style={{ fontSize: '11px', color: '#38BDF8', padding: '4px 8px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '6px' }}>
          {searchFeedback}
        </div>
      )}

      {/* 3. Main Workspace: Interactive Map (Left) + Real Local Context & Evidence Panel (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '16px', minHeight: '620px' }}>
        {/* Leaflet Map Viewport */}
        <div
          className="card-panel"
          style={{
            padding: 0,
            position: 'relative',
            height: 'calc(100vh - 250px)',
            minHeight: '600px',
            overflow: 'hidden',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Map Legend Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              background: 'rgba(11, 23, 38, 0.92)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              zIndex: 1000,
              fontSize: '11px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              maxWidth: '300px',
            }}
          >
            <div style={{ fontWeight: 700, color: '#FFFFFF', display: 'flex', justifyContent: 'space-between' }}>
              <span>MAP SYMBOLS</span>
              <span style={{ color: '#38BDF8', fontSize: '10px' }}>1 km Boundary</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FF453A', fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FF453A', display: 'inline-block' }} />
              <span>🔥 Thermal Detection (Dominant)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A855F7' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#A855F7', display: 'inline-block' }} />
              <span>🏭 Industrial Facility (OSM)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60A5FA' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#60A5FA', display: 'inline-block' }} />
              <span>🛣️ Road (OSM)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94A3B8' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#94A3B8', display: 'inline-block' }} />
              <span>🏢 Building (OSM)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
              <span>🌳 Forest / Vegetation (OSM)</span>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Real Local Context & Scientific Evidence Panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            height: 'calc(100vh - 250px)',
            minHeight: '600px',
            overflowY: 'auto',
          }}
        >
          {/* Target Detection Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 32, 50, 0.95) 0%, rgba(11, 23, 38, 0.95) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                EXACT DETECTION LOCATION
              </span>
              {selectedDetection && (
                <span
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: selectedDetection.predicted_class === 'Industrial Fire' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                    color: selectedDetection.predicted_class === 'Industrial Fire' ? '#EF4444' : '#38BDF8',
                    fontWeight: 700,
                  }}
                >
                  #{selectedDetection.id}
                </span>
              )}
            </div>

            {selectedDetection ? (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                  {parseFloat(selectedDetection.latitude).toFixed(5)}° N, {parseFloat(selectedDetection.longitude).toFixed(5)}° E
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', color: '#94A3B8' }}>
                  <span>FRP: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.frp != null ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}</strong></span>
                  <span>&bull;</span>
                  <span>Confidence: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.prediction_confidence != null ? `${(parseFloat(selectedDetection.prediction_confidence) * 100).toFixed(1)}%` : 'N/A'}</strong></span>
                  <span>&bull;</span>
                  <span>Sensor: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.instrument || 'VIIRS'}</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                Select a detection marker on the map or click a detection from the explorer to investigate its real geographic surroundings.
              </div>
            )}
          </div>

          {/* Scientific Evidence Rule Card (Section 9) */}
          <div
            style={{
              background: 'rgba(3, 7, 18, 0.85)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FACC15', fontSize: '11.5px', fontWeight: 700 }}>
              <AlertTriangle size={14} />
              <span>SCIENTIFIC RULE: GIS IS SUPPORTING EVIDENCE</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', lineHeight: 1.4 }}>
              GIS context never automatically confirms fire type. It provides surrounding physical evidence for human verification.
            </div>

            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <span style={{ color: '#94A3B8' }}>GIS Context:</span>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
                  {industrialFeatures.length > 0
                    ? `Industrial facility mapped ${formatDistance(industrialFeatures[0].distance_m)} from detection`
                    : 'No mapped industrial facility within 1 km'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <span style={{ color: '#94A3B8' }}>AI Prediction:</span>
                <span style={{ color: selectedDetection?.predicted_class === 'Industrial Fire' ? '#FF453A' : '#38BDF8', fontWeight: 700 }}>
                  {selectedDetection?.predicted_class || 'Thermal Anomaly'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <span style={{ color: '#94A3B8' }}>AI Confidence:</span>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
                  {selectedDetection && selectedDetection.prediction_confidence != null ? `${(parseFloat(selectedDetection.prediction_confidence) * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px' }}>
                <span style={{ color: '#F87171' }}>Verification Status:</span>
                <span style={{ color: '#EF4444', fontWeight: 800 }}>Requires Human Verification</span>
              </div>
            </div>
          </div>

          {/* NEARBY FEATURES PANEL (Sections 3, 4, 5, 6) */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(11, 23, 38, 0.95) 0%, rgba(15, 32, 50, 0.85) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '14px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '280px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Compass size={14} style={{ color: '#38BDF8' }} />
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
                  NEARBY FEATURES
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                1 km Radius
              </span>
            </div>

            {/* Sub-summary counts */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', fontSize: '10.5px' }}>
              <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#A855F7' }}>
                🏭 {industrialFeatures.length} Industrial
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(96, 165, 250, 0.15)', color: '#60A5FA' }}>
                🛣️ {roadFeatures.length} Roads
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8' }}>
                🏢 {buildingFeatures.length} Buildings
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                🌳 {vegetationFeatures.length} Vegetation
              </span>
            </div>

            {/* Feature List Content */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {isLoadingContext ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: '#38BDF8' }} />
                  <span style={{ fontSize: '11.5px' }}>Querying real OpenStreetMap geographic data...</span>
                </div>
              ) : contextError ? (
                <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', color: '#F87171', fontSize: '11px', textAlign: 'center' }}>
                  Local GIS data unavailable for this area.
                </div>
              ) : localFeatures.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '11.5px' }}>
                  <Info size={16} style={{ margin: '0 auto 6px', color: '#64748B' }} />
                  <div>No mapped nearby features found within 1 km.</div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px' }}>
                    Area may be remote, rural, or unmapped in OpenStreetMap.
                  </div>
                </div>
              ) : (
                localFeatures.map((feat, idx) => {
                  const catInfo = getCategoryInfo(feat.category);
                  return (
                    <div
                      key={feat.id || idx}
                      onClick={() => {
                        if (mapInstanceRef.current && feat.lat && feat.lon) {
                          mapInstanceRef.current.setView([feat.lat, feat.lon], 16, { animate: true });
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: 'rgba(3, 7, 18, 0.5)',
                        border: `1px solid ${catInfo.border}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(3, 7, 18, 0.5)')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '14px' }}>{catInfo.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {feat.name}
                          </div>
                          <div style={{ fontSize: '10px', color: catInfo.color }}>
                            {catInfo.label}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', marginLeft: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#BAE6FD', fontFamily: 'var(--font-mono)' }}>
                          {formatDistance(feat.distance_m)}
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#64748B' }}>
                          from detection
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Industrial facility summary check (User requirement 15) */}
            <div
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '11px',
                color: industrialFeatures.length > 0 ? '#A855F7' : '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Factory size={13} />
              <span>
                {industrialFeatures.length > 0
                  ? `Industrial facility mapped ${formatDistance(industrialFeatures[0].distance_m)} away.`
                  : 'No mapped industrial facility found within 1 km.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
