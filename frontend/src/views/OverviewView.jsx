import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import {
  Search,
  Flame,
  ShieldAlert,
  Satellite,
  Compass,
  Layers,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Crosshair,
  Eye,
  AlertTriangle,
  Radio,
  Wind,
  Building2,
  X,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

// Comprehensive mock dataset fallback so map is always rich & interactive
const DEFAULT_ANOMALIES = [
  {
    id: 'SAT-20481',
    name: 'Coimbatore Region',
    region: 'Tamil Nadu',
    latitude: 11.0168,
    longitude: 76.9558,
    temperature: 68.4,
    detected: '12:42 PM',
    confidence: 94.7,
    satellite: 'INSAT / Sentinel',
    riskLevel: 'HIGH',
    frp: 46.2,
    type: 'thermal',
    predicted_class: 'Industrial Thermal Source',
  },
  {
    id: 'SAT-10923',
    name: 'Hazira Industrial Zone',
    region: 'Gujarat',
    latitude: 21.1147,
    longitude: 72.6468,
    temperature: 78.4,
    detected: '11:15 AM',
    confidence: 98.2,
    satellite: 'VIIRS / SNPP',
    riskLevel: 'CRITICAL',
    frp: 88.5,
    type: 'fire',
    predicted_class: 'Industrial Petrochemical Flare',
  },
  {
    id: 'SAT-40291',
    name: 'Jamnagar Coastal Complex',
    region: 'Gujarat',
    latitude: 22.4707,
    longitude: 70.0577,
    temperature: 59.2,
    detected: '10:30 AM',
    confidence: 89.4,
    satellite: 'MODIS Aqua',
    riskLevel: 'MODERATE',
    frp: 34.0,
    type: 'thermal',
    predicted_class: 'Refinery Processing Node',
  },
  {
    id: 'SAT-88312',
    name: 'Western Ghats Biosphere',
    region: 'Kerala Border',
    latitude: 11.2355,
    longitude: 76.5412,
    temperature: 72.3,
    detected: '01:05 PM',
    confidence: 93.1,
    satellite: 'Sentinel-3 SLSTR',
    riskLevel: 'CRITICAL',
    frp: 62.1,
    type: 'fire',
    predicted_class: 'Forest Vegetation Fire Front',
  },
  {
    id: 'SAT-55204',
    name: 'Visakhapatnam Steel Belt',
    region: 'Andhra Pradesh',
    latitude: 17.6868,
    longitude: 83.2185,
    temperature: 64.1,
    detected: '09:45 AM',
    confidence: 91.5,
    satellite: 'INSAT-3DR',
    riskLevel: 'HIGH',
    frp: 42.0,
    type: 'thermal',
    predicted_class: 'Blast Furnace Smelting Anomaly',
  },
  {
    id: 'SAT-33109',
    name: 'Korba Thermal Energy Hub',
    region: 'Chhattisgarh',
    latitude: 22.3595,
    longitude: 82.7501,
    temperature: 61.8,
    detected: '11:50 AM',
    confidence: 88.0,
    satellite: 'Landsat 9 TIRS',
    riskLevel: 'MODERATE',
    frp: 31.5,
    type: 'thermal',
    predicted_class: 'Power Generation Cooling Anomaly',
  },
];

// Infrastructure landmarks
const INFRASTRUCTURE_NODES = [
  { name: 'Kudankulam Nuclear Station', lat: 8.1697, lng: 77.7126, type: 'nuclear' },
  { name: 'Chennai Ennore Port', lat: 13.2644, lng: 80.3278, type: 'port' },
  { name: 'Mundra Ultra Mega Power', lat: 22.8258, lng: 69.5244, type: 'power' },
  { name: 'Mangalore Refinery & Petrochem', lat: 12.9961, lng: 74.8315, type: 'petro' },
];

// Satellite coverage footprint polygons (orbital footprints)
const SATELLITE_FOOTPRINTS = [
  {
    name: 'INSAT-3DR Geostationary Footprint',
    center: [16.5, 77.5],
    radius: 750000, // 750 km
    sensor: 'Dual-Channel Imager & Sounder',
    color: '#06B6D4',
  },
  {
    name: 'Sentinel-3 Swath SLSTR 04',
    center: [12.5, 76.8],
    radius: 380000,
    sensor: 'SLSTR High-Res Infrared',
    color: '#3B82F6',
  },
];

export function OverviewView({
  detections = [],
  onNavigate,
  selectedDetection,
  onSelectDetection,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    darkLayer: null,
    satLayer: null,
    anomalyGroup: null,
    footprintGroup: null,
    infraGroup: null,
    weatherGroup: null,
  });

  // Floating Control States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBaseMap, setActiveBaseMap] = useState('dark'); // 'dark' | 'satellite'
  const [activeChips, setActiveChips] = useState({
    anomalies: true,
    fireRisk: true,
    satellites: true,
    highRisk: false,
    weather: false,
    infrastructure: true,
  });

  const [activeCardDetection, setActiveCardDetection] = useState(DEFAULT_ANOMALIES[0]);
  const [isCardVisible, setIsCardVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);

  // Merge backend detections with rich mock defaults
  const anomalyList = useMemo(() => {
    if (detections && detections.length > 0) {
      const parsedBackend = detections.slice(0, 150).map((d, index) => {
        const lat = parseFloat(d.latitude);
        const lng = parseFloat(d.longitude);
        if (isNaN(lat) || isNaN(lng)) return null;

        const tempC = d.brightness
          ? (parseFloat(d.brightness) > 200 ? (parseFloat(d.brightness) - 273.15).toFixed(1) : parseFloat(d.brightness).toFixed(1))
          : (60 + (index % 25)).toFixed(1);

        const risk = (d.alert_level || (tempC > 70 ? 'CRITICAL' : tempC > 60 ? 'HIGH' : 'MODERATE')).toUpperCase();

        return {
          id: d.id ? (String(d.id).startsWith('SAT-') ? d.id : `SAT-${d.id}`) : `SAT-BK-${index + 100}`,
          name: d.location_name || `${(d.predicted_class || 'Thermal Anomaly')}`,
          region: `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`,
          latitude: lat,
          longitude: lng,
          temperature: parseFloat(tempC),
          detected: d.acq_time ? `${d.acq_time} UTC` : '12:42 PM',
          confidence: d.prediction_confidence ? (parseFloat(d.prediction_confidence) * 100).toFixed(1) : 94.7,
          satellite: d.source || 'INSAT / Sentinel',
          riskLevel: risk,
          frp: d.frp ? parseFloat(d.frp).toFixed(1) : 38.5,
          type: (d.predicted_class || '').toLowerCase().includes('fire') ? 'fire' : 'thermal',
          raw: d,
        };
      }).filter(Boolean);

      return parsedBackend.length > 0 ? parsedBackend : DEFAULT_ANOMALIES;
    }
    return DEFAULT_ANOMALIES;
  }, [detections]);

  // Filter anomalies based on search and chip toggles
  const filteredAnomalies = useMemo(() => {
    return anomalyList.filter((a) => {
      // Chip filters
      if (activeChips.highRisk && a.riskLevel !== 'HIGH' && a.riskLevel !== 'CRITICAL') return false;
      if (!activeChips.anomalies && a.type === 'thermal') return false;
      if (!activeChips.fireRisk && a.type === 'fire') return false;

      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = a.name.toLowerCase().includes(q);
        const matchesRegion = a.region.toLowerCase().includes(q);
        const matchesSat = a.satellite.toLowerCase().includes(q);
        const matchesCoords = `${a.latitude},${a.longitude}`.includes(q);
        const matchesId = a.id.toLowerCase().includes(q);
        if (!matchesName && !matchesRegion && !matchesSat && !matchesCoords && !matchesId) return false;
      }

      return true;
    });
  }, [anomalyList, activeChips, searchQuery]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [14.0, 77.5],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    const darkLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16 }
    );

    const satLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18 }
    );

    darkLayer.addTo(map);

    const footprintGroup = L.layerGroup().addTo(map);
    const infraGroup = L.layerGroup().addTo(map);
    const weatherGroup = L.layerGroup().addTo(map);
    const anomalyGroup = L.layerGroup().addTo(map);

    layersRef.current = {
      darkLayer,
      satLayer,
      anomalyGroup,
      footprintGroup,
      infraGroup,
      weatherGroup,
    };
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Base Map Toggle
  useEffect(() => {
    const { darkLayer, satLayer } = layersRef.current;
    const map = mapInstanceRef.current;
    if (!map || !darkLayer || !satLayer) return;

    if (activeBaseMap === 'satellite') {
      if (map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
      if (!map.hasLayer(satLayer)) satLayer.addTo(map);
    } else {
      if (map.hasLayer(satLayer)) map.removeLayer(satLayer);
      if (!map.hasLayer(darkLayer)) darkLayer.addTo(map);
    }
  }, [activeBaseMap]);

  // Render Satellite Footprints
  useEffect(() => {
    const { footprintGroup } = layersRef.current;
    if (!footprintGroup) return;

    footprintGroup.clearLayers();

    if (activeChips.satellites) {
      SATELLITE_FOOTPRINTS.forEach((fp) => {
        L.circle(fp.center, {
          radius: fp.radius,
          color: fp.color,
          weight: 1.5,
          dashArray: '5, 5',
          fillColor: fp.color,
          fillOpacity: 0.04,
        })
          .bindPopup(`<div style="font-family: Inter, sans-serif; font-size: 12px; font-weight: 700; color: ${fp.color};">${fp.name}<br/><span style="font-weight:400; color: #94A3B8;">Sensor: ${fp.sensor}</span></div>`)
          .addTo(footprintGroup);
      });
    }
  }, [activeChips.satellites]);

  // Render Infrastructure Landmarks
  useEffect(() => {
    const { infraGroup } = layersRef.current;
    if (!infraGroup) return;

    infraGroup.clearLayers();

    if (activeChips.infrastructure) {
      INFRASTRUCTURE_NODES.forEach((inf) => {
        const infraIcon = L.divIcon({
          className: 'custom-infra-icon',
          html: `
            <div style="background: rgba(15, 23, 42, 0.85); border: 1.5px solid #38BDF8; border-radius: 6px; padding: 3px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);">
              <div style="width: 8px; height: 8px; background: #38BDF8; border-radius: 2px;"></div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        L.marker([inf.lat, inf.lng], { icon: infraIcon })
          .bindPopup(`<div style="font-family: Inter, sans-serif; font-size: 11.5px; font-weight: 700; color: #FFFFFF;">${inf.name}<br/><span style="font-weight: 400; color: #38BDF8;">Critical Infrastructure Node</span></div>`)
          .addTo(infraGroup);
      });
    }
  }, [activeChips.infrastructure]);

  // Render Thermal Anomaly Markers
  useEffect(() => {
    const { anomalyGroup } = layersRef.current;
    if (!anomalyGroup) return;

    anomalyGroup.clearLayers();

    filteredAnomalies.forEach((a) => {
      const isCritical = a.riskLevel === 'CRITICAL';
      const isHigh = a.riskLevel === 'HIGH';
      const color = isCritical ? '#EF4444' : isHigh ? '#F97316' : '#F59E0B';

      // Pulse halo icon for selected or critical anomaly
      const marker = L.circleMarker([a.latitude, a.longitude], {
        radius: isCritical ? 11 : 8,
        fillColor: color,
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.85,
      });

      marker.on('click', () => {
        setActiveCardDetection(a);
        setIsCardVisible(true);
        if (onSelectDetection) onSelectDetection(a.raw || a);
      });

      anomalyGroup.addLayer(marker);
    });
  }, [filteredAnomalies, onSelectDetection]);

  // Map Controls Helpers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  const handleCenterLocation = () => {
    if (activeCardDetection && mapInstanceRef.current) {
      mapInstanceRef.current.setView([activeCardDetection.latitude, activeCardDetection.longitude], 10, {
        animate: true,
      });
    } else {
      mapInstanceRef.current?.setView([14.0, 77.5], 6, { animate: true });
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const toggleChip = (chipKey) => {
    setActiveChips((prev) => ({ ...prev, [chipKey]: !prev[chipKey] }));
  };

  const handleViewDetails = () => {
    if (onSelectDetection && activeCardDetection) {
      onSelectDetection(activeCardDetection.raw || activeCardDetection);
    }
    if (onNavigate) {
      onNavigate('investigate');
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'CRITICAL': return '#EF4444';
      case 'HIGH': return '#F97316';
      case 'MODERATE': return '#EAB308';
      default: return '#10B981';
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - var(--header-height))', overflow: 'hidden', background: '#050B14' }}>
      
      {/* 1. Large Interactive Map Canvas (PRIMARY visual element) */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* 2. Top Floating Search & Filter Chips Bar */}
      <div style={{
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
        maxWidth: '720px',
        pointerEvents: 'auto',
      }}>
        {/* Floating Search Bar */}
        <div style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(11, 23, 38, 0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.55)',
          borderRadius: '10px',
          padding: '8px 16px',
        }}>
          <Search size={18} style={{ color: 'var(--soft-cyan)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location, coordinates, satellite..."
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
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
            >
              <X size={16} />
            </button>
          )}
          <div style={{ height: '18px', width: '1px', background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
            {filteredAnomalies.length} HOTSPOTS
          </span>
        </div>

        {/* Compact Filter Chips */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {[
            { key: 'anomalies', label: 'Thermal Anomalies', icon: Flame, color: '#F97316' },
            { key: 'fireRisk', label: 'Fire Risk', icon: ShieldAlert, color: '#EF4444' },
            { key: 'satellites', label: 'Satellites', icon: Satellite, color: '#38BDF8' },
            { key: 'highRisk', label: 'High Risk', icon: AlertTriangle, color: '#FF1744' },
            { key: 'weather', label: 'Weather', icon: Wind, color: '#6EDCFF' },
            { key: 'infrastructure', label: 'Infrastructure', icon: Building2, color: '#8DE7FF' },
          ].map((chip) => {
            const Icon = chip.icon;
            const active = activeChips[chip.key];
            return (
              <button
                key={chip.key}
                onClick={() => toggleChip(chip.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 11px',
                  borderRadius: '20px',
                  fontSize: '11.5px',
                  fontWeight: active ? 700 : 500,
                  background: active ? 'rgba(11, 23, 38, 0.95)' : 'rgba(11, 23, 38, 0.7)',
                  backdropFilter: 'blur(10px)',
                  border: active ? `1px solid ${chip.color}` : '1px solid var(--border-subtle)',
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  boxShadow: active ? `0 0 12px ${chip.color}33` : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={13} style={{ color: active ? chip.color : 'var(--text-muted)' }} />
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Map Controls on the Right */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'auto',
      }}>
        <div style={{
          background: 'rgba(11, 23, 38, 0.9)',
          backdropFilter: 'blur(14px)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}>
          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              width: '38px',
              height: '38px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={18} />
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              width: '38px',
              height: '38px',
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Minus size={18} />
          </button>
        </div>

        {/* Layers Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsLayersMenuOpen(prev => !prev)}
            title="Map Layers"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: isLayersMenuOpen ? 'rgba(56, 189, 248, 0.25)' : 'rgba(11, 23, 38, 0.9)',
              backdropFilter: 'blur(14px)',
              border: '1px solid var(--border-color)',
              color: isLayersMenuOpen ? 'var(--primary-cyan)' : '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            <Layers size={18} />
          </button>

          {/* Layers Popover Menu */}
          {isLayersMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 0,
              right: '48px',
              background: 'rgba(11, 23, 38, 0.96)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px 14px',
              width: '180px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '11.5px',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--soft-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                Map Layers
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activeChips.satellites}
                  onChange={() => toggleChip('satellites')}
                  style={{ accentColor: 'var(--primary-cyan)' }}
                />
                Satellite Swaths
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activeChips.infrastructure}
                  onChange={() => toggleChip('infrastructure')}
                  style={{ accentColor: 'var(--primary-cyan)' }}
                />
                Infrastructure Nodes
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activeChips.anomalies}
                  onChange={() => toggleChip('anomalies')}
                  style={{ accentColor: 'var(--primary-cyan)' }}
                />
                Thermal Hotspots
              </label>
            </div>
          )}
        </div>

        {/* Satellite View Toggle */}
        <button
          onClick={() => setActiveBaseMap(prev => prev === 'dark' ? 'satellite' : 'dark')}
          title={activeBaseMap === 'dark' ? 'Switch to Satellite View' : 'Switch to Dark Canvas'}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: activeBaseMap === 'satellite' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(14px)',
            border: activeBaseMap === 'satellite' ? '1px solid var(--primary-cyan)' : '1px solid var(--border-color)',
            color: activeBaseMap === 'satellite' ? 'var(--primary-cyan)' : '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <Satellite size={18} />
        </button>

        {/* Center Location */}
        <button
          onClick={handleCenterLocation}
          title="Center Location"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--border-color)',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <Crosshair size={18} />
        </button>

        {/* Fullscreen */}
        <button
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--border-color)',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* 4. Compact Floating Event Info Card (when user clicks an anomaly) */}
      {isCardVisible && activeCardDetection && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          left: '24px',
          zIndex: 1000,
          width: '330px',
          maxWidth: 'calc(100% - 48px)',
          background: 'rgba(11, 23, 38, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
          padding: '16px 18px',
          pointerEvents: 'auto',
          animation: 'fadeIn 0.2s ease',
        }}>
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--soft-cyan)', textTransform: 'uppercase' }}>
                THERMAL EVENT
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                {activeCardDetection.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {activeCardDetection.region}
              </div>
            </div>

            <button
              onClick={() => setIsCardVisible(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Metric Grid Matching Specification Exactly */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Risk Level</div>
              <div style={{
                fontSize: '12.5px',
                fontWeight: 800,
                color: getRiskColor(activeCardDetection.riskLevel),
                marginTop: '2px',
              }}>
                {activeCardDetection.riskLevel}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Temperature</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#F97316', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {activeCardDetection.temperature}°C
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Detected</div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {activeCardDetection.detected}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confidence</div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#10B981', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {activeCardDetection.confidence}%
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Satellite</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {activeCardDetection.satellite}
              </div>
            </div>
          </div>

          {/* Action CTA: VIEW DETAILS */}
          <button
            onClick={handleViewDetails}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            <span>VIEW DETAILS</span>
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* 5. Live Situational Telemetry Footnote */}
      <div style={{
        position: 'absolute',
        bottom: '14px',
        right: '20px',
        zIndex: 990,
        background: 'rgba(5, 11, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        padding: '4px 10px',
        fontSize: '10.5px',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
        <span>SATRA LIVE SITUATIONAL GRID ACTIVE</span>
        <span>•</span>
        <span>PROJECTION: WGS84 WEB MERCATOR</span>
      </div>

    </div>
  );
}
