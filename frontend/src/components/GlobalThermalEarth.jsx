import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Crosshair,
  RotateCcw,
  Layers,
  Flame,
  Compass,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Filter,
  Eye,
  EyeOff,
  Radio,
  MapPin,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from './StatusBadge';

/**
 * GLOBAL THERMAL EARTH
 * Scientific, transparent flat-world thermal monitoring overlay.
 *
 * Visual Axiom:
 *   BLUE = WORLD / CONTINENTS / GRATICULE
 *   RED  = SATELLITE FIRE / THERMAL SOURCE (NASA FIRMS)
 */
export function GlobalThermalEarth({
  detections = [],
  selectedDetection = null,
  onSelectDetection = () => {},
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const thermalLayerGroupRef = useRef(null);
  const graticuleLayerGroupRef = useRef(null);
  const satelliteLayerRef = useRef(null);
  const baseTileLayerRef = useRef(null);
  const markersMapRef = useRef(new Map());

  // UI States
  const [earthMode, setEarthMode] = useState('thermal'); // 'normal' | 'thermal' | 'hybrid'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showGraticule, setShowGraticule] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showHeatGlow, setShowHeatGlow] = useState(true);
  const [showDetailedSatellite, setShowDetailedSatellite] = useState(false);
  const [fireFilter, setFireFilter] = useState('ALL'); // 'ALL', 'INDUSTRIAL_ONLY', 'HIGH_FRP'
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [compassBearing, setCompassBearing] = useState(0);

  // Initialize Leaflet Map with Transparent Deep-Space Slate Base
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Canonical Center: Indian Subcontinent (21.5 N, 78.5 E)
    const map = L.map(mapContainerRef.current, {
      center: [21.5, 78.5],
      zoom: 4,
      minZoom: 2,
      maxZoom: 16,
      zoomControl: false, // We render tactical custom controls
      attributionControl: false,
    });

    // 1. Transparent Blue World Tiles
    // Using CartoDB Dark Matter with high-contrast electric blue filter
    const baseBlueTiles = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 16,
        className: 'global-thermal-blue-tiles',
      }
    );
    // Suppress any tile error images or watermarks from appearing
    baseBlueTiles.on('tileerror', (e) => {
      if (e.tile) {
        e.tile.style.display = 'none';
      }
    });
    baseBlueTiles.addTo(map);
    baseTileLayerRef.current = baseBlueTiles;

    // 2. Optional Detailed GIS Satellite Imagery (Esri World Imagery)
    const satelliteTiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        opacity: 0.85,
      }
    );
    satelliteTiles.on('tileerror', (e) => {
      if (e.tile) {
        e.tile.style.display = 'none';
      }
    });
    satelliteLayerRef.current = satelliteTiles;

    // 3. Tactical Graticule Layer (Blue Coordinate Grid Lines)
    const graticuleGroup = L.layerGroup().addTo(map);
    graticuleLayerGroupRef.current = graticuleGroup;

    // Draw Parallels (Latitudes: -60 to 60 by 15 degrees)
    for (let lat = -60; lat <= 60; lat += 15) {
      const isEquator = lat === 0;
      const latLine = L.polyline(
        [
          [lat, -180],
          [lat, 180],
        ],
        {
          color: isEquator ? '#38BDF8' : 'rgba(56, 189, 248, 0.18)',
          weight: isEquator ? 1.5 : 0.8,
          dashArray: isEquator ? null : '4, 8',
          interactive: false,
        }
      );
      graticuleGroup.addLayer(latLine);
    }

    // Draw Meridians (Longitudes: -180 to 180 by 30 degrees)
    for (let lon = -180; lon <= 180; lon += 30) {
      const isPrime = lon === 0;
      const lonLine = L.polyline(
        [
          [-85, lon],
          [85, lon],
        ],
        {
          color: isPrime ? '#38BDF8' : 'rgba(56, 189, 248, 0.18)',
          weight: isPrime ? 1.5 : 0.8,
          dashArray: isPrime ? null : '4, 8',
          interactive: false,
        }
      );
      graticuleGroup.addLayer(lonLine);
    }

    // 4. Red Thermal Hotspot Layer Group
    const thermalGroup = L.layerGroup().addTo(map);
    thermalLayerGroupRef.current = thermalGroup;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Toggle Graticule Grid
  useEffect(() => {
    if (!graticuleLayerGroupRef.current || !mapInstanceRef.current) return;
    if (showGraticule) {
      if (!mapInstanceRef.current.hasLayer(graticuleLayerGroupRef.current)) {
        mapInstanceRef.current.addLayer(graticuleLayerGroupRef.current);
      }
    } else {
      if (mapInstanceRef.current.hasLayer(graticuleLayerGroupRef.current)) {
        mapInstanceRef.current.removeLayer(graticuleLayerGroupRef.current);
      }
    }
  }, [showGraticule]);

  // Toggle Detailed Satellite Imagery Layer
  useEffect(() => {
    if (!satelliteLayerRef.current || !mapInstanceRef.current) return;
    if (showDetailedSatellite) {
      if (!mapInstanceRef.current.hasLayer(satelliteLayerRef.current)) {
        satelliteLayerRef.current.addTo(mapInstanceRef.current);
      }
    } else {
      if (mapInstanceRef.current.hasLayer(satelliteLayerRef.current)) {
        mapInstanceRef.current.removeLayer(satelliteLayerRef.current);
      }
    }
  }, [showDetailedSatellite]);

  // Toggle Tile Layers based on earthMode ('normal' | 'thermal' | 'hybrid')
  useEffect(() => {
    if (!mapInstanceRef.current || !baseTileLayerRef.current || !satelliteLayerRef.current) return;
    const map = mapInstanceRef.current;
    const baseBlue = baseTileLayerRef.current;
    const sat = satelliteLayerRef.current;

    if (earthMode === 'normal') {
      if (!map.hasLayer(sat)) sat.addTo(map);
      sat.setOpacity(1.0);
      if (map.hasLayer(baseBlue)) map.removeLayer(baseBlue);
    } else if (earthMode === 'thermal') {
      if (!map.hasLayer(baseBlue)) baseBlue.addTo(map);
      if (map.hasLayer(sat)) map.removeLayer(sat);
    } else if (earthMode === 'hybrid') {
      if (!map.hasLayer(sat)) sat.addTo(map);
      sat.setOpacity(0.85);
      if (map.hasLayer(baseBlue)) map.removeLayer(baseBlue);
    }
  }, [earthMode]);

  // Plot Red Thermal Hotspots
  useEffect(() => {
    if (!mapInstanceRef.current || !thermalLayerGroupRef.current) return;
    const group = thermalLayerGroupRef.current;
    group.clearLayers();
    markersMapRef.current.clear();

    const filtered = detections.filter((d) => {
      if (fireFilter === 'INDUSTRIAL_ONLY') {
        return (d.predicted_class || '').toLowerCase().includes('industrial');
      }
      if (fireFilter === 'HIGH_FRP') {
        return parseFloat(d.frp || 0) >= 50.0;
      }
      return true;
    });

    filtered.forEach((d) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      const isSelected =
        selectedDetection &&
        Math.abs(parseFloat(selectedDetection.latitude) - lat) < 0.0001 &&
        Math.abs(parseFloat(selectedDetection.longitude) - lon) < 0.0001;

      const frpVal = parseFloat(d.frp || 15);
      const isHighIntensity = frpVal >= 50.0;
      const isIndustrial = (d.predicted_class || '').toLowerCase().includes('industrial');

      // Visual hierarchy based on real radiative power:
      // Low signal: radius 6-8px, bright red
      // Medium signal: radius 9-13px
      // High / Critical signal: radius 14-20px with outer glow halo
      const baseRadius = Math.max(6, Math.min(18, Math.sqrt(frpVal) * 2.2));
      const radius = isSelected ? baseRadius + 6 : baseRadius;

      // Outer Heat Glow Halo
      if (showHeatGlow || isHighIntensity || isSelected) {
        const glowRadius = radius * (isSelected ? 3.0 : 2.2);
        const glowCircle = L.circleMarker([lat, lon], {
          radius: glowRadius,
          color: isSelected ? '#FF0000' : '#EF4444',
          weight: isSelected ? 2 : 1,
          opacity: isSelected ? 0.8 : 0.4,
          fillColor: '#EF4444',
          fillOpacity: isSelected ? 0.35 : 0.15,
          interactive: false,
          className: isSelected ? 'thermal-pulse-marker' : undefined,
        });
        glowCircle.addTo(group);
      }

      // Core Red Thermal Point
      const coreCircle = L.circleMarker([lat, lon], {
        radius: radius,
        color: isSelected ? '#FFFFFF' : '#FF2222',
        weight: isSelected ? 2.5 : 1.5,
        opacity: 1.0,
        fillColor: isSelected ? '#FF0000' : isHighIntensity ? '#EF4444' : '#DC2626',
        fillOpacity: 0.92,
        className: isSelected ? 'thermal-selected-core' : undefined,
      });

      // Rich Scientific Popup
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; font-size: 12px; color: #F8FAFC; min-width: 250px; line-height: 1.5;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(239, 68, 68, 0.4); padding-bottom: 4px;">
            <span style="font-size: 13px; font-weight: 700; color: #EF4444; display: flex; align-items: center; gap: 4px;">
              🔥 ${d.predicted_class || 'Thermal Anomaly'}
            </span>
            <span style="font-size: 9.5px; font-weight: 700; color: #38BDF8; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">
              ${d.data_provenance || 'REAL_FIRMS'}
            </span>
          </div>
          <div style="margin-bottom: 4px; background: rgba(0,0,0,0.3); padding: 4px 6px; border-radius: 4px;">
            <strong>LAT:</strong> <span style="font-family: monospace; color: #FFFFFF;">${lat.toFixed(6)}°</span><br/>
            <strong>LON:</strong> <span style="font-family: monospace; color: #FFFFFF;">${lon.toFixed(6)}°</span>
          </div>
          <div><strong>Radiative Power:</strong> <span style="color: #F59E0B; font-weight: 700;">${d.frp ? parseFloat(d.frp).toFixed(1) + ' MW' : 'N/A'}</span></div>
          <div><strong>Brightness Temp:</strong> ${d.brightness ? parseFloat(d.brightness).toFixed(1) + ' K' : 'N/A'}</div>
          <div><strong>AI Confidence:</strong> ${(parseFloat(d.prediction_confidence || 0) * 100).toFixed(1)}%</div>
          <div><strong>Sensor:</strong> ${d.source || 'VIIRS'} (${d.instrument || 'VIIRS'})</div>
          <div><strong>Acquisition:</strong> ${d.acq_date} ${d.acq_time} UTC</div>
          <div><strong>Model Version:</strong> <span style="font-family: monospace; color: #C084FC;">${d.model_version || '2.0.0-scientific-prototype'}</span></div>
          <div style="margin-top: 8px; padding: 4px 6px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: #FCA5A5; font-size: 10px; text-align: center; font-weight: 600;">
            ⚠️ Probabilistic AI &mdash; Requires Ground Verification
          </div>
        </div>
      `;

      coreCircle.bindPopup(popupHtml);

      coreCircle.on('click', () => {
        onSelectDetection(d);
      });

      coreCircle.addTo(group);
      markersMapRef.current.set(`${lat.toFixed(4)}_${lon.toFixed(4)}`, coreCircle);
    });
  }, [detections, selectedDetection, fireFilter, showHeatGlow, onSelectDetection]);

  // Synchronize with Selected Detection
  useEffect(() => {
    if (!selectedDetection || !mapInstanceRef.current) return;
    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // Smoothly fly to exact coordinate
    mapInstanceRef.current.flyTo([lat, lon], 9, {
      duration: 1.4,
      easeLinearity: 0.25,
    });

    // Auto open popup
    const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
    const marker = markersMapRef.current.get(key);
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 700);
    }
  }, [selectedDetection]);

  // Directional Navigation Controls (Pan Up, Down, Left, Right)
  const handlePan = (dx, dy) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panBy([dx, dy], { animate: true, duration: 0.3 });
  };

  // Zoom In / Out
  const handleZoomIn = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomIn();
  };
  const handleZoomOut = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomOut();
  };

  // Center on Target / Locate
  const handleLocateTarget = () => {
    if (!mapInstanceRef.current) return;
    if (selectedDetection) {
      const lat = parseFloat(selectedDetection.latitude);
      const lon = parseFloat(selectedDetection.longitude);
      mapInstanceRef.current.flyTo([lat, lon], 10);
    } else if (detections.length > 0) {
      const first = detections[0];
      mapInstanceRef.current.flyTo([parseFloat(first.latitude), parseFloat(first.longitude)], 7);
    } else {
      mapInstanceRef.current.flyTo([21.5, 78.5], 4);
    }
  };

  // Reset / Recenter to All India / Global View
  const handleResetView = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([21.5, 78.5], 4, { duration: 1.2 });
    onSelectDetection(null);
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    const container = mapContainerRef.current?.parentElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleCopyCoords = (lat, lon) => {
    navigator.clipboard.writeText(`${lat}, ${lon}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '620px',
        overflow: 'hidden',
        background: '#020712', // Deep transparent space navy
        borderRadius: '12px',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        boxShadow: 'inset 0 0 40px rgba(2, 132, 199, 0.1)',
      }}
    >
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#020712',
        }}
      />

      {/* 
        ============================================================
        COMPACT EARTH-VIEW MODE SELECTOR
        [ 🌍 NORMAL ] [ 🔥 THERMAL ] [ ✦ HYBRID ]
        Mounted prominently at top center above the Global Earth
        ============================================================
      */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(2, 7, 18, 0.92)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '8px',
          padding: '3px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
          gap: '4px',
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={() => setEarthMode('normal')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '11.5px',
            fontWeight: earthMode === 'normal' ? 700 : 500,
            color: earthMode === 'normal' ? '#FFFFFF' : '#94A3B8',
            background: earthMode === 'normal' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
            border: earthMode === 'normal' ? '1px solid #38BDF8' : '1px solid transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            boxShadow: earthMode === 'normal' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
          }}
          title="Normal Mode: Natural satellite imagery observation"
        >
          <span>🌍</span>
          <span>NORMAL</span>
        </button>

        <button
          onClick={() => setEarthMode('thermal')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '11.5px',
            fontWeight: earthMode === 'thermal' ? 700 : 500,
            color: earthMode === 'thermal' ? '#FFFFFF' : '#94A3B8',
            background: earthMode === 'thermal' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
            border: earthMode === 'thermal' ? '1px solid #38BDF8' : '1px solid transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            boxShadow: earthMode === 'thermal' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
          }}
          title="Thermal Mode: Blue Digital Earth + Red FIRMS Thermal Intelligence"
        >
          <span style={{ color: '#EF4444' }}>🔥</span>
          <span>THERMAL</span>
        </button>

        <button
          onClick={() => setEarthMode('hybrid')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '11.5px',
            fontWeight: earthMode === 'hybrid' ? 700 : 500,
            color: earthMode === 'hybrid' ? '#FFFFFF' : '#94A3B8',
            background: earthMode === 'hybrid' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
            border: earthMode === 'hybrid' ? '1px solid #38BDF8' : '1px solid transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            boxShadow: earthMode === 'hybrid' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
          }}
          title="Hybrid Mode: Geographic Earth surface with vivid Red Thermal Overlay"
        >
          <span style={{ color: '#38BDF8' }}>✦</span>
          <span>HYBRID</span>
        </button>
      </div>

      {/* 
        ============================================================
        THERMAL INTELLIGENCE LEGEND
        Visible when THERMAL or HYBRID mode is active
        ============================================================
      */}
      {(earthMode === 'thermal' || earthMode === 'hybrid') && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 16,
            zIndex: 1000,
            background: 'rgba(2, 7, 18, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            fontSize: '11px',
            color: '#94A3B8',
            minWidth: '180px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#38BDF8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Thermal Intelligence Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284C7', border: '1px solid #38BDF8', flexShrink: 0 }} />
            <span><strong style={{ color: '#38BDF8' }}>BLUE</strong> &mdash; Earth Surface</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
            <span><strong style={{ color: '#EF4444' }}>RED</strong> &mdash; Thermal Detection</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF1E1E', boxShadow: '0 0 6px #FF1E1E', flexShrink: 0 }} />
            <span><strong style={{ color: '#FF1E1E' }}>BRIGHT RED</strong> &mdash; High Thermal FRP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', border: '2px solid #FF1E1E', boxShadow: '0 0 8px #FF1E1E', flexShrink: 0 }} />
            <span><strong style={{ color: '#FF4545' }}>PULSING RED</strong> &mdash; Selected / Critical</span>
          </div>
        </div>
      )}

      {/* Top Left Title & Status Badge */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            background: 'rgba(2, 7, 18, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderLeft: '3px solid #38BDF8',
            borderRadius: '8px',
            padding: '8px 14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#38BDF8', textTransform: 'uppercase' }}>
            <Radio size={12} style={{ color: '#EF4444' }} className="animate-pulse" />
            <span>Global Thermal Earth</span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginTop: '1px' }}>
            Transparent Satellite Fire Overlay
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
            Active Hotspots: <strong style={{ color: '#EF4444' }}>{detections.length}</strong> • Grid: <strong style={{ color: '#38BDF8' }}>WGS84</strong>
          </div>
        </div>
      </div>

      {/* COMPASS ROSE: NORTH / EAST / WEST / SOUTH (Section 6) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: selectedDetection ? 380 : 16,
          zIndex: 1000,
          transition: 'right 0.3s ease',
          background: 'rgba(2, 7, 18, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '50%',
          width: '74px',
          height: '74px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6), inset 0 0 12px rgba(56, 189, 248, 0.2)',
          pointerEvents: 'none',
        }}
      >
        {/* North */}
        <span style={{ position: 'absolute', top: '3px', fontSize: '10px', fontWeight: 800, color: '#EF4444', letterSpacing: '0.05em' }}>
          N
        </span>
        {/* South */}
        <span style={{ position: 'absolute', bottom: '3px', fontSize: '10px', fontWeight: 700, color: '#38BDF8' }}>
          S
        </span>
        {/* West */}
        <span style={{ position: 'absolute', left: '5px', fontSize: '10px', fontWeight: 700, color: '#38BDF8' }}>
          W
        </span>
        {/* East */}
        <span style={{ position: 'absolute', right: '5px', fontSize: '10px', fontWeight: 700, color: '#38BDF8' }}>
          E
        </span>

        {/* Tactical Crosshair Center */}
        <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid rgba(56, 189, 248, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444' }} />
        </div>
      </div>

      {/* TACTICAL CONTROL BAR (Section 5) */}
      <div
        style={{
          position: 'absolute',
          top: 102,
          right: selectedDetection ? 380 : 16,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'right 0.3s ease',
          pointerEvents: 'auto',
        }}
      >
        {/* Zoom Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(2, 7, 18, 0.9)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '6px', overflow: 'hidden' }}>
          <button
            onClick={handleZoomIn}
            style={{ padding: '8px', background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Zoom In (+)"
          >
            <Plus size={15} />
          </button>
          <button
            onClick={handleZoomOut}
            style={{ padding: '8px', background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}
            title="Zoom Out (-)"
          >
            <Minus size={15} />
          </button>
        </div>

        {/* 4-Way Directional Pan Controls */}
        <div
          style={{
            background: 'rgba(2, 7, 18, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            padding: '2px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 22px)',
            gridTemplateRows: 'repeat(3, 22px)',
            gap: '1px',
            alignItems: 'center',
            justifyItems: 'center',
          }}
          title="Directional Pan Controls (N, S, W, E)"
        >
          <div />
          <button
            onClick={() => handlePan(0, -80)}
            style={{ background: 'none', border: 'none', color: '#38BDF8', cursor: 'pointer', padding: 0 }}
            title="Pan North"
          >
            <ArrowUp size={13} />
          </button>
          <div />

          <button
            onClick={() => handlePan(-80, 0)}
            style={{ background: 'none', border: 'none', color: '#38BDF8', cursor: 'pointer', padding: 0 }}
            title="Pan West"
          >
            <ArrowLeft size={13} />
          </button>
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#EF4444' }} />
          <button
            onClick={() => handlePan(80, 0)}
            style={{ background: 'none', border: 'none', color: '#38BDF8', cursor: 'pointer', padding: 0 }}
            title="Pan East"
          >
            <ArrowRight size={13} />
          </button>

          <div />
          <button
            onClick={() => handlePan(0, 80)}
            style={{ background: 'none', border: 'none', color: '#38BDF8', cursor: 'pointer', padding: 0 }}
            title="Pan South"
          >
            <ArrowDown size={13} />
          </button>
          <div />
        </div>

        {/* Center / Locate Target */}
        <button
          onClick={handleLocateTarget}
          style={{
            padding: '8px',
            background: 'rgba(2, 7, 18, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            color: selectedDetection ? '#EF4444' : '#38BDF8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Center on Target Hotspot"
        >
          <Crosshair size={15} />
        </button>

        {/* Reset / Recenter to All India */}
        <button
          onClick={handleResetView}
          style={{
            padding: '8px',
            background: 'rgba(2, 7, 18, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Recenter World View"
        >
          <RotateCcw size={15} />
        </button>

        {/* Layer Control Menu Toggle */}
        <button
          onClick={() => setShowLayersMenu((prev) => !prev)}
          style={{
            padding: '8px',
            background: showLayersMenu ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 7, 18, 0.9)',
            border: `1px solid ${showLayersMenu ? '#38BDF8' : 'rgba(56, 189, 248, 0.3)'}`,
            borderRadius: '6px',
            color: '#38BDF8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Toggle Layers"
        >
          <Layers size={15} />
        </button>

        {/* Fire Filter Control Menu Toggle */}
        <button
          onClick={() => setShowFilterMenu((prev) => !prev)}
          style={{
            padding: '8px',
            background: showFilterMenu ? 'rgba(239, 68, 68, 0.25)' : 'rgba(2, 7, 18, 0.9)',
            border: `1px solid ${showFilterMenu ? '#EF4444' : 'rgba(56, 189, 248, 0.3)'}`,
            borderRadius: '6px',
            color: '#EF4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Filter Thermal Detections"
        >
          <Filter size={15} />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={handleToggleFullscreen}
          style={{
            padding: '8px',
            background: 'rgba(2, 7, 18, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            color: '#94A3B8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* Layer Control Dropdown Palette */}
      {showLayersMenu && (
        <div
          style={{
            position: 'absolute',
            top: 280,
            right: selectedDetection ? 425 : 62,
            background: 'rgba(2, 7, 18, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '8px',
            padding: '12px 14px',
            zIndex: 1010,
            width: '230px',
            color: '#F8FAFC',
            fontSize: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            transition: 'right 0.3s ease',
          }}
        >
          <div style={{ fontWeight: 700, color: '#38BDF8', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Overlay Layer Management
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showGraticule}
              onChange={(e) => setShowGraticule(e.target.checked)}
            />
            <span>Blue Coordinate Graticule</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showHeatGlow}
              onChange={(e) => setShowHeatGlow(e.target.checked)}
            />
            <span>Thermal Glow Halos</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDetailedSatellite}
              onChange={(e) => setShowDetailedSatellite(e.target.checked)}
            />
            <span style={{ color: '#F59E0B' }}>Detailed GIS Satellite Tiles</span>
          </label>
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            Default mode displays transparent blue digital Earth.
          </div>
        </div>
      )}

      {/* Fire Filter Dropdown Palette */}
      {showFilterMenu && (
        <div
          style={{
            position: 'absolute',
            top: 320,
            right: selectedDetection ? 425 : 62,
            background: 'rgba(2, 7, 18, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            padding: '12px 14px',
            zIndex: 1010,
            width: '210px',
            color: '#F8FAFC',
            fontSize: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            transition: 'right 0.3s ease',
          }}
        >
          <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Thermal Hotspot Filters
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="fireFilter"
              checked={fireFilter === 'ALL'}
              onChange={() => setFireFilter('ALL')}
            />
            <span>All Thermal Hotspots ({detections.length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="fireFilter"
              checked={fireFilter === 'INDUSTRIAL_ONLY'}
              onChange={() => setFireFilter('INDUSTRIAL_ONLY')}
            />
            <span style={{ color: '#EF4444' }}>Industrial Fire Only</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="fireFilter"
              checked={fireFilter === 'HIGH_FRP'}
              onChange={() => setFireFilter('HIGH_FRP')}
            />
            <span style={{ color: '#F59E0B' }}>High Radiative Power (≥50 MW)</span>
          </label>
        </div>
      )}

      {/* THERMAL HUD LEGEND (Section 7) */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 1000,
          background: 'rgba(2, 7, 18, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '8px',
          padding: '10px 14px',
          color: '#F8FAFC',
          fontSize: '11.5px',
          lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '4px', fontSize: '11.5px' }}>
          Global Thermal Legend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '2px', background: '#0284C7', border: '1px solid #38BDF8', display: 'inline-block' }} />
          <span><strong>BLUE</strong>: World / Continents / Coordinate Grid</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
          <span><strong>RED</strong>: Satellite Thermal Anomaly (FIRMS)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF1E1E', border: '1px solid #FFFFFF', display: 'inline-block' }} />
          <span>High Radiative Power (≥ 50 MW)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #EF4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#EF4444' }} />
          </span>
          <span>Pulsing Ring: Active / Selected Hotspot</span>
        </div>
      </div>

      {/* Selected Detection Telemetry Sidebar Inspector (Section 8) */}
      {selectedDetection && (
        <aside
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            bottom: 16,
            width: '350px',
            maxWidth: 'calc(100% - 32px)',
            background: 'rgba(2, 7, 18, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderLeft: '3px solid #EF4444',
            borderRadius: '12px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            color: '#F8FAFC',
            zIndex: 1020,
            overflowY: 'auto',
            boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.7)',
            animation: 'fadeIn 0.2s ease-out',
            pointerEvents: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: '#EF4444', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Flame size={13} />
                <span>Fire Detected • Target Locked</span>
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0 0', color: '#FFFFFF' }}>
                {selectedDetection.predicted_class || 'Thermal Hotspot'}
              </h3>
            </div>
            <button
              onClick={() => onSelectDetection(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                borderRadius: '6px',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close panel"
            >
              <X size={16} />
            </button>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <ClassBadge className={selectedDetection.predicted_class} />
            <ProvenanceBadge provenance={selectedDetection.data_provenance} />
          </div>

          {/* Canonical Coordinates Display */}
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '6px',
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Exact Coordinates
              </span>
              <button
                onClick={() => handleCopyCoords(selectedDetection.latitude, selectedDetection.longitude)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: copiedCoords ? '#34D399' : '#38BDF8',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {copiedCoords ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCoords ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
              LAT: {parseFloat(selectedDetection.latitude).toFixed(6)}°<br />
              LON: {parseFloat(selectedDetection.longitude).toFixed(6)}°
            </div>
          </div>

          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>AI Confidence</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#38BDF8', marginTop: '1px' }}>
                {(parseFloat(selectedDetection.prediction_confidence || 0) * 100).toFixed(1)}%
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Radiative Power</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#F59E0B', marginTop: '1px' }}>
                {selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Brightness Temp</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', marginTop: '1px' }}>
                {selectedDetection.brightness ? `${parseFloat(selectedDetection.brightness).toFixed(1)} K` : 'N/A'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Satellite</div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', marginTop: '1px' }}>
                {selectedDetection.source || 'VIIRS'}
              </div>
            </div>
          </div>

          {/* Acquisition & Model Information */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '11px', lineHeight: 1.5 }}>
            <div>Acquisition: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</strong></div>
            <div>Model Version: <strong style={{ color: '#A855F7', fontFamily: 'monospace' }}>{selectedDetection.model_version || '2.0.0-scientific-prototype'}</strong></div>
            <div>Verification Status: <strong style={{ color: '#C084FC' }}>Requires Verification</strong></div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => onSelectDetection(null)}
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', padding: '8px', fontSize: '12px' }}
          >
            Clear Selected Target
          </button>
        </aside>
      )}
    </div>
  );
}
