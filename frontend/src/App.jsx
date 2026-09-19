import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

// Master Views
import { OverviewView } from './views/OverviewView';
import { PathIntelligenceView } from './views/PathIntelligenceView';
import { InvestigateView } from './views/InvestigateView';
import { HistoryView } from './views/HistoryView';
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
import { AiAssistantModal } from './components/AiAssistantModal';
import { SatraAiChatbotModal } from './components/SatraAiChatbotModal';
import { FloatingAiButton } from './components/FloatingAiButton';
import { ErrorBoundary } from './components/ErrorBoundary';

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
      const wasLoggedOut = localStorage.getItem('satra_logged_out') === 'true';
      if (saved && !wasLoggedOut && window.location.hash.length > 2 && window.location.hash !== '#/login') {
        return JSON.parse(saved);
      }
      return null;
    } catch {
      return null;
    }
  });
  const isAuthenticated = !!authSession;

  const validTabs = [
    'overview', 'earth-intel', 'thermal-intel', 'detection-explorer',
    'alerts', 'analytics', 'gis-investigation', 'satellite-data',
    'ai-assistant', 'settings',
    'path-intel', 'investigate', 'live-monitoring', 'history', 'dashboard'
  ];

  const normalizeTab = (rawHash) => {
    const clean = (rawHash || '').replace(/^#\/?/, '').trim().toLowerCase();
    if (clean === 'dashboard') return 'overview';
    return clean;
  };

  const getInitialTab = () => {
    const tab = normalizeTab(window.location.hash);
    if (validTabs.includes(tab)) return tab;
    return 'overview';
  };

  const [currentTab, setCurrentTab] = useState(getInitialTab);

  // Synchronize with URL hash
  useEffect(() => {
    const onHashChange = () => {
      const tab = normalizeTab(window.location.hash);
      if (validTabs.includes(tab) && tab !== currentTab) {
        setCurrentTab(tab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentTab]);

  const handleTabChange = (tabId) => {
    const target = tabId === 'dashboard' ? 'overview' : tabId;
    setCurrentTab(target);
    window.location.hash = `/${target}`;
  };

  const handleLogin = (userData) => {
    try {
      localStorage.removeItem('satra_logged_out');
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
      localStorage.setItem('satra_logged_out', 'true');
    } catch (e) {
      console.warn('Failed to clear auth:', e);
    }
    setAuthSession(null);
    window.location.hash = '/login';
  };
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [isAiAssistantModalOpen, setIsAiAssistantModalOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  // ONE shared real-time backend connection state used by Header + Sidebar.
  // 'online' | 'offline'
  const [connectionStatus, setConnectionStatus] = useState('offline');
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
  const checkBackendHealth = useCallback(async () => {
    if (isHealthCheckingRef.current) return;
    isHealthCheckingRef.current = true;
    try {
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
    // Initial health check immediately on mount
    checkBackendHealth();
    // Initial full data load
    loadDashboardData();
    // Dedicated health heartbeat every 10s so Header + Sidebar stay in sync
    const healthInterval = setInterval(() => {
      checkBackendHealth();
    }, 10000);
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
      case 'path-intel':
        return 'Path Intelligence';
      case 'investigate':
        return 'Deep Event Investigation';
      case 'live-monitoring':
        return 'Live Monitoring';
      case 'history':
        return 'Historical Detections';
      default:
        return 'SATRA Command';
    }
  };

  const unverifiedAlertsCount = alerts.filter(
    (a) => a.verification_status === 'REQUIRES_VERIFICATION' || a.alert_level === 'CRITICAL'
  ).length;

  // Protected Routing: unauthenticated visitors or explicit login route
  const currentRoute = normalizeTab(window.location.hash);
  const isLoginRoute = currentRoute === 'login' || window.location.pathname === '/login';
  if (!isAuthenticated || isLoginRoute) {
    return <LoginView onLogin={handleLogin} />;
  }

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
          onOpenAiAssistant={() => setIsAiAssistantModalOpen(true)}
          onToggleChatbot={() => setIsChatbotOpen((prev) => !prev)}
        />

        <div className="content-body">
          <ErrorBoundary key={currentTab}>
            {/* 01 Overview — Geospatial Situational Awareness */}
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
                onOpenAiAssistant={() => setIsAiAssistantModalOpen(true)}
              />
            )}

            {/* 02 Earth Intelligence */}
            {currentTab === 'earth-intel' && (
              <EarthIntelligenceView
                detections={detections}
                analytics={analytics}
                selectedDetection={selectedDetection}
                onSelectDetection={setSelectedDetection}
                onNavigate={handleTabChange}
              />
            )}

            {/* 02b Path Intelligence — Integrated Corridor Risk Analysis */}
            {currentTab === 'path-intel' && (
              <PathIntelligenceView
                onNavigate={handleTabChange}
                onSelectDetection={setSelectedDetection}
              />
            )}

            {/* 03 Thermal Intelligence (also handles live-monitoring) */}
            {(currentTab === 'thermal-intel' || currentTab === 'live-monitoring') && (
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
              <AnalyticsView analytics={analytics} onNavigate={handleTabChange} />
            )}

            {/* 06b History — Historical Detections Log */}
            {currentTab === 'history' && (
              <HistoryView detections={detections} onNavigate={handleTabChange} />
            )}

            {/* 07 GIS Investigation */}
            {currentTab === 'gis-investigation' && (
              <GisInvestigationView
                detections={detections}
                selectedDetection={selectedDetection}
                onSelectDetection={setSelectedDetection}
                onFocusDetection={handleFocusDetection}
                onRefresh={loadDashboardData}
                onNavigate={handleTabChange}
              />
            )}

            {/* 07b Investigate — Deep Thermal Event Intelligence */}
            {currentTab === 'investigate' && (
              <InvestigateView
                selectedDetection={selectedDetection}
                allDetections={detections}
                onSelectDetection={setSelectedDetection}
                onNavigate={handleTabChange}
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

            {/* 09 AI Assistant Dedicated Workspace */}
            {currentTab === 'ai-assistant' && (
              <AiAssistantView detections={detections} />
            )}

            {/* 10 Settings */}
            {currentTab === 'settings' && (
              <SettingsView detections={detections} />
            )}
          </ErrorBoundary>
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

        {/* Global AI Assistant Expandable Workspace / Slide-Over Panel */}
        <AiAssistantModal
          isOpen={isAiAssistantModalOpen}
          onClose={() => setIsAiAssistantModalOpen(false)}
        />

        {/* SATRA AI Satellite Copilot Chatbot Modal (Section 14) */}
        <SatraAiChatbotModal
          isOpen={isChatbotOpen}
          onClose={() => setIsChatbotOpen(false)}
          onFocusDetection={handleFocusDetection}
        />

      </main>

      {/* Single persistent floating "Ask SATRA" access point — fixed to the
          viewport (bottom: 24px / right: 24px) on every page. The ONLY
          floating AI Assistant entry; no duplicate chatbot cards. */}
      {!isChatbotOpen && (
        <FloatingAiButton onClick={() => setIsChatbotOpen(true)} />
      )}
    </div>
  );
}

export default App;
