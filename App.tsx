
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { UserRole, Emergency } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewEmergency from './pages/NewEmergency';
import Alarm from './pages/Alarm';
import ActiveAlerts from './pages/ActiveAlerts';
import Admin from './pages/Admin';
import RolesManagement from './pages/admin/RolesManagement';
import JobTitlesManagement from './pages/admin/JobTitlesManagement';
import EmergencyTypesManagement from './pages/admin/EmergencyTypesManagement';
import LocationsManagement from './pages/admin/LocationsManagement';
import CaseReports from './pages/admin/CaseReports';
import LoginLogs from './pages/admin/LoginLogs';
import ActiveUsersReport from './pages/admin/ActiveUsersReport';
import AdvancedAnalytics from './pages/admin/AdvancedAnalytics'; 
import AiReports from './pages/AiReports';
import SettingsPage from './pages/Settings';
import PersonalReport from './pages/PersonalReport';
import MobileAppDownload from './pages/MobileAppDownload';
import MobileDiagnostics from './pages/MobileDiagnostics';
import CrisisSimulator from './pages/admin/CrisisSimulator';
import PresentationAssets from './pages/admin/PresentationAssets'; 
import IncidentPlayback from './pages/admin/IncidentPlayback';
import FacilityProfile from './pages/admin/FacilityProfile';
import ApiSettings from './pages/admin/ApiSettings';
import ConnectedDevicesMap from './pages/admin/ConnectedDevicesMap';
import { PrivateChatOverlay } from './components/PrivateChat';
import { Toast } from './components/Toast';
import { LogOut, Settings as SettingsIcon, Siren, User as UserIcon, ShieldCheck, Share, PlusSquare, X, WifiOff, RefreshCw, Smartphone, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { mobileNotificationService } from './services/mobileNotificationService';

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, logout, activeEmergencies, stopAllAlerts, isOfflineMode, isSyncing, isShiftSharing, startShiftSharing, stopShiftSharing } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [latestAlert, setLatestAlert] = useState<Emergency | null>(null);
  const [dismissedEmergencyIds, setDismissedEmergencyIds] = useState<string[]>([]);

  useEffect(() => {
    mobileNotificationService.setNavigationHandler((path) => navigate(path));
  }, [navigate]);

  useEffect(() => {
    const visibleEmergencies = activeEmergencies.filter(e => !dismissedEmergencyIds.includes(e.id));
    if (visibleEmergencies.length > 0) {
        if (!latestAlert || !visibleEmergencies.some(e => e.id === latestAlert.id)) {
            setLatestAlert(visibleEmergencies[0]);
        }
    } else { setLatestAlert(null); stopAllAlerts(); }
  }, [activeEmergencies, latestAlert, stopAllAlerts, dismissedEmergencyIds]);

  if (!user && location.pathname !== '/login') return <Navigate to="/login" replace />;
  
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      <PrivateChatOverlay />
      <Toast emergency={latestAlert} onClose={() => latestAlert && setDismissedEmergencyIds(p => [...p, latestAlert.id])} onClick={() => latestAlert && navigate(`/alarm/${latestAlert.id}`)} />
      {user && (
        <nav className="bg-white dark:bg-gray-800 shadow px-6 py-4 flex justify-between items-center sticky top-0 z-50">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
             <Siren size={24} className="text-red-600 animate-pulse" />
             <div className="flex flex-col">
                <span className="font-bold text-xl dark:text-white leading-none">ERS System</span>
                <div className="flex items-center gap-2 mt-1">
                   {isOfflineMode && <div className="flex items-center gap-1 text-[8px] font-black text-orange-500 uppercase tracking-tighter bg-orange-50 px-1.5 rounded-md"><WifiOff size={8}/> {t('offline_warning')}</div>}
                   {isSyncing && <div className="flex items-center gap-1 text-[8px] font-black text-blue-500 uppercase tracking-tighter bg-blue-50 px-1.5 rounded-md animate-pulse"><RefreshCw size={8}/> {t('syncing')}</div>}
                </div>
             </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Shift Sharing Quick Toggle */}
            <button
              onClick={isShiftSharing ? stopShiftSharing : startShiftSharing}
              title={isShiftSharing ? "المناوبة نشطة وموقعك مباشر - اضغط للإيقاف" : "اضغط لبدء المناوبة ومشاركة الموقع الميداني"}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                isShiftSharing 
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-300 shadow-sm' 
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isShiftSharing ? 'bg-green-500 animate-ping' : 'bg-gray-400'}`}></span>
              <span>{isShiftSharing ? 'المناوبة نشطة' : 'بدء المناوبة'}</span>
            </button>

            {/* Mobile Diagnostics Link */}
            <button 
              onClick={() => navigate('/mobile-diagnostics')} 
              title="تشخيص واختبار خدمات الموبايل" 
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
            >
              <Smartphone size={22} />
            </button>

            {isAdmin && (
              <>
                <button onClick={() => navigate('/admin/devices')} title="مراقبة الأجهزة والخريطة العالمية" className="p-2 text-blue-600 dark:text-blue-400 hover:opacity-80 transition-opacity"><Globe size={22} /></button>
                <button onClick={() => navigate('/personal-report')} title="الملف الشخصي" className="p-2 text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"><UserIcon size={24} /></button>
                <button onClick={() => navigate('/admin')} title="إدارة النظام" className="p-2 text-primary hover:opacity-80 transition-opacity"><ShieldCheck size={24} /></button>
              </>
            )}
            <button onClick={() => navigate('/settings')} title={t('settings')} className="p-2 text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"><SettingsIcon size={24} /></button>
            <button onClick={logout} className="text-red-600 flex items-center gap-1 font-black text-xs"><LogOut size={16} /> {t('logout')}</button>
          </div>
        </nav>
      )}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
};

// حماية حصرية للمدير الخارق (Super Admin)
const SuperAdminGuard = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useApp();
  // إذا لم يكن المستخدم سوبر أدمن، يتم طرده إلى لوحة التحكم العادية
  if (user?.role !== UserRole.SUPER_ADMIN) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/new-emergency" element={<NewEmergency />} />
      <Route path="/alarm/:id" element={<Alarm />} />
      <Route path="/active-alerts" element={<ActiveAlerts />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/devices" element={<ConnectedDevicesMap />} />
      <Route path="/admin/roles" element={<RolesManagement />} />
      <Route path="/admin/jobs" element={<JobTitlesManagement />} />
      <Route path="/admin/types" element={<EmergencyTypesManagement />} />
      <Route path="/admin/locations" element={<LocationsManagement />} />
      <Route path="/admin/reports" element={<CaseReports />} /> 
      <Route path="/admin/login-logs" element={<LoginLogs />} />
      <Route path="/admin/active-users" element={<ActiveUsersReport />} />
      <Route path="/admin/analytics" element={<AdvancedAnalytics />} /> 
      <Route path="/admin/simulator" element={<CrisisSimulator />} />
      <Route path="/admin/facility" element={<FacilityProfile />} />
      <Route path="/admin/presentation-assets" element={<PresentationAssets />} />
      <Route path="/admin/playback/:id" element={<IncidentPlayback />} />
      
      {/* حماية صارمة لمسار مفتاح API - لا يمكن لأي Admin عادي دخوله */}
      <Route path="/admin/api-key" element={<SuperAdminGuard><ApiSettings /></SuperAdminGuard>} />
      
      <Route path="/ai-reports" element={<AiReports />} />
      <Route path="/personal-report" element={<PersonalReport />} />
      <Route path="/mobile-app" element={<MobileAppDownload />} />
      <Route path="/mobile-diagnostics" element={<MobileDiagnostics />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
);

const App = () => (
    <AppProvider>
      <Router>
        <Layout><AppRoutes /></Layout>
      </Router>
    </AppProvider>
);

export default App;
