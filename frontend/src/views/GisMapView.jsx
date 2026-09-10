import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Layers,
  Filter,
  RefreshCw,
  Calendar,
  Satellite,
  ShieldAlert,
  Flame,
  Activity,
  Info,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { getDetections } from '../services/api';
import { StatusBadge, ClassBadge } from '../components/StatusBadge';

export function GisMapView() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Filter States
  const [sourceType, setSourceType] = useState('');
  const [detectionType, setDetectionType] = useState('');
  const [minConfidence, setMinConfidence] = useState(0.0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Map Data State
  const [mapDetections, setMapDetections] = useState([]);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch detections from the FastAPI Backend API
  const fetchMapData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        limit: 500,
      };
      if (sourceType) params.source = sourceType;
      if (detectionType) params.predicted_class = detectionType;
      if (minConfidence > 0) params.min_confidence = minConfidence;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await getDetections(params);
      setMapDetections(response.items || []);
    } catch (err) {
      console.error('Failed to load map detections from backend:', err);
      setError(err.message || 'Failed to fetch map data from backend API.');
    } finally {
      setLoading(false);
    }
  }, [sourceType, detectionType, minConfidence, startDate, endDate]);

  // Initial Load
  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Center on Indian Subcontinent (core SIH 26162 geographic focus)
    const map = L.map(mapContainerRef.current, {
      center: [22.3511, 78.6677],
      zoom: 5,
      zoomControl: true,
    });

    // Basemap Layers
    const darkCanvas = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16,
      }
    );

    const esriSatellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
        maxZoom: 18,
      }
    );

    const osmStandard = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }
    );

    // Default to Dark Canvas
    darkCanvas.addTo(map);

    // Add Layer Control for base map switching
    L.control
      .layers(
        {
          'Dark Canvas (Telemetry)': darkCanvas,
          'Satellite Imagery (Esri)': esriSatellite,
          'Street Map (OSM)': osmStandard,
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

  // Update Leaflet Markers when backend detections change
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const bounds = [];

    mapDetections.forEach((d) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      bounds.push([lat, lon]);

      // Determine styling & status
      const pClassLower = (d.predicted_class || '').toLowerCase();
      let markerColor = '#06B6D4'; // Cyan default (other)
      let detectionStatus = 'AI-Detected Observation (Requires Verification)';

      if (pClassLower.includes('industrial')) {
        markerColor = '#EF4444'; // Red for industrial fire
        detectionStatus = 'AI-Detected Industrial Fire (Requires Ground Verification)';
      } else if (pClassLower.includes('persistent') || d.is_persistent) {
        markerColor = '#F59E0B'; // Amber for persistent flare/source
        detectionStatus = 'Persistent Thermal Source (Industrial Flare / Smelter)';
      }

      // Radius scaled with Fire Radiative Power (MW)
      const frpVal = parseFloat(d.frp || 15);
      const radius = Math.max(7, Math.min(22, Math.sqrt(frpVal) * 2.5));

      const circle = L.circleMarker([lat, lon], {
        radius: radius,
        fillColor: markerColor,
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      // Construct rich popup with all required fields
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; font-size: 12px; color: #F8FAFC; min-width: 240px; line-height: 1.55;">
          <div style="font-size: 13.5px; font-weight: 700; color: ${markerColor}; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
            ${d.predicted_class || 'Thermal Anomaly'}
          </div>
          <div><strong>Detection Type:</strong> ${d.predicted_class || 'Unknown'}</div>
          <div><strong>Confidence:</strong> ${(d.prediction_confidence * 100).toFixed(1)}% (Sensor: ${d.confidence || 'nominal'})</div>
          <div><strong>Brightness:</strong> ${d.brightness ? d.brightness.toFixed(1) + ' K' : 'N/A'}</div>
          <div><strong>Fire Radiative Power (FRP):</strong> ${d.frp ? d.frp.toFixed(1) + ' MW' : 'N/A'}</div>
          <div><strong>Satellite / Source:</strong> ${d.source || 'VIIRS'}</div>
          <div><strong>Acquisition Date / Time:</strong> ${d.acq_date} ${d.acq_time} UTC</div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155; font-size: 11px; color: #FBBF24;">
            <strong>Status:</strong> ${detectionStatus}
          </div>
        </div>
      `;

      circle.bindPopup(popupHtml);

      // On click, also populate bottom detail inspector
      circle.on('click', () => {
        setSelectedDetection({ ...d, detectionStatus, markerColor });
      });

      circle.addTo(layerGroup);
    });

    // Auto fit viewport bounds when points exist
    if (bounds.length > 0 && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
      } catch (e) {
        // Fallback
      }
    }
  }, [mapDetections]);

  return (
    <div>
      {/* Dynamic Filter Toolbar */}
      <div className="filter-bar">
        {/* Source Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Satellite size={15} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Source:</span>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="filter-input"
          >
            <option value="">All Satellite Sources</option>
            <option value="VIIRS_SNPP_NRT">VIIRS S-NPP (375m)</option>
            <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 (375m)</option>
            <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21 (375m)</option>
            <option value="MODIS_NRT">MODIS Terra/Aqua (1km)</option>
          </select>
        </div>

        {/* Detection Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} style={{ color: 'var(--accent-orange)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Type:</span>
          <select
            value={detectionType}
            onChange={(e) => setDetectionType(e.target.value)}
            className="filter-input"
          >
            <option value="">All Detection Types</option>
            <option value="Industrial Fire">Industrial Fire</option>
            <option value="Persistent Thermal Source">Persistent Thermal Source</option>
            <option value="Other">Other / Vegetation</option>
          </select>
        </div>

        {/* Confidence Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Min Conf:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#FFFFFF', minWidth: '35px' }}>
            {(minConfidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="filter-input"
          />
        </div>

        {/* Refresh / Apply Button */}
        <button
          onClick={fetchMapData}
          disabled={loading}
          className="btn-secondary"
          style={{ marginLeft: 'auto' }}
          title="Queries the FastAPI backend for filtered detections"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Querying API...' : 'Apply Filters'}</span>
        </button>
      </div>

      {/* Map Viewport Container */}
      <div className="map-viewport-wrapper">
        <div ref={mapContainerRef} id="leaflet-map" />

        {/* Floating Map HUD Legend */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '10px 14px',
            zIndex: 1000,
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>
            GIS Layer Legend ({mapDetections.length} loaded from backend)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#EF4444', display: 'inline-block' }} />
            <span>Industrial Fire (Requires Verification)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block' }} />
            <span>Persistent Thermal Source / Refinery Flare</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#06B6D4', display: 'inline-block' }} />
            <span>Other Thermal Anomaly</span>
          </div>
        </div>
      </div>

      {/* Empty State Banner */}
      {mapDetections.length === 0 && !loading && (
        <div
          style={{
            marginTop: '16px',
            padding: '14px 18px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          <AlertCircle size={18} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <span>
            No thermal detection records in SQLite database match the selected filters. Use <strong>"Ingest Test Hotspot"</strong> in the top header to send classified observations through the backend API.
          </span>
        </div>
      )}

      {/* Selected Anomaly Telemetry Inspector Sheet */}
      {selectedDetection && (
        <div
          className="card-panel"
          style={{
            marginTop: '20px',
            border: `1px solid ${selectedDetection.markerColor || 'var(--accent-cyan)'}`,
            background: 'rgba(15, 23, 42, 0.85)',
          }}
        >
          <div className="panel-header">
            <div>
              <div className="panel-title" style={{ color: selectedDetection.markerColor || '#FFFFFF' }}>
                <Flame size={18} />
                Selected Anomaly: #{selectedDetection.id} — {selectedDetection.predicted_class}
              </div>
              <div className="panel-subtitle">Detailed sensor telemetry from backend record</div>
            </div>
            <button
              onClick={() => setSelectedDetection(null)}
              className="btn-secondary"
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              Close Inspector
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              fontSize: '12.5px',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Coordinates</span>
              <strong className="mono-cell" style={{ color: '#FFFFFF' }}>
                {selectedDetection.latitude.toFixed(4)}, {selectedDetection.longitude.toFixed(4)}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>AI Confidence</span>
              <strong className="mono-cell">
                {(selectedDetection.prediction_confidence * 100).toFixed(1)}%
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Fire Radiative Power (FRP)</span>
              <strong className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                {selectedDetection.frp ? `${selectedDetection.frp.toFixed(1)} MW` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Brightness Temperature</span>
              <strong className="mono-cell">
                {selectedDetection.brightness ? `${selectedDetection.brightness.toFixed(1)} K` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Satellite & Sensor</span>
              <span style={{ color: 'var(--accent-cyan)' }}>{selectedDetection.source}</span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Acquisition Timestamp</span>
              <span className="mono-cell">{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</span>
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                Operational Detection Status & Safety Notice:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge status="REQUIRES_VERIFICATION" type="verification" />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedDetection.detectionStatus} &mdash; <em>Ground verification required prior to operational mobilization.</em>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
