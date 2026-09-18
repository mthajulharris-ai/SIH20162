import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Route,
  Navigation,
  Flame,
  ShieldAlert,
  Wind,
  Satellite,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Compass,
  Maximize2,
  Minimize2,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';

const PRESET_ROUTES = [
  {
    id: 'coimbatore-ghats',
    name: 'Coimbatore Industrial -> Western Ghats Forest Corridor',
    fromName: 'Coimbatore Tech Park',
    fromCoords: [11.0168, 76.9558],
    toName: 'Western Ghats Biosphere',
    toCoords: [11.2355, 76.5412],
    distance: '42.8 km',
    estTime: '58 min',
    riskLevel: 'MODERATE',
    thermalExposure: 78,
    fireExposure: 61,
    weatherImpact: 42,
    satelliteCoverage: 91,
    waypoints: [
      { lat: 11.0168, lng: 76.9558, risk: 'LOW', temp: 34.2 },
      { lat: 11.0582, lng: 76.8821, risk: 'LOW', temp: 37.1 },
      { lat: 11.1124, lng: 76.7915, risk: 'MODERATE', temp: 48.6 },
      { lat: 11.1645, lng: 76.6834, risk: 'HIGH', temp: 64.8 },
      { lat: 11.1982, lng: 76.6102, risk: 'CRITICAL', temp: 72.3 },
      { lat: 11.2355, lng: 76.5412, risk: 'MODERATE', temp: 51.0 },
    ],
    hotspots: [
      { id: 'SAT-20481', name: 'Coimbatore Foothills Anomaly', lat: 11.182, lng: 76.651, temp: 68.4, frp: 46.2, risk: 'HIGH' },
      { id: 'SAT-20489', name: 'Ghats Timber Border Hotspot', lat: 11.205, lng: 76.598, temp: 72.3, frp: 62.1, risk: 'CRITICAL' },
    ],
    weather: { temp: '36.2°C', wind: '18.5 km/h WNW', humidity: '38%', condition: 'Dry Heatwave' },
  },
  {
    id: 'hazira-pipeline',
    name: 'Hazira LNG Complex -> Surat Industrial Corridor',
    fromName: 'Hazira Terminal Gate 3',
    fromCoords: [21.1147, 72.6468],
    toName: 'Surat North Logistics Hub',
    toCoords: [21.2421, 72.8423],
    distance: '28.4 km',
    estTime: '36 min',
    riskLevel: 'HIGH',
    thermalExposure: 84,
    fireExposure: 72,
    weatherImpact: 55,
    satelliteCoverage: 96,
    waypoints: [
      { lat: 21.1147, lng: 72.6468, risk: 'HIGH', temp: 66.8 },
      { lat: 21.1492, lng: 72.6912, risk: 'HIGH', temp: 69.4 },
      { lat: 21.1824, lng: 72.7485, risk: 'CRITICAL', temp: 74.2 },
      { lat: 21.2110, lng: 72.7932, risk: 'MODERATE', temp: 52.1 },
      { lat: 21.2421, lng: 72.8423, risk: 'LOW', temp: 36.4 },
    ],
    hotspots: [
      { id: 'SAT-10923', name: 'Hazira Cracker Flare Alpha', lat: 21.121, lng: 72.658, temp: 78.4, frp: 88.5, risk: 'CRITICAL' },
      { id: 'SAT-10940', name: 'Ichhapore Industrial Thermal', lat: 21.176, lng: 72.735, temp: 64.9, frp: 41.0, risk: 'HIGH' },
    ],
    weather: { temp: '38.4°C', wind: '22.0 km/h SW', humidity: '44%', condition: 'High Wind Velocity' },
  },
  {
    id: 'jamnagar-marine',
    name: 'Jamnagar Petrochemical -> Gulf Coastal Reserve',
    fromName: 'Jamnagar Refinery Node',
    fromCoords: [22.4707, 70.0577],
    toName: 'Vadinar Marine Terminal',
    toCoords: [22.4219, 69.7124],
    distance: '51.6 km',
    estTime: '1 hr 12 min',
    riskLevel: 'LOW',
    thermalExposure: 26,
    fireExposure: 19,
    weatherImpact: 31,
    satelliteCoverage: 88,
    waypoints: [
      { lat: 22.4707, lng: 70.0577, risk: 'MODERATE', temp: 47.3 },
      { lat: 22.4589, lng: 69.9612, risk: 'LOW', temp: 34.0 },
      { lat: 22.4412, lng: 69.8645, risk: 'LOW', temp: 32.8 },
      { lat: 22.4301, lng: 69.7891, risk: 'LOW', temp: 31.5 },
      { lat: 22.4219, lng: 69.7124, risk: 'LOW', temp: 30.2 },
    ],
    hotspots: [
      { id: 'SAT-40291', name: 'Motikhavdi Flare Anomaly', lat: 22.468, lng: 70.049, temp: 59.2, frp: 34.0, risk: 'MODERATE' },
    ],
    weather: { temp: '32.1°C', wind: '14.2 km/h W', humidity: '62%', condition: 'Coastal Inversion' },
  },
];

