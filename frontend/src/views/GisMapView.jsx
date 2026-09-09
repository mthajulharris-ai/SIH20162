import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Filter, Eye, AlertCircle } from 'lucide-react';

export function GisMapView({ detections = [], onSelectDetection }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  const [classFilter, setClassFilter] = useState('ALL');
  const [minConfidence, setMinConfidence] = useState(0);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    // Default center on Indian subcontinent
    const map = L.map(mapContainerRef.current, {
      center: [22.3511, 78.6677],
      zoom: 5,
      zoomControl: true,
    });

    // Dark Matter Carto basemap for high-contrast thermal visualization
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when detections or filters change
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const filtered = detections.filter((d) => {
      if (classFilter !== 'ALL') {
        if (classFilter === 'INDUSTRIAL' && !d.predicted_class?.toLowerCase().includes('industrial')) {
          return false;
        }
        if (classFilter === 'PERSISTENT' && !d.predicted_class?.toLowerCase().includes('persistent')) {
          return false;
        }
      }
      if (d.prediction_confidence && d.prediction_confidence < minConfidence) {
        return false;
      }
      return true;
    });

    const markerBounds = [];

    filtered.forEach((d) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      markerBounds.push([lat, lon]);

      // Color coding based on AI predicted class
      let markerColor = '#06B6D4'; // cyan default
      const pClassLower = (d.predicted_class || '').toLowerCase();
      if (pClassLower.includes('industrial')) {
        markerColor = '#EF4444'; // Red
      } else if (pClassLower.includes('persistent') || pClassLower.includes('flare')) {
        markerColor = '#F59E0B'; // Amber
      }

      // Radius scaled with Fire Radiative Power (MW)
      const frpVal = parseFloat(d.frp || 10);
      const radius = Math.max(7, Math.min(24, Math.sqrt(frpVal) * 2.6));

      const circle = L.circleMarker([lat, lon], {
        radius: radius,
        fillColor: markerColor,
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      // Rich Telemetry Popup
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; font-size: 12px; color: #F8FAFC; min-width: 220px; line-height: 1.5;">
          <div style="font-size: 13px; font-weight: 700; color: ${markerColor}; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
            ${d.predicted_class || 'Thermal Anomaly'}
          </div>
          <div><strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
          <div><strong>FRP (Radiative Power):</strong> ${d.frp ? d.frp.toFixed(1) + ' MW' : 'N/A'}</div>
          <div><strong>Brightness Temp:</strong> ${d.brightness ? d.brightness.toFixed(1) + ' K' : 'N/A'}</div>
          <div><strong>AI Confidence:</strong> ${(d.prediction_confidence * 100).toFixed(1)}%</div>
          <div><strong>Satellite Source:</strong> ${d.source || 'VIIRS'}</div>
          <div><strong>Acquisition:</strong> ${d.acq_date} ${d.acq_time} UTC</div>
          <div style="margin-top: 8px; font-size: 10.5px; color: #94A3B8; font-style: italic;">
            Requires ground verification before operational action.
          </div>
        </div>
      `;

      circle.bindPopup(popupHtml);
      circle.addTo(layerGroup);
    });

    // Auto-fit bounds if we have points
    if (markerBounds.length > 0 && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.fitBounds(markerBounds, { padding: [50, 50], maxZoom: 10 });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [detections, classFilter, minConfidence]);

  return (
    <div>
      {/* Map Filter Bar */}
      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Filter size={15} />
          <span>Filter Class:</span>
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="filter-input"
        >
          <option value="ALL">All Categories</option>
          <option value="INDUSTRIAL">Industrial Fire Only (Red)</option>
          <option value="PERSISTENT">Persistent Thermal Source Only (Amber)</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', marginLeft: 16 }}>
          <span>Min Confidence:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            style={{ width: '120px' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#FFFFFF' }}>
            {(minConfidence * 100).toFixed(0)}%
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#EF4444', display: 'inline-block' }} />
            <span>Industrial Fire</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block' }} />
            <span>Persistent Flare</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#06B6D4', display: 'inline-block' }} />
            <span>Other Thermal</span>
          </div>
        </div>
      </div>

      {/* Map Viewport */}
      <div className="map-viewport-wrapper">
        <div ref={mapContainerRef} id="leaflet-map" />
      </div>

      {detections.length === 0 && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12.5px',
            color: 'var(--text-secondary)',
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <span>
            Database currently contains 0 detections. Click <strong>"Ingest Test Hotspot"</strong> in the top header to send a real satellite observation through the ML pipeline and view it on the GIS map.
          </span>
        </div>
      )}
    </div>
  );
}
