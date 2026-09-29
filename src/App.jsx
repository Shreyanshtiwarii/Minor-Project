import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import Sidebar, { SIDEBAR_COLLAPSE_KEY, SIDEBAR_COLLAPSE_EVENT } from './components/Sidebar';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import ConfirmEmailChange from './pages/ConfirmEmailChange';
import Dashboard from './pages/Dashboard';
import PlanRoute from './pages/PlanRoute';
import CompareOptions from './pages/CompareOptions';
import MyImpact from './pages/MyImpact';
import VehiclePool from './pages/VehiclePool';
import EVIntelligence from './pages/EVIntelligence';
import ProfileSettings from './pages/ProfileSettings';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Admin Imports
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTransportData from './pages/admin/AdminTransportData';
import AdminUsers from './pages/admin/AdminUsers';
import AdminFuelPrices from './pages/admin/AdminFuelPrices';
import AdminEmissionFactors from './pages/admin/AdminEmissionFactors';
import AdminEVData from './pages/admin/AdminEVData';
import AdminTransitData from './pages/admin/AdminTransitData';
import AdminIntegrations from './pages/admin/AdminIntegrations';
import AdminSystemHealth from './pages/admin/AdminSystemHealth';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminAuditLogs from './pages/admin/AdminAuditLogs';
import AdminProfile from './pages/admin/AdminProfile';

// Developer Imports
import DeveloperLanding from './pages/developer/DeveloperLanding';
import DeveloperLogin from './pages/developer/DeveloperLogin';

function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleChange = (e) => setCollapsed(e.detail);
    window.addEventListener(SIDEBAR_COLLAPSE_EVENT, handleChange);
    return () => window.removeEventListener(SIDEBAR_COLLAPSE_EVENT, handleChange);
  }, []);

  return (
    <div className="bg-background text-on-background font-body-md antialiased min-h-screen">
      <Sidebar />
      <div
        className={`min-h-screen flex flex-col transition-[margin] duration-[250ms] ease-in-out ${
          collapsed ? 'md:ml-[76px]' : 'md:ml-[260px]'
        }`}
      >
        <Header />
        <main className="flex-1 flex flex-col md:h-[calc(100vh-64px)] min-h-0 overflow-y-auto md:overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Authentication */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />

          {/* Admin Login & Control Center */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/transport-data" element={<AdminTransportData />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/fuel-prices" element={<AdminFuelPrices />} />
            <Route path="/admin/emission-factors" element={<AdminEmissionFactors />} />
            <Route path="/admin/ev-data" element={<AdminEVData />} />
            <Route path="/admin/transit-data" element={<AdminTransitData />} />
            <Route path="/admin/integrations" element={<AdminIntegrations />} />
            <Route path="/admin/system-health" element={<AdminSystemHealth />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="/admin/profile" element={<AdminProfile />} />
          </Route>

          {/* Developer Landing & Login Routes */}
          <Route path="/developer" element={<DeveloperLanding />} />
          <Route path="/developer/login" element={<DeveloperLogin />} />

          {/* Application User Layout Routes (require authentication) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/plan-route" element={<PlanRoute />} />
              <Route path="/compare" element={<CompareOptions />} />
              <Route path="/impact" element={<MyImpact />} />
              <Route path="/vehicle-pool" element={<VehiclePool />} />
              <Route path="/ev-intelligence" element={<EVIntelligence />} />
              <Route path="/ev-carpool" element={<Navigate to="/vehicle-pool" replace />} />
              <Route path="/carpool" element={<Navigate to="/vehicle-pool" replace />} />

              <Route path="/notifications" element={
                <div className="p-md lg:p-lg text-on-surface">
                  <h2 className="text-headline-md font-headline-md text-primary mb-4">Notifications</h2>
                  <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-xl shadow-sm text-body-md text-on-surface-variant">
                    No new notifications. Your commute is on track!
                  </div>
                </div>
              } />
              <Route path="/profile" element={<ProfileSettings />} />
            </Route>
          </Route>

          {/* Catch-all Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
