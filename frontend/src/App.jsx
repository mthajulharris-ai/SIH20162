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
import { AiAssistantView } from './views/AiAssistantView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { UploadAndAnalyzeModal } from './components/UploadAndAnalyzeModal';
<<<<<<< HEAD
import { AiAssistantModal } from './components/AiAssistantModal';
=======
import { SatraAiChatbotModal } from './components/SatraAiChatbotModal';
import { Sparkles } from 'lucide-react';
>>>>>>> c080c5c (LIVE CONNECTION)

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
  const [authSession, setAuthSession] = useState(() => {
    try {
      const saved = localStorage.getItem('satra_auth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const isAuthenticated = !!authSession;

  const validTabs = [
    'overview', 'earth-intel', 'thermal-intel', 'detection-explorer',
    'alerts', 'analytics', 'gis-investigation', 'satellite-data',
    'settings', 'ai-assistant', 'dashboard'
  ];

  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash === 'dashboard') return 'overview';
    if (validTabs.includes(hash)) return hash;
    return 'earth-intel';
  };

  const [currentTab, setCurrentTab] = useState(getInitialTab);

  // Synchronize with URL hash
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash === 'dashboard') {
        setCurrentTab('overview');
        return;
      }
      if (validTabs.includes(hash) && hash !== currentTab) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentTab]);

  const handleTabChange = (tabId) => {
    const target = tabId === 'dashboard' ? 'overview' : tabId;
    setCurrentTab(target);
    window.location.hash = target;
  };

  const handleLogin = (userData) => {
    try {
      localStorage.setItem('satra_auth', JSON.stringify(userData));
    } catch (e) {
      console.warn('Failed to persist auth:', e);
    }
    setAuthSession(userData);
    handleTabChange('overview');
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('satra_auth');
    } catch (e) {
      console.warn('Failed to clear auth:', e);
    }
    setAuthSession(null);
    window.location.hash = 'login';
  };
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [isAiAssistantModalOpen, setIsAiAssistantModalOpen] = useState(false);
  // ONE shared real-time backend connection state used by Header + Sidebar.
  // 'checking' | 'online' | 'offline'
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const isBackendHealthy = connectionStatus === 'online';
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const isFetchingRef = useRef(false);
  const isHealthCheckingRef = useRef(false);


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

  // Lightweight real-time health probe — drives ONE shared connectionStatus
  const checkBackendHealth = useCallback(async ({ showChecking = false } = {}) => {
    if (isHealthCheckingRef.current) return;
    isHealthCheckingRef.current = true;
    if (showChecking) {
      setConnectionStatus((prev) => (prev === 'online' || prev === 'offline' ? prev : 'checking'));
      // On first load always show checking
      setConnectionStatus((prev) => (prev === 'checking' ? 'checking' : prev));
    }
    try {
      if (showChecking) setConnectionStatus('checking');
      await getHealth();
      setConnectionStatus('online');
    } catch {
      setConnectionStatus('offline');
    } finally {
      isHealthCheckingRef.current = false;
    }
  }, []);

  // Fetch all backend data (does not own connection status alone — health poll does)
  const loadDashboardData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setLoading(true);

      // 1. Health check (updates shared connectionStatus)
      try {
        await getHealth();
        setConnectionStatus('online');
      } catch {
        setConnectionStatus('offline');
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
    // Initial full data load
    loadDashboardData();
    // Dedicated health heartbeat every 15s so Header + Sidebar stay in sync
    const healthInterval = setInterval(() => {
      checkBackendHealth({ showChecking: false });
    }, 15000);
    // Full dashboard refresh every 30s
    const dataInterval = setInterval(loadDashboardData, 30000);
    return () => {
      clearInterval(healthInterval);
      clearInterval(dataInterval);
    };
  }, [loadDashboardData, checkBackendHealth]);



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
      case 'ai-assistant':
        return 'SATRA AI Assistant';
      case 'settings':
        return 'Flight Deck Settings';
      default:
        return 'SATRA Command';
    }
  };

  const unverifiedAlertsCount = alerts.filter(
    (a) => a.verification_status === 'REQUIRES_VERIFICATION' || a.alert_level === 'CRITICAL'
  ).length;

  // Protected Routing: unauthenticated visitors or explicit login route
  const isLoginRoute = window.location.hash.toLowerCase() === '#login' || window.location.pathname === '/login';
  if (!isAuthenticated || isLoginRoute) {
    return <LoginView onLogin={handleLogin} />;
  }

  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        alertCount={unverifiedAlertsCount}
        isBackendHealthy={isBackendHealthy}
        connectionStatus={connectionStatus}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-content">
        <Header
          pageTitle={getPageTitle()}
          isBackendHealthy={isBackendHealthy}
          connectionStatus={connectionStatus}
          onRefresh={loadDashboardData}
          detections={detections}
          alerts={alerts}
          onFocusDetection={handleFocusDetection}
          onNavigate={handleTabChange}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
<<<<<<< HEAD
          onOpenAiAssistant={() => setIsAiAssistantModalOpen(true)}
=======
          onToggleChatbot={() => setIsChatbotOpen((prev) => !prev)}
>>>>>>> c080c5c (LIVE CONNECTION)
        />

        <div className="content-body">
          {/* 01 Overview */}
          {currentTab === 'overview' && (
            <OverviewView
              analytics={analytics}
              detections={detections}
              recentAlerts={recentAlerts}
              onNavigate={handleTabChange}
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
              selectedDetection={selectedDetection}
              onSelectDetection={setSelectedDetection}
              onNavigate={handleTabChange}
              onRefresh={loadDashboardData}
              isBackendHealthy={isBackendHealthy}
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
              onRefresh={loadDashboardData}
              onNavigate={handleTabChange}
              onFocusDetection={handleFocusDetection}
              onSelectDetection={setSelectedDetection}
              onAnalysisSuccess={(newDetection) => {
                if (newDetection) {
                  setDetections((prev) => [newDetection, ...prev]);
                  setSelectedDetection(newDetection);
                }
                loadDashboardData();
              }}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />
          )}

          {/* 09 Settings */}
          {currentTab === 'settings' && (
            <SettingsView detections={detections} />
          )}

          {/* AI Assistant Dedicated Workspace (if launched via view) */}
          {currentTab === 'ai-assistant' && (
            <AiAssistantView detections={detections} />
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

<<<<<<< HEAD
        {/* Global AI Assistant Expandable Workspace / Slide-Over Modal */}
        <AiAssistantModal
          isOpen={isAiAssistantModalOpen}
          onClose={() => setIsAiAssistantModalOpen(false)}
        />
=======
        {/* SATRA AI Satellite Copilot Chatbot Modal (Section 14) */}
        <SatraAiChatbotModal
          isOpen={isChatbotOpen}
          onClose={() => setIsChatbotOpen(false)}
          onFocusDetection={handleFocusDetection}
        />

        {/* Floating Copilot Launcher Button */}
        {!isChatbotOpen && (
          <button
            onClick={() => setIsChatbotOpen(true)}
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 999,
              background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: '24px',
              padding: '10px 18px',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
            title="Open SATRA AI Satellite Copilot"
          >
            <Sparkles size={16} style={{ color: '#38BDF8' }} />
            <span>SATRA AI Copilot</span>
          </button>
        )}
>>>>>>> c080c5c (LIVE CONNECTION)
      </main>
    </div>
  );
}

export default App;
