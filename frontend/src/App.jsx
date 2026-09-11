import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

// 11 Master Views
import { OverviewView } from './views/OverviewView';
import { EarthIntelligenceView } from './views/EarthIntelligenceView';
import { ThermalIntelligenceView } from './views/ThermalIntelligenceView';
import { DetectionExplorerView } from './views/DetectionExplorerView';
import { AlertsView } from './views/AlertsView';
import { AnalyticsView } from './views/AnalyticsView';
import { GisInvestigationView } from './views/GisInvestigationView';
import { SatelliteDataView } from './views/SatelliteDataView';
import { AiIntelligenceView } from './views/AiIntelligenceView';
import { SpaceExplorerView } from './views/SpaceExplorerView';
import { SettingsView } from './views/SettingsView';
import { UploadAndAnalyzeModal } from './components/UploadAndAnalyzeModal';

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
  const validTabs = [
    'overview', 'earth-intel', 'thermal-intel', 'detection-explorer',
    'alerts', 'analytics', 'gis-investigation', 'satellite-data',
    'ai-intelligence', 'space-explorer', 'settings'
  ];

  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (validTabs.includes(hash)) return hash;
    return 'earth-intel';
  };

  const [currentTab, setCurrentTab] = useState(getInitialTab);

  // Synchronize with URL hash
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (validTabs.includes(hash) && hash !== currentTab) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentTab]);

  const handleTabChange = (tabId) => {
    setCurrentTab(tabId);
    window.location.hash = tabId;
  };
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [isBackendHealthy, setIsBackendHealthy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const isFetchingRef = useRef(false);

  // Core Data States
  const [analytics, setAnalytics] = useState(null);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);

  // Focus a detection on 3D Earth / Global Command Deck
  const handleFocusDetection = (detection) => {
    setSelectedDetection(detection);
    handleTabChange('earth-intel');
  };

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
        const detData = await getDetections({ limit: 200 });
        setDetections(detData.items || []);
      } catch (e) {
        console.warn('Detections fetch failed:', e);
      }

      // 4. Fetch Alerts
      try {
        const alertData = await getAlerts({ limit: 100 });
        setAlerts(alertData.items || []);
      } catch (e) {
        console.warn('Alerts fetch failed:', e);
      }

      // 5. Fetch Recent Alerts
      try {
        const recent = await getRecentAlerts(12);
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
        return 'Overview Dashboard';
      case 'earth-intel':
        return 'Earth Intelligence';
      case 'thermal-intel':
        return 'Thermal Intelligence';
      case 'detection-explorer':
        return 'Detection Explorer';
      case 'alerts':
        return 'Incident Alert Stream';
      case 'analytics':
        return 'Thermal Analytics & Trends';
      case 'gis-investigation':
        return 'GIS Investigation Deck';
      case 'satellite-data':
        return 'Satellite Constellation Data';
      case 'ai-intelligence':
        return 'AI Model Intelligence';
      case 'space-explorer':
        return 'Educational Space Explorer';
      case 'settings':
        return 'Flight Deck Settings';
      default:
        return 'SATRA Command';
    }
  };

  const unverifiedAlertsCount = alerts.filter(
    (a) => a.verification_status === 'REQUIRES_VERIFICATION' || a.alert_level === 'CRITICAL'
  ).length;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
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
          detections={detections}
          alerts={alerts}
          onFocusDetection={handleFocusDetection}
          onNavigate={handleTabChange}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
        />

        <div className="content-body">
          {/* 01 Overview */}
          {currentTab === 'overview' && (
            <OverviewView
              analytics={analytics}
              detections={detections}
              recentAlerts={recentAlerts}
              onNavigate={setCurrentTab}
              onUpdateAlertStatus={handleUpdateAlertStatus}
              onFocusDetection={handleFocusDetection}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />
          )}

          {/* 02 Earth Intelligence */}
          {currentTab === 'earth-intel' && (
            <EarthIntelligenceView
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
            />
          )}

          {/* 03 Thermal Intelligence */}
          {currentTab === 'thermal-intel' && (
            <ThermalIntelligenceView
              detections={detections}
              analytics={analytics}
              onFocusDetection={handleFocusDetection}
            />
          )}

          {/* 04 Detection Explorer */}
          {currentTab === 'detection-explorer' && (
            <DetectionExplorerView
              detections={detections}
              onRefresh={loadDashboardData}
              loading={loading}
              onFocusDetection={handleFocusDetection}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
            />
          )}

          {/* 05 Alerts */}
          {currentTab === 'alerts' && (
            <AlertsView
              alerts={alerts}
              onUpdateAlertStatus={handleUpdateAlertStatus}
              onRefresh={loadDashboardData}
              loading={loading}
              onFocusDetection={handleFocusDetection}
            />
          )}

          {/* 06 Analytics */}
          {currentTab === 'analytics' && (
            <AnalyticsView analytics={analytics} />
          )}

          {/* 07 GIS Investigation */}
          {currentTab === 'gis-investigation' && (
            <GisInvestigationView
              detections={detections}
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
              onFocusDetection={handleFocusDetection}
              onRefresh={loadDashboardData}
            />
          )}

          {/* 08 Satellite Data */}
          {currentTab === 'satellite-data' && (
            <SatelliteDataView
              detections={detections}
              isBackendHealthy={isBackendHealthy}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />
          )}

          {/* 09 AI Intelligence */}
          {currentTab === 'ai-intelligence' && (
            <AiIntelligenceView />
          )}

          {/* 10 Space Explorer */}
          {currentTab === 'space-explorer' && (
            <SpaceExplorerView />
          )}

          {/* 11 Settings */}
          {currentTab === 'settings' && (
            <SettingsView detections={detections} />
          )}
        </div>

        {/* SATRA Core Pipeline Modal: Upload & AI Analysis */}
        <UploadAndAnalyzeModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onAnalysisSuccess={(newDetection) => {
            if (newDetection) {
              setDetections((prev) => [newDetection, ...prev]);
            }
            loadDashboardData();
          }}
          onViewExactLocation={(detection) => {
            handleFocusDetection(detection);
          }}
        />
      </main>
    </div>
  );
}

export default App;
