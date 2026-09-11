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
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';

export function GisInvestigationView({
  detections = [],
  selectedDetection,
  onSelectDetection,
  onFocusDetection,
  onRefresh,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [activeBaseLayer, setActiveBaseLayer] = useState('dark'); // 'dark' | 'sat' | 'osm'

  const filteredDetections = detections.filter((d) => {
    if (sourceFilter && d.source !== sourceFilter) return false;
    if (classFilter && d.predicted_class !== classFilter) return false;
    return true;
  });

  // Initialize Leaflet Map
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
      { attribution: 'Tiles &copy; Esri', maxZoom: 16 }
    );

    const esriSat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri Imagery', maxZoom: 18 }
    );

    const osm = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{y}.png',
      { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
    );

    darkCanvas.addTo(map);

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

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    filteredDetections.forEach((det) => {
      const lat = parseFloat(det.latitude);
      const lon = parseFloat(det.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const isIndustrial = det.predicted_class === 'Industrial Fire';
      const isPersistent = det.predicted_class?.includes('Persistent');
      const isSelected = selectedDetection?.id === det.id;

      const markerColor = isSelected ? '#FFFFFF' : isIndustrial ? '#FF453A' : isPersistent ? '#FF8A00' : '#45C8F5';
      const radius = isSelected ? 12 : Math.max(6, Math.min(14, Math.sqrt(parseFloat(det.frp) || 20) * 1.5));

      const marker = L.circleMarker([lat, lon], {
        radius,
        color: isSelected ? '#45C8F5' : markerColor,
        weight: isSelected ? 3 : 1.5,
        fillColor: markerColor,
        fillOpacity: isSelected ? 0.95 : 0.7,
      });

      marker.bindPopup(`
        <div style="font-family: var(--font-sans); color: #07111F; min-width: 220px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: ${isIndustrial ? '#FF453A' : '#0F2032'}">
            #${det.id} — ${det.predicted_class}
          </div>
          <div style="font-size: 11px; margin-bottom: 6px; color: #60778A;">
            <strong>Coordinates:</strong> ${lat.toFixed(6)}°, ${lon.toFixed(6)}°
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>FRP:</strong> ${det.frp ? `${parseFloat(det.frp).toFixed(1)} MW` : 'N/A'}
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>Confidence:</strong> ${((parseFloat(det.prediction_confidence) || 0) * 100).toFixed(1)}%
          </div>
          <div style="font-size: 11px; margin-bottom: 3px;">
            <strong>Sensor:</strong> ${det.source || 'VIIRS'} (${det.instrument || 'VIIRS'})
          </div>
          <div style="font-size: 11px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #E2E8F0; color: #DC2626;">
            Requires Ground Verification
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectDetection) onSelectDetection(det);
      });

      marker.addTo(layerGroup);
    });
  }, [filteredDetections, selectedDetection, onSelectDetection]);

  // Center on selectedDetection if changed
  useEffect(() => {
    if (selectedDetection && mapInstanceRef.current) {
      const lat = parseFloat(selectedDetection.latitude);
      const lon = parseFloat(selectedDetection.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        mapInstanceRef.current.setView([lat, lon], 9, { animate: true });
      }
    }
  }, [selectedDetection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Controls Bar */}
      <div className="filter-bar">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Classification Classes</option>
          <option value="Industrial Fire">Industrial Fire Only</option>
          <option value="Persistent Thermal Source">Persistent Thermal Sources Only</option>
          <option value="Other">Other / Background</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="filter-input"
        >
          <option value="">All Satellite Sources</option>
          <option value="VIIRS_SNPP_NRT">VIIRS S-NPP</option>
          <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20</option>
          <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21</option>
          <option value="MODIS_NRT">MODIS Terra/Aqua</option>
        </select>

        <button onClick={onRefresh} className="btn-secondary">
          <RefreshCw size={13} />
          <span>Sync Map</span>
        </button>

        {selectedDetection && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--ice-blue)', fontFamily: 'var(--font-mono)' }}>
              Selected #{selectedDetection.id}: {parseFloat(selectedDetection.latitude).toFixed(4)}°, {parseFloat(selectedDetection.longitude).toFixed(4)}°
            </span>
            {onFocusDetection && (
              <button
                onClick={() => onFocusDetection(selectedDetection)}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
              >
                <Globe size={12} />
                <span>Focus on 3D Earth</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Operational Leaflet Viewport */}
      <div
        className="card-panel"
        style={{
          padding: 0,
          position: 'relative',
          height: 'calc(100vh - 240px)',
          minHeight: '600px',
          overflow: 'hidden',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Floating GIS Legend */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '10px 14px',
            zIndex: 1000,
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>
            Operational GIS Layers ({filteredDetections.length} points)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--critical-red)', display: 'inline-block' }} />
            <span>Industrial Fire (Requires Ground Verification)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--thermal-orange)', display: 'inline-block' }} />
            <span>Persistent Thermal Source / Refinery Flare</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--primary-cyan)', display: 'inline-block' }} />
            <span>Other Thermal Anomaly</span>
          </div>
        </div>
      </div>
    </div>
  );
}
