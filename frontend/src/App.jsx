import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './views/OverviewView';
import { GisMapView } from './views/GisMapView';
import { DetectionsView } from './views/DetectionsView';
import { AlertsView } from './views/AlertsView';
import { AnalyticsView } from './views/AnalyticsView';
import { HistoryView } from './views/HistoryView';

import {
  getHealth,
  getAnalyticsSummary,
  getDetections,
  getAlerts,
  getRecentAlerts,
  updateAlertStatus,
  createDetection,
} from './services/api';

export function App() {
  const [currentTab, setCurrentTab] = useState('overview');
  const [isBackendHealthy, setIsBackendHealthy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const isFetchingRef = useRef(false);

  // Core Data States
  const [analytics, setAnalytics] = useState(null);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);

  // Fetch all backend data
  const loadDashboardData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setLoading(true);

      // 1. Health check
      try {
        await getHealth();
        setIsBackendHealthy(true);
      } catch {
        setIsBackendHealthy(false);
      }

      // 2. Fetch Analytics
      try {
        const summary = await getAnalyticsSummary();
        setAnalytics(summary);
      } catch (e) {
        console.warn('Analytics summary failed:', e);
      }

      // 3. Fetch Detections
      try {
        const detData = await getDetections({ limit: 100 });
        setDetections(detData.items || []);
      } catch (e) {
        console.warn('Detections fetch failed:', e);
      }

      // 4. Fetch Alerts
      try {
        const alertData = await getAlerts({ limit: 50 });
        setAlerts(alertData.items || []);
      } catch (e) {
        console.warn('Alerts fetch failed:', e);
      }

      // 5. Fetch Recent Alerts
      try {
        const recent = await getRecentAlerts(10);
        setRecentAlerts(recent || []);
      } catch (e) {
        console.warn('Recent alerts fetch failed:', e);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    // Heartbeat poll every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  // Handle Ingesting a Controlled Real Test Hotspot into Backend
  const handleIngestTestHotspot = async () => {
    try {
      setIsIngesting(true);
      const testCoordinates = [
        { lat: 21.1702, lon: 72.8311, name: 'Hazira Petrochemical Zone, Surat', cls: 'Industrial Fire', frp: 68.4, temp: 378.2 },
        { lat: 22.4707, lon: 70.0577, name: 'Jamnagar Refinery Flare Cluster', cls: 'Persistent Thermal Source', frp: 54.0, temp: 362.5 },
        { lat: 22.5726, lon: 88.3639, name: 'Haldia Industrial Complex', cls: 'Industrial Fire', frp: 82.1, temp: 395.0 },
        { lat: 17.6868, lon: 83.2185, name: 'Visakhapatnam Steel Zone', cls: 'Persistent Thermal Source', frp: 45.0, temp: 348.0 },
      ];
      // Pick random test site
      const site = testCoordinates[Math.floor(Math.random() * testCoordinates.length)];
      const now = new Date();

      const payload = {
        latitude: site.lat + (Math.random() - 0.5) * 0.02,
        longitude: site.lon + (Math.random() - 0.5) * 0.02,
        brightness: site.temp,
        confidence: 'high',
        acq_date: now.toISOString().slice(0, 10),
        acq_time: `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`,
        source: 'SAMPLE_TEST_HOTSPOT',
        instrument: 'VIIRS_SIMULATED',
        frp: site.frp,
        daynight: now.getUTCHours() >= 6 && now.getUTCHours() < 18 ? 'D' : 'N',
        predicted_class: site.cls,
        prediction_confidence: 0.92 + Math.random() * 0.07,
        is_persistent: site.cls.includes('Persistent'),
        data_provenance: 'SAMPLE',
        model_version: '2.0.0-scientific-prototype',
        alert_level: 'CRITICAL',
      };

      await createDetection(payload);
      await loadDashboardData();
    } catch (err) {
      alert(`Ingestion failed: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // Handle Status Update on an Alert
  const handleUpdateAlertStatus = async (alertId, newStatus, notes) => {
    await updateAlertStatus(alertId, newStatus, notes);
    await loadDashboardData();
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'overview':
        return 'System Overview & Telemetry';
      case 'gis-map':
        return 'Interactive GIS Thermal Anomaly Map';
      case 'detections':
        return 'Satellite Thermal Hotspot Records';
      case 'alerts':
        return 'Incident Alert Review & Verification Stream';
      case 'analytics':
        return 'Thermal Source Analytics & Distributions';
      case 'history':
        return 'Historical Observation Archives';
      default:
        return 'Dashboard';
    }
  };

  const unverifiedAlertsCount = alerts.filter(
    (a) => a.verification_status === 'REQUIRES_VERIFICATION'
  ).length;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        alertCount={unverifiedAlertsCount}
        isBackendHealthy={isBackendHealthy}
      />

      {/* Main Content Area */}
      <main className="main-content">
        <Header
          pageTitle={getPageTitle()}
          isBackendHealthy={isBackendHealthy}
          onRefresh={loadDashboardData}
          onIngestSample={handleIngestTestHotspot}
          isIngesting={isIngesting}
        />

        <div className="content-body">
          {currentTab === 'overview' && (
            <OverviewView
              analytics={analytics}
              recentAlerts={recentAlerts}
              onNavigate={setCurrentTab}
              onUpdateAlertStatus={handleUpdateAlertStatus}
            />
          )}

          {currentTab === 'gis-map' && (
            <GisMapView
              detections={detections}
              onSelectDetection={(d) => setCurrentTab('detections')}
            />
          )}

          {currentTab === 'detections' && (
            <DetectionsView
              detections={detections}
              onRefresh={loadDashboardData}
              loading={loading}
            />
          )}

          {currentTab === 'alerts' && (
            <AlertsView
              alerts={alerts}
              onUpdateAlertStatus={handleUpdateAlertStatus}
              onRefresh={loadDashboardData}
              loading={loading}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView analytics={analytics} />
          )}

          {currentTab === 'history' && (
            <HistoryView detections={detections} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