export function PathIntelligenceView({ onNavigate, onSelectDetection }) {
  const [selectedRouteId, setSelectedRouteId] = useState('coimbatore-ghats');
  const [fromInput, setFromInput] = useState(PRESET_ROUTES[0].fromName);
  const [toInput, setToInput] = useState(PRESET_ROUTES[0].toName);
  const [corridorBuffer, setCorridorBuffer] = useState(10); // km
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(PRESET_ROUTES[0]);
  const [activeBaseMap, setActiveBaseMap] = useState('dark'); // 'dark' | 'satellite'

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    darkLayer: null,
    satLayer: null,
    routeGroup: null,
    hotspotGroup: null,
  });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [11.12, 76.75],
      zoom: 11,
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

    const routeGroup = L.layerGroup().addTo(map);
    const hotspotGroup = L.layerGroup().addTo(map);

    layersRef.current = { darkLayer, satLayer, routeGroup, hotspotGroup };
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Base map toggle
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

  // Render Path and Hotspots on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const { routeGroup, hotspotGroup } = layersRef.current;
    if (!map || !routeGroup || !hotspotGroup || !activeAnalysis) return;

    routeGroup.clearLayers();
    hotspotGroup.clearLayers();

    const { waypoints, hotspots, fromCoords, toCoords } = activeAnalysis;

    // 1. Draw segmented risk polyline
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const segRisk = p2.risk || p1.risk;

      let segColor = '#10B981'; // LOW
      if (segRisk === 'MODERATE') segColor = '#EAB308';
      else if (segRisk === 'HIGH') segColor = '#F97316';
      else if (segRisk === 'CRITICAL') segColor = '#EF4444';

      // Glow halo
      L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: segColor,
        weight: 9,
        opacity: 0.3,
        lineCap: 'round',
      }).addTo(routeGroup);

      // Core crisp line
      L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: segColor,
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
      }).addTo(routeGroup);
    }

    // 2. Add Buffer Corridor Polygon
    const corridorCoords = waypoints.map(w => [w.lat, w.lng]);
    if (corridorCoords.length > 1) {
      L.polyline(corridorCoords, {
        color: '#38BDF8',
        weight: corridorBuffer * 2,
        opacity: 0.08,
        lineCap: 'round',
      }).addTo(routeGroup);
    }

    // 3. Origin & Destination Markers
    const originIcon = L.divIcon({
      className: 'custom-beacon-icon',
      html: `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(16, 185, 129, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #10B981; border: 2.5px solid #FFFFFF; box-shadow: 0 0 10px #10B981;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const destIcon = L.divIcon({
      className: 'custom-target-icon',
      html: `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(239, 68, 68, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #EF4444; border: 2.5px solid #FFFFFF; box-shadow: 0 0 10px #EF4444;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker(fromCoords, { icon: originIcon })
      .bindPopup(`<div style="font-family: Inter, sans-serif; font-size: 12px; font-weight: 700; color: #10B981;">ORIGIN: ${activeAnalysis.fromName}</div>`)
      .addTo(routeGroup);

    L.marker(toCoords, { icon: destIcon })
      .bindPopup(`<div style="font-family: Inter, sans-serif; font-size: 12px; font-weight: 700; color: #EF4444;">DESTINATION: ${activeAnalysis.toName}</div>`)
      .addTo(routeGroup);

    // 4. Hotspots along the route
    hotspots.forEach((h) => {
      const hColor = h.risk === 'CRITICAL' ? '#EF4444' : h.risk === 'HIGH' ? '#F97316' : '#F59E0B';
      const marker = L.circleMarker([h.lat, h.lng], {
        radius: 11,
        fillColor: hColor,
        color: '#FFFFFF',
        weight: 2,
        fillOpacity: 0.85,
      });

      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 200px; color: #0F172A;">
          <div style="font-weight: 800; font-size: 13px; color: ${hColor}; margin-bottom: 4px;">${h.id} — ${h.name}</div>
          <div><strong>Temperature:</strong> ${h.temp}°C</div>
          <div><strong>FRP:</strong> ${h.frp} MW</div>
          <div><strong>Corridor Risk:</strong> <span style="font-weight: 700; color: ${hColor};">${h.risk}</span></div>
          <div style="margin-top: 6px; font-size: 11px; color: #64748B;">Intersecting route buffer by 1.8 km</div>
        </div>
      `);

      marker.addTo(hotspotGroup);
    });

    // Fit map bounds smoothly
    const allCoords = [...waypoints.map(w => [w.lat, w.lng]), ...hotspots.map(h => [h.lat, h.lng])];
    if (allCoords.length > 0) {
      map.fitBounds(allCoords, { padding: [60, 60], maxZoom: 13 });
    }
  }, [activeAnalysis, corridorBuffer]);

  const handleSelectPreset = (routeId) => {
    setSelectedRouteId(routeId);
    const selected = PRESET_ROUTES.find(r => r.id === routeId);
    if (selected) {
      setFromInput(selected.fromName);
      setToInput(selected.toName);
      setActiveAnalysis(selected);
    }
  };

  const handleAnalyzePath = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const selected = PRESET_ROUTES.find(r => r.id === selectedRouteId) || PRESET_ROUTES[0];
      setActiveAnalysis({
        ...selected,
        fromName: fromInput,
        toName: toInput,
      });
      setIsAnalyzing(false);
    }, 700);
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'CRITICAL': return '#EF4444';
      case 'HIGH': return '#F97316';
      case 'MODERATE': return '#EAB308';
      default: return '#10B981';
    }
  };

  return (
    <div className="path-intel-container" style={{ position: 'relative', width: '100%', height: 'calc(100vh - var(--header-height))', display: 'flex', flexDirection: 'column', background: 'var(--bg-space)', overflow: 'hidden' }}>
      
      {/* Top Header Bar */}
      <div style={{
        padding: '12px 20px',
        background: 'rgba(11, 23, 38, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        zIndex: 1000,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-cyan)',
          }}>
            <Route size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.05em', margin: 0, color: '#FFFFFF' }}>PATH INTELLIGENCE</h2>
              <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--soft-cyan)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                CORRIDOR RISK MATRIX
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              Risk-aware multi-hazard trajectory computation & satellite exposure
            </p>
          </div>
        </div>

        {/* Quick Presets Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Corridor Preset:</span>
          {PRESET_ROUTES.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelectPreset(r.id)}
              style={{
                fontSize: '11.5px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: selectedRouteId === r.id ? '1px solid var(--primary-cyan)' : '1px solid var(--border-color)',
                background: selectedRouteId === r.id ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: selectedRouteId === r.id ? '#FFFFFF' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: selectedRouteId === r.id ? 600 : 400,
              }}
            >
              {r.id === 'coimbatore-ghats' ? 'Coimbatore Forest' : r.id === 'hazira-pipeline' ? 'Hazira Pipeline' : 'Jamnagar Coastal'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout: Map on left/center, Analysis & Controls on right */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        
        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} style={{ flex: 1, height: '100%', background: '#070D18' }} />

        {/* Map Floating Control Overlay (Top Left) */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 990,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '360px',
          width: 'calc(100% - 32px)',
        }}>
          {/* Origin & Destination Card */}
          <div style={{
            background: 'rgba(11, 23, 38, 0.92)',
            backdropFilter: 'blur(16px)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '14px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                  FROM (Location / Coordinates)
                </label>
                <input
                  type="text"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  placeholder="e.g. Coimbatore Hub or 11.0168, 76.9558"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(5, 11, 20, 0.7)',
                    border: '1px solid var(--border-color)',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
                  TO (Location / Coordinates)
                </label>
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  placeholder="e.g. Western Ghats or 11.2355, 76.5412"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(5, 11, 20, 0.7)',
                    border: '1px solid var(--border-color)',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Buffer Radius Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Corridor Risk Buffer:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="2"
                    max="25"
                    step="1"
                    value={corridorBuffer}
                    onChange={(e) => setCorridorBuffer(Number(e.target.value))}
                    style={{ width: '90px', accentColor: 'var(--primary-cyan)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--soft-cyan)', minWidth: '35px', textAlign: 'right' }}>
                    {corridorBuffer} km
                  </span>
                </div>
              </div>

              {/* Analyze Path CTA */}
              <button
                onClick={handleAnalyzePath}
                disabled={isAnalyzing}
                style={{
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '7px',
                  background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  letterSpacing: '0.04em',
                  cursor: isAnalyzing ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                  transition: 'all 0.2s',
                }}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    ANALYZING CORRIDOR...
                  </>
                ) : (
                  <>
                    <Navigation size={15} />
                    ANALYZE PATH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Map Legend Overlay (Bottom Left) */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '16px',
          zIndex: 990,
          background: 'rgba(11, 23, 38, 0.88)',
          backdropFilter: 'blur(12px)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          <span style={{ fontWeight: 700, color: '#FFFFFF' }}>RISK GRADIENT:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#10B981', borderRadius: '2px' }} />
            <span>LOW</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#EAB308', borderRadius: '2px' }} />
            <span>MODERATE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#F97316', borderRadius: '2px' }} />
            <span>HIGH</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#EF4444', borderRadius: '2px' }} />
            <span>CRITICAL</span>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '10px', display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setActiveBaseMap(prev => prev === 'dark' ? 'satellite' : 'dark')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-color)',
                color: '#FFFFFF',
                fontSize: '10.5px',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {activeBaseMap === 'dark' ? '🛰️ Satellite View' : '🗺️ Dark Canvas'}
            </button>
          </div>
        </div>

        {/* Right Side Intelligence Console: PATH RISK ANALYSIS */}
        <div style={{
          width: '420px',
          height: '100%',
          background: 'rgba(11, 23, 38, 0.96)',
          backdropFilter: 'blur(20px)',
          borderLeft: '1px solid var(--border-color)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 995,
        }}>
          {/* Section Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--soft-cyan)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                PATH RISK ANALYSIS
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
                background: `${getRiskColor(activeAnalysis.riskLevel)}22`,
                color: getRiskColor(activeAnalysis.riskLevel),
                border: `1px solid ${getRiskColor(activeAnalysis.riskLevel)}66`,
              }}>
                {activeAnalysis.riskLevel} RISK
              </span>
            </div>

            {/* Quick Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '14px' }}>
              <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '10px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Distance</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {activeAnalysis.distance}
                </div>
              </div>

              <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '10px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. Time</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {activeAnalysis.estTime}
                </div>
              </div>

              <div style={{ background: 'rgba(5, 11, 20, 0.6)', padding: '10px', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hazard Index</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: getRiskColor(activeAnalysis.riskLevel), marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {activeAnalysis.thermalExposure > 70 ? 'CRITICAL' : 'ELEVATED'}
                </div>
              </div>
            </div>
          </div>

          {/* Exposure Progress Metrics (as requested in specifications) */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* THERMAL EXPOSURE */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Flame size={14} style={{ color: '#F97316' }} />
                  THERMAL EXPOSURE
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#F97316' }}>
                  {activeAnalysis.thermalExposure}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${activeAnalysis.thermalExposure}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #F59E0B 0%, #F97316 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>

            {/* FIRE EXPOSURE */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} style={{ color: '#EF4444' }} />
                  FIRE EXPOSURE
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#EF4444' }}>
                  {activeAnalysis.fireExposure}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${activeAnalysis.fireExposure}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #F97316 0%, #EF4444 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>

            {/* WEATHER IMPACT */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wind size={14} style={{ color: '#38BDF8' }} />
                  WEATHER IMPACT
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38BDF8' }}>
                  {activeAnalysis.weatherImpact}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${activeAnalysis.weatherImpact}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0284C7 0%, #38BDF8 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>

            {/* SATELLITE COVERAGE */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '5px' }}>
                <span style={{ fontWeight: 600, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Satellite size={14} style={{ color: '#10B981' }} />
                  SATELLITE COVERAGE
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10B981' }}>
                  {activeAnalysis.satelliteCoverage}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${activeAnalysis.satelliteCoverage}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #059669 0%, #10B981 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Hotspots along the path */}
          <div style={{ padding: '16px 20px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.04em' }}>
                INTERSECTING THERMAL HOTSPOTS ({activeAnalysis.hotspots.length})
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Within {corridorBuffer} km</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeAnalysis.hotspots.map((h) => (
                <div
                  key={h.id}
                  style={{
                    background: 'rgba(5, 11, 20, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF' }}>{h.id}</span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: h.risk === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                      color: h.risk === 'CRITICAL' ? '#EF4444' : '#F97316',
                      border: `1px solid ${h.risk === 'CRITICAL' ? '#EF4444' : '#F97316'}55`,
                    }}>
                      {h.risk}
                    </span>
                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{h.name}</div>

                  <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span>TEMP: <strong style={{ color: '#F97316' }}>{h.temp}°C</strong></span>
                    <span>FRP: <strong style={{ color: '#FFFFFF' }}>{h.frp} MW</strong></span>
                  </div>

                  {/* Deep dive into Investigation view */}
                  <button
                    onClick={() => {
                      if (onSelectDetection) {
                        onSelectDetection({
                          id: h.id,
                          latitude: h.lat,
                          longitude: h.lng,
                          brightness: h.temp + 273.15,
                          frp: h.frp,
                          predicted_class: 'Vegetation / Forest Anomaly',
                          prediction_confidence: 0.947,
                          source: 'Sentinel-3 / INSAT-3DR',
                          alert_level: h.risk,
                          location_name: h.name,
                        });
                      }
                      if (onNavigate) onNavigate('investigate');
                    }}
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '6px',
                      borderRadius: '5px',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: 'var(--soft-cyan)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Eye size={12} />
                    INVESTIGATE EVENT
                  </button>
                </div>
              ))}
            </div>

            {/* Environmental & Satellite Met Summary */}
            <div style={{
              marginTop: '14px',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.15)',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={13} style={{ color: '#10B981' }} />
                CORRIDOR ADVISORY
              </div>
              Ambient temperature is {activeAnalysis.weather.temp} with {activeAnalysis.weather.wind} winds. Surface vegetation dryness indicates accelerated flame front velocity along Eastern ridge segments.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
