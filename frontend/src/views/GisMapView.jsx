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
  Globe,
  Map as MapIcon,
  Columns,
  Radio,
} from 'lucide-react';
import { getDetections } from '../services/api';
import { StatusBadge, ClassBadge, ProvenanceBadge } from '../components/StatusBadge';
import { EarthGlobe3D } from '../components/EarthGlobe3D';
import { GlobalThermalEarth } from '../components/GlobalThermalEarth';

export function GisMapView({ initialSelectedDetection = null }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Visualization Mode: 'dual' (Side-by-side), '3d' (Full 3D Earth), 'thermal' (Global Thermal Earth), 'gis-ops' (Detailed GIS Leaflet)
  const [viewMode, setViewMode] = useState('dual');

  // Filter States
  const [sourceType, setSourceType] = useState('');
  const [detectionType, setDetectionType] = useState('');
  const [provenanceFilter, setProvenanceFilter] = useState('');
  const [alertLevelFilter, setAlertLevelFilter] = useState('');
  const [minConfidence, setMinConfidence] = useState(0.0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Map Data State
  const [mapDetections, setMapDetections] = useState([]);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync external selection if provided
  useEffect(() => {
    if (initialSelectedDetection) {
      setSelectedDetection(initialSelectedDetection);
    }
  }, [initialSelectedDetection]);

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
      if (provenanceFilter) params.data_provenance = provenanceFilter;
      if (alertLevelFilter) params.alert_level = alertLevelFilter;
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
  }, [sourceType, detectionType, provenanceFilter, alertLevelFilter, minConfidence, startDate, endDate]);

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
      // Ensure invalid coordinates never render
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

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
      const frpVal = parseFloat(d.frp || 0);
      const radius = Math.max(7, Math.min(24, Math.sqrt(Math.max(1, frpVal)) * 2.5));

      const circle = L.circleMarker([lat, lon], {
        radius: radius,
        fillColor: markerColor,
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.75,
      });

      const provenanceBadgeColor =
        d.data_provenance === 'REAL_FIRMS' ? '#34D399' : d.data_provenance === 'PROTOTYPE_LABELLED' ? '#818CF8' : '#38BDF8';
      const provenanceLabel =
        d.data_provenance === 'REAL_FIRMS'
          ? 'REAL_FIRMS'
          : d.data_provenance === 'PROTOTYPE_LABELLED'
          ? 'PROTOTYPE_LABELLED'
          : 'USER_UPLOADED';

      // Construct rich popup with all required fields (Step 3)
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; font-size: 12px; color: #F8FAFC; min-width: 250px; line-height: 1.55;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
            <span style="font-size: 13.5px; font-weight: 700; color: ${markerColor};">
              ${d.predicted_class || 'Thermal Anomaly'}
            </span>
            <span style="font-size: 10px; font-weight: 700; color: ${provenanceBadgeColor}; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">
              ${provenanceLabel}
            </span>
          </div>
          <div><strong>Classification:</strong> ${d.predicted_class || 'Unknown'}</div>
          <div><strong>AI Confidence:</strong> ${(parseFloat(d.prediction_confidence || 0) * 100).toFixed(1)}% (Sensor: ${d.confidence || 'nominal'})</div>
          <div><strong>FRP:</strong> ${d.frp !== null && d.frp !== undefined ? parseFloat(d.frp).toFixed(1) + ' MW' : 'N/A'}</div>
          <div><strong>Brightness Temp:</strong> ${d.brightness ? parseFloat(d.brightness).toFixed(1) + ' K' : 'N/A'}</div>
          <div><strong>Satellite / Instrument:</strong> ${d.source || 'VIIRS'} / ${d.instrument || 'VIIRS'}</div>
          <div><strong>Acquisition Time:</strong> ${d.acq_date} ${d.acq_time} UTC</div>
          <div><strong>Data Provenance:</strong> <span style="color: ${provenanceBadgeColor}; font-weight: 600;">${d.data_provenance || 'REAL_FIRMS'}</span></div>
          <div><strong>Model Version:</strong> <span style="color: #94A3B8; font-family: monospace;">${d.model_version || '2.0.0-scientific-prototype'}</span></div>
          <div><strong>Verification Status:</strong> <span style="color: #C084FC;">Requires Verification</span></div>
          <div style="margin-top: 8px; padding: 5px 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: #FCA5A5; font-size: 10.5px; font-weight: 600; text-align: center;">
            ⚠️ AI prediction &mdash; Requires Verification
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

  // When switching to 2D mode, invalidate Leaflet map size and focus selected detection if present
  // When switching to gis-ops mode, invalidate Leaflet map size and focus selected detection if present
  useEffect(() => {
    if (viewMode === 'gis-ops' && mapInstanceRef.current) {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          if (selectedDetection) {
            const lat = parseFloat(selectedDetection.latitude);
            const lon = parseFloat(selectedDetection.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
              mapInstanceRef.current.flyTo([lat, lon], 10, { duration: 1.2 });
            }
          }
        }
      }, 150);
    }
  }, [viewMode, selectedDetection]);

  return (
    <div>
      {/* Dynamic Filter Toolbar with Dual / 3D / Thermal / GIS Mode Switcher */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '10px' }}>
        {/* Visualization Mode Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '2px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('dual')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: viewMode === 'dual' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              color: viewMode === 'dual' ? '#38BDF8' : '#94A3B8',
              border: viewMode === 'dual' ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Dual View: 3D Earth Globe + Flat Global Thermal Earth Side-by-Side"
          >
            <Columns size={13} />
            <span>Dual View</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('3d')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: viewMode === '3d' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              color: viewMode === '3d' ? '#38BDF8' : '#94A3B8',
              border: viewMode === '3d' ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="3D Rotating Earth Globe Focus View"
          >
            <Globe size={13} />
            <span>3D Earth</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('thermal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: viewMode === 'thermal' ? 'rgba(239, 68, 68, 0.22)' : 'transparent',
              color: viewMode === 'thermal' ? '#EF4444' : '#94A3B8',
              border: viewMode === 'thermal' ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Transparent Flat Global Thermal Earth Overlay"
          >
            <Radio size={13} />
            <span>Global Thermal</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('gis-ops')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: viewMode === 'gis-ops' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              color: viewMode === 'gis-ops' ? '#38BDF8' : '#94A3B8',
              border: viewMode === 'gis-ops' ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Detailed Operational Leaflet GIS Map with Satellite / Base Tiles"
          >
            <MapIcon size={13} />
            <span>GIS Ops Map</span>
          </button>
        </div>

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
            <option value="Forest Fire">Forest Fire</option>
            <option value="Persistent Thermal Source">Persistent Thermal Source</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Data Provenance Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={15} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Data:</span>
          <select
            value={provenanceFilter}
            onChange={(e) => setProvenanceFilter(e.target.value)}
            className="filter-input"
          >
            <option value="">All Data Origins</option>
            <option value="REAL_FIRMS">REAL_FIRMS (NASA)</option>
            <option value="USER_UPLOADED">USER_UPLOADED</option>
            <option value="PROTOTYPE_LABELLED">PROTOTYPE_LABELLED</option>
          </select>
        </div>

        {/* Alert Severity Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={15} style={{ color: 'var(--accent-red)' }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Severity:</span>
          <select
            value={alertLevelFilter}
            onChange={(e) => setAlertLevelFilter(e.target.value)}
            className="filter-input"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="LOW_CONFIDENCE_REVIEW">Low-Confidence Review</option>
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
            style={{ width: '90px' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#FFFFFF', minWidth: '32px' }}>
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

      {/* 1. DUAL MISSION CONTROL VIEW (Left: 3D Earth, Right: Global Thermal Earth) */}
      {viewMode === 'dual' && (
        <div
          className="dual-earth-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '14px',
            width: '100%',
            minHeight: '660px',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 200px)', minHeight: '620px' }}>
            <EarthGlobe3D
              detections={mapDetections}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
              onSwitchTo2D={() => setViewMode('thermal')}
            />
          </div>
          <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 200px)', minHeight: '620px' }}>
            <GlobalThermalEarth
              detections={mapDetections}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
            />
          </div>
        </div>
      )}

      {/* 2. 3D EARTH FOCUS VIEW */}
      {viewMode === '3d' && (
        <EarthGlobe3D
          detections={mapDetections}
          selectedDetection={selectedDetection}
          onSelectDetection={setSelectedDetection}
          onSwitchTo2D={() => setViewMode('thermal')}
        />
      )}

      {/* 3. GLOBAL THERMAL EARTH FOCUS VIEW */}
      {viewMode === 'thermal' && (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 180px)', minHeight: '620px' }}>
          <GlobalThermalEarth
            detections={mapDetections}
            selectedDetection={selectedDetection}
            onSelectDetection={setSelectedDetection}
          />
        </div>
      )}

      {/* 4. OPERATIONAL LEAFLET GIS MAP (Preserved for Detailed Ground Inspection per Part 10) */}
      <div
        className="map-viewport-wrapper"
        style={{ display: viewMode === 'gis-ops' ? 'block' : 'none' }}
      >
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

      {/* Selected Anomaly Telemetry Inspector Sheet (in 2D mode) */}
      {viewMode === '2d' && selectedDetection && (
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
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Canonical Coordinates</span>
              <strong className="mono-cell" style={{ color: '#FFFFFF', letterSpacing: '0.02em' }}>
                {parseFloat(selectedDetection.latitude).toFixed(6)}°, {parseFloat(selectedDetection.longitude).toFixed(6)}°
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>AI Confidence</span>
              <strong className="mono-cell">
                {(parseFloat(selectedDetection.prediction_confidence || 0) * 100).toFixed(1)}%
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Fire Radiative Power (FRP)</span>
              <strong className="mono-cell" style={{ color: 'var(--accent-orange)' }}>
                {selectedDetection.frp !== null && selectedDetection.frp !== undefined ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Brightness Temperature</span>
              <strong className="mono-cell">
                {selectedDetection.brightness ? `${parseFloat(selectedDetection.brightness).toFixed(1)} K` : 'N/A'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Satellite & Sensor</span>
              <span style={{ color: 'var(--accent-cyan)' }}>
                {selectedDetection.source} ({selectedDetection.instrument || 'VIIRS'})
              </span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Acquisition Timestamp</span>
              <span className="mono-cell">{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Data Provenance</span>
              <ProvenanceBadge provenance={selectedDetection.data_provenance} />
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Model Version</span>
              <span className="mono-cell" style={{ color: '#94A3B8' }}>
                {selectedDetection.model_version || '2.0.0-scientific-prototype'}
              </span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Alert Severity</span>
              <StatusBadge status={selectedDetection.alert_level || 'LOW'} type="severity" />
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
