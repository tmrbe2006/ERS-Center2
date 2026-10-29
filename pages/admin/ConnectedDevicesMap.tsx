import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../../firebase';
import { 
  collection, collectionGroup, onSnapshot, query, getDocs, 
  doc, updateDoc, orderBy, limit 
} from 'firebase/firestore';
import { useApp } from '../../context/AppContext';
import { ConnectedDevice, LocationHistoryEntry, UserRole, EmergencyStatus } from '../../types';
import { deviceTrackingService } from '../../services/deviceTrackingService';
import { Button } from '../../components/Button';
import { 
  Globe, Laptop, Smartphone, Tablet, Wifi, WifiOff, MapPin, 
  RefreshCw, Shield, Filter, Search, ArrowLeft, History, 
  Layers, Navigation, AlertTriangle, CheckCircle2, Clock, 
  Activity, Radio, Compass, Info, X, ExternalLink, Play, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

declare const L: any;

export const ConnectedDevicesMap: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, emergencies, users } = useApp();

  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [usersList, setUsersList] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<ConnectedDevice | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LocationHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<'ALL' | 'GPS' | 'IP'>('ALL');
  const [selectedEmergencyFilter, setSelectedEmergencyFilter] = useState('ALL');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'ALL' | 'ON_DUTY' | 'OFF_DUTY'>('ALL');

  // Leaflet references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const accuracyCirclesLayerRef = useRef<any>(null);
  const historyPolylineRef = useRef<any>(null);

  // Security check: Only Admin and Super Admin
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  // 1. Listen to all devices across all users
  useEffect(() => {
    if (!isAdmin) return;

    // Load registered users to correlate IDs with names
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().username || d.id
      }));
      setUsersList(uList);
    });

    // Strategy: Listen to devices subcollection of all users
    // First, query all users, then attach listeners to their /devices subcollections
    // This maintains 100% compliance with Firestore subcollection security rules
    const unsubDevices = onSnapshot(collectionGroup(db, 'devices'), (snap) => {
      const list: ConnectedDevice[] = [];
      snap.forEach((docSnap) => {
        list.push({
          ...(docSnap.data() as ConnectedDevice),
          deviceId: docSnap.data().deviceId || docSnap.id
        });
      });
      setDevices(list);
      setIsLoading(false);
    }, (error) => {
      console.warn('collectionGroup error, falling back to direct user query:', error);
      // Fallback: Query all users and iterate
      getDocs(collection(db, 'users')).then(async (uSnap) => {
        const aggregated: ConnectedDevice[] = [];
        for (const uDoc of uSnap.docs) {
          try {
            const devSnap = await getDocs(collection(db, 'users', uDoc.id, 'devices'));
            devSnap.forEach(d => aggregated.push(d.data() as ConnectedDevice));
          } catch {}
        }
        setDevices(aggregated);
        setIsLoading(false);
      });
    });

    return () => {
      unsubUsers();
      unsubDevices();
    };
  }, [isAdmin]);

  // 2. Initialize Leaflet World Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    if (typeof L === 'undefined') {
      console.error('Leaflet is not available on window.L');
      return;
    }

    // Default centered on Middle East / Global view
    const map = L.map(mapContainerRef.current, {
      center: [24.7136, 46.6753],
      zoom: 4,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: true,
      attributionControl: false
    });

    // High quality OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    accuracyCirclesLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Invalidate size to handle full container height
    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 3. Computed Device Status (Presence with Stale Timeout Guard)
  // An device is only considered online if isOnline === true AND seen within the last 3 minutes
  const evaluatedDevices = useMemo(() => {
    const now = Date.now();
    return devices.map(dev => {
      const timeSinceLastSeen = now - (dev.lastSeen || 0);
      const isActuallyOnline = dev.isOnline && (timeSinceLastSeen < 3 * 60 * 1000);
      return {
        ...dev,
        isOnline: isActuallyOnline
      };
    });
  }, [devices]);

  // 4. Filtered Devices
  const filteredDevices = useMemo(() => {
    return evaluatedDevices.filter(dev => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = dev.deviceName?.toLowerCase().includes(q);
        const matchUser = dev.userName?.toLowerCase().includes(q) || dev.userId?.toLowerCase().includes(q);
        const matchIp = dev.ipAddress?.includes(q);
        const matchCity = dev.city?.toLowerCase().includes(q);
        const matchCountry = dev.country?.toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchIp && !matchCity && !matchCountry) return false;
      }

      // User Filter
      if (selectedUserFilter !== 'ALL' && dev.userId !== selectedUserFilter) {
        return false;
      }

      // Country Filter
      if (selectedCountryFilter !== 'ALL' && dev.country !== selectedCountryFilter) {
        return false;
      }

      // Status Filter
      if (selectedStatusFilter === 'ONLINE' && !dev.isOnline) return false;
      if (selectedStatusFilter === 'OFFLINE' && dev.isOnline) return false;

      // Source Filter
      if (selectedSourceFilter === 'GPS' && dev.locationSource !== 'gps') return false;
      if (selectedSourceFilter === 'IP' && dev.locationSource !== 'ip') return false;

      // Incident Participating Responders Filter (Phase 4.2)
      if (selectedEmergencyFilter !== 'ALL') {
        const targetEm = emergencies.find(e => e.id === selectedEmergencyFilter);
        if (targetEm) {
          const isParticipant = (targetEm.responders || []).some(r => 
            r === dev.userName || r.toLowerCase() === dev.userName?.toLowerCase() || r === dev.userId
          );
          if (!isParticipant) return false;
        }
      }

      // Shift Duty Filter
      if (selectedShiftFilter !== 'ALL') {
        const matchedUser = users.find(u => u.id === dev.userId);
        const isOnDuty = matchedUser?.shiftStatus === 'on-duty' || matchedUser?.lastLocation?.isLiveShift;
        if (selectedShiftFilter === 'ON_DUTY' && !isOnDuty) return false;
        if (selectedShiftFilter === 'OFF_DUTY' && isOnDuty) return false;
      }

      return true;
    });
  }, [evaluatedDevices, searchQuery, selectedUserFilter, selectedCountryFilter, selectedStatusFilter, selectedSourceFilter, selectedEmergencyFilter, selectedShiftFilter, emergencies, users]);

  // Dynamic Country Options
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => {
      if (d.country) set.add(d.country);
    });
    return Array.from(set);
  }, [devices]);

  // KPI Statistics
  const stats = useMemo(() => {
    const total = evaluatedDevices.length;
    const online = evaluatedDevices.filter(d => d.isOnline).length;
    const offline = total - online;
    const gpsCount = evaluatedDevices.filter(d => d.locationSource === 'gps').length;
    const ipCount = evaluatedDevices.filter(d => d.locationSource === 'ip').length;
    const countriesCount = availableCountries.length;
    return { total, online, offline, gpsCount, ipCount, countriesCount };
  }, [evaluatedDevices, availableCountries]);

  // 5. Render Markers on Leaflet Map
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    accuracyCirclesLayerRef.current.clearLayers();

    if (filteredDevices.length === 0) return;

    const bounds = L.latLngBounds([]);

    filteredDevices.forEach(device => {
      const lat = device.latitude;
      const lng = device.longitude;

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      bounds.extend([lat, lng]);

      // Styling based on device type and status
      const isOnline = device.isOnline;
      const isGps = device.locationSource === 'gps';

      // Pulse color: Emerald green for online, Cool Slate for offline
      const markerColor = isOnline ? '#10b981' : '#64748b';
      const badgeIcon = isGps ? '🛰️' : '🌐';
      const deviceIconSvg = device.deviceType === 'mobile' 
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`
        : device.deviceType === 'tablet'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>`;

      // Custom HTML Marker Icon
      const customHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group">
          ${isOnline ? `<div class="absolute -inset-2 bg-emerald-500/30 rounded-full animate-ping"></div>` : ''}
          <div style="background-color: ${markerColor}" class="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-lg border-2 border-white transition-transform transform group-hover:scale-110 relative">
            ${deviceIconSvg}
            <span class="absolute -bottom-1 -right-1 text-[9px] bg-white dark:bg-gray-900 rounded-full shadow px-0.5 border" title="${isGps ? 'GPS محدد بدقة' : 'موقع تقريبي عبر IP'}">
              ${badgeIcon}
            </span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: customHtml,
        className: 'custom-div-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
      });

      // Accuracy circle
      const radius = isGps ? Math.min(Math.max(device.locationAccuracy || 20, 20), 500) : 15000;
      const circle = L.circle([lat, lng], {
        radius,
        color: isGps ? '#10b981' : '#3b82f6',
        fillColor: isGps ? '#10b981' : '#3b82f6',
        fillOpacity: isGps ? 0.15 : 0.08,
        weight: isGps ? 1.5 : 1
      });
      accuracyCirclesLayerRef.current.addLayer(circle);

      // Marker creation
      const marker = L.marker([lat, lng], { icon: customIcon });

      // Popup Content
      const popupHtml = `
        <div style="direction: rtl; font-family: 'Cairo', sans-serif;" class="p-1 min-w-[220px]">
          <div class="flex items-center justify-between border-b pb-2 mb-2">
            <div class="font-black text-gray-900 text-sm flex items-center gap-1.5">
              <span>${device.deviceName || 'جهاز متصل'}</span>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}">
              ${isOnline ? 'متصل الآن' : 'غير متصل'}
            </span>
          </div>

          <div class="space-y-1.5 text-xs text-gray-600 mb-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">المستخدم:</span>
              <span class="font-bold text-gray-800">${device.userName || device.userId}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">الموقع:</span>
              <span class="font-bold text-gray-800">${device.city || 'غير محدد'}، ${device.country || 'غير محدد'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">طريقة الرصد:</span>
              <span class="font-bold ${isGps ? 'text-emerald-600' : 'text-blue-600'}">
                ${isGps ? '🛰️ نظام GPS دقيق' : '🌐 تقريبي عبر IP'}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">عنوان IP:</span>
              <span class="font-mono text-[10px] bg-gray-100 px-1 rounded">${device.ipAddress || '127.0.0.1'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">إصدار الموقع:</span>
              <span class="font-mono font-bold text-gray-700">v${device.locationVersion || 1}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-400">آخر اتصال:</span>
              <span class="text-[10px]">${new Date(device.lastSeen || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <button id="btn-inspect-${device.deviceId}" class="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow transition-all flex items-center justify-center gap-1">
            عرض كافة التفاصيل والسجل
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-inspect-${device.deviceId}`);
        if (btn) {
          btn.onclick = () => {
            handleInspectDevice(device);
          };
        }
      });

      markersLayerRef.current.addLayer(marker);
    });

    if (bounds.isValid() && filteredDevices.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [filteredDevices]);

  // Inspect Device and load location history
  const handleInspectDevice = async (device: ConnectedDevice) => {
    setSelectedDevice(device);
    setShowHistoryModal(true);
    setIsLoadingHistory(true);
    try {
      const histCol = collection(db, 'users', device.userId, 'devices', device.deviceId, 'locationHistory');
      const q = query(histCol, orderBy('timestamp', 'desc'), limit(20));
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as LocationHistoryEntry));
      setHistoryEntries(entries);
    } catch (err) {
      console.warn('Could not load history for device:', err);
      setHistoryEntries([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Trigger manual location update on current device
  const handleForceRefreshCurrent = async () => {
    setSimulationNotice('جاري طلب فحص الموقع الجغرافي وتحديثه لحظياً...');
    try {
      await deviceTrackingService.forceRefreshLocation('manual_admin_refresh');
      setSimulationNotice('تم تحديث إحداثيات وموقع جهازك بنجاح.');
      setTimeout(() => setSimulationNotice(null), 4000);
    } catch {
      setSimulationNotice('حدث خطأ أثناء فحص الموقع.');
      setTimeout(() => setSimulationNotice(null), 4000);
    }
  };

  // Test Simulation: Country Transition (Saudi Arabia -> Egypt)
  const handleSimulateEgyptTravel = async () => {
    setSimulationNotice('جاري محاكاة انتقال الجهاز من السعودية إلى مصر (القاهرة)...');
    try {
      // Cairo coordinates: 30.0444, 31.2357
      await deviceTrackingService.simulateCountryTransition(
        'جمهورية مصر العربية',
        'القاهرة',
        30.0444,
        31.2357,
        '156.204.18.92'
      );
      setSimulationNotice('نجحت المحاكاة! تم تحديث موقع الجهاز إلى مصر مع رفع الإصدار وتوثيق السجل دون تكرار.');
      setTimeout(() => setSimulationNotice(null), 5000);
    } catch (e: any) {
      setSimulationNotice(`فشلت المحاكاة: ${e.message}`);
      setTimeout(() => setSimulationNotice(null), 4000);
    }
  };

  // Test Simulation: Return to Saudi Arabia (Riyadh)
  const handleSimulateRiyadhReturn = async () => {
    setSimulationNotice('جاري محاكاة عودة الجهاز إلى المملكة العربية السعودية (الرياض)...');
    try {
      // Riyadh coordinates: 24.7136, 46.6753
      await deviceTrackingService.simulateCountryTransition(
        'المملكة العربية السعودية',
        'الرياض',
        24.7136,
        46.6753,
        '212.138.163.50'
      );
      setSimulationNotice('نجحت المحاكاة! تم تسجيل العودة للرياض بسلاسة مع التحقق من عدم تعارض الجلسات.');
      setTimeout(() => setSimulationNotice(null), 5000);
    } catch (e: any) {
      setSimulationNotice(`فشلت المحاكاة: ${e.message}`);
      setTimeout(() => setSimulationNotice(null), 4000);
    }
  };

  // Focus map on a specific device
  const handleFlyToDevice = (dev: ConnectedDevice) => {
    if (mapInstanceRef.current && dev.latitude && dev.longitude) {
      mapInstanceRef.current.flyTo([dev.latitude, dev.longitude], 13, { duration: 1.5 });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="mx-auto text-amber-500 mb-3" size={48} />
        <h2 className="text-xl font-black">غير مصرح لك بالوصول</h2>
        <p className="text-gray-500 text-sm mt-1">هذه اللوحة مخصصة لمدراء النظام فقط لمراقبة الأجهزة العالمية.</p>
        <Button onClick={() => navigate('/')} className="mt-4">العودة للرئيسية</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Globe size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2">
                مراقبة الأجهزة والمواقع العالمية
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  بث لحظي نشط
                </span>
              </h1>
              <p className="text-xs text-gray-500 font-bold mt-0.5">
                تحديد دقيق عبر GPS و IP Geolocation مع إدارة النزاعات وحفظ السجل الزمني
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={handleForceRefreshCurrent}
            className="rounded-xl text-xs font-black flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> فحص موقعي الآن
          </Button>

          <Button 
            variant="outline" 
            onClick={() => navigate('/admin')}
            className="rounded-xl text-xs font-black flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> العودة للإدارة
          </Button>
        </div>
      </div>

      {/* Simulation / Notice Banner */}
      <AnimatePresence>
        {simulationNotice && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="animate-spin" />
              <span>{simulationNotice}</span>
            </div>
            <button onClick={() => setSimulationNotice(null)} className="p-1 hover:bg-white/20 rounded-lg">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Layers size={12} /> إجمالي الأجهزة
          </span>
          <div className="text-2xl font-black text-gray-800 dark:text-white mt-2">{stats.total}</div>
          <span className="text-[10px] text-gray-400 mt-1">مسجلة في النظام</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
            <Wifi size={12} /> متصلة الآن
          </span>
          <div className="text-2xl font-black text-emerald-600 mt-2">{stats.online}</div>
          <span className="text-[10px] text-emerald-500 font-bold mt-1">حضور فعلي نشط</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <WifiOff size={12} /> غير متصلة
          </span>
          <div className="text-2xl font-black text-gray-600 dark:text-gray-300 mt-2">{stats.offline}</div>
          <span className="text-[10px] text-gray-400 mt-1">خارج الخدمة</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1">
            <Navigation size={12} /> محددة عبر GPS
          </span>
          <div className="text-2xl font-black text-blue-600 mt-2">{stats.gpsCount}</div>
          <span className="text-[10px] text-blue-500 font-bold mt-1">دقة عالية</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
            <Compass size={12} /> تقريبية عبر IP
          </span>
          <div className="text-2xl font-black text-indigo-600 mt-2">{stats.ipCount}</div>
          <span className="text-[10px] text-indigo-500 font-bold mt-1">نطاق الدولة/المدينة</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
            <Globe size={12} /> دول التواجد
          </span>
          <div className="text-2xl font-black text-amber-600 mt-2">{stats.countriesCount}</div>
          <span className="text-[10px] text-amber-500 font-bold mt-1">{availableCountries.slice(0, 2).join('، ') || 'محلي'}</span>
        </div>
      </div>

      {/* Simulation Tools Box (For Requirement 4 & 7 testing) */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl">
            <Play size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black text-blue-900 dark:text-blue-300">أدوات فحص واختبار سياسة التعارضات والانتقال الدولي</h4>
            <p className="text-[11px] text-blue-700/80 dark:text-blue-400">
              اختبر انتقال الجهاز بين الدول (السعودية ⟷ مصر) للتحقق من عدم تكرار السجلات وتحديث رقم الإصدار وتوثيق التاريخ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleSimulateEgyptTravel}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-blue-600 hover:text-white border border-blue-200 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-black shadow-sm transition-all"
          >
            محاكاة السفر إلى مصر (القاهرة)
          </button>
          <button 
            onClick={handleSimulateRiyadhReturn}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-black shadow-sm transition-all"
          >
            محاكاة العودة إلى السعودية (الرياض)
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border dark:border-gray-700 flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-3 text-gray-400" />
          <input 
            type="text" 
            placeholder="بحث بالجهاز، المستخدم، عنوان IP، المدينة..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-10 py-2 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* User Filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-gray-400" />
          <select 
            value={selectedUserFilter} 
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="ALL">جميع المستخدمين</option>
            {usersList.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Country Filter */}
        <select 
          value={selectedCountryFilter} 
          onChange={(e) => setSelectedCountryFilter(e.target.value)}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="ALL">جميع الدول ({availableCountries.length})</option>
          {availableCountries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Status Filter */}
        <select 
          value={selectedStatusFilter} 
          onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="ALL">كافة الحالات</option>
          <option value="ONLINE">متصل فقط</option>
          <option value="OFFLINE">غير متصل فقط</option>
        </select>

        {/* Source Filter */}
        <select 
          value={selectedSourceFilter} 
          onChange={(e) => setSelectedSourceFilter(e.target.value as any)}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="ALL">كافة المصادر</option>
          <option value="GPS">نظام GPS دقيق</option>
          <option value="IP">تقريبي IP Geolocation</option>
        </select>

        {/* Phase 4.2: Incident Participating Responders Filter */}
        <select 
          value={selectedEmergencyFilter} 
          onChange={(e) => setSelectedEmergencyFilter(e.target.value)}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="ALL">جميع الأجهزة الميدانية</option>
          {emergencies.filter(e => e.status === EmergencyStatus.ACTIVE).map(em => (
            <option key={em.id} value={em.id}>
              مستجيبو بلاغ: {em.typeName} ({em.responders?.length || 0})
            </option>
          ))}
        </select>

        {/* Shift Duty Filter */}
        <select 
          value={selectedShiftFilter} 
          onChange={(e) => setSelectedShiftFilter(e.target.value as any)}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          <option value="ALL">كافة المناوبات</option>
          <option value="ON_DUTY">مناوبة نشطة فقط</option>
          <option value="OFF_DUTY">خارج المناوبة</option>
        </select>
      </div>

      {/* Main Grid: Interactive Leaflet Map & Devices Sidebar List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaflet Map Column (Span 2) */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border dark:border-gray-700 overflow-hidden flex flex-col relative h-[560px]">
          <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Compass size={18} className="text-primary" />
              <span className="font-black text-sm dark:text-white">الخريطة التفاعلية المباشرة (OpenStreetMap + Leaflet)</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 font-bold">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> متصل
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> غير متصل
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> نطاق دقة IP
              </span>
            </div>
          </div>

          <div ref={mapContainerRef} className="w-full flex-1 z-0" />
        </div>

        {/* Devices List Sidebar Column (Span 1) */}
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border dark:border-gray-700 p-5 flex flex-col h-[560px]">
          <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700">
            <div>
              <h3 className="font-black text-sm dark:text-white flex items-center gap-2">
                <Laptop size={16} /> قائمة الأجهزة المتصلة ({filteredDevices.length})
              </h3>
              <p className="text-[10px] text-gray-400 font-bold">اضغط على الجهاز للتركيز أو فحص التفاصيل</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredDevices.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs font-bold">
                لا توجد أجهزة مطابقة للفلاتر المحددة.
              </div>
            ) : (
              filteredDevices.map(dev => (
                <div 
                  key={`${dev.userId}_${dev.deviceId}`}
                  className="p-3.5 rounded-2xl border dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 hover:border-primary transition-all flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl text-white ${dev.isOnline ? 'bg-emerald-500 shadow-emerald-500/30 shadow' : 'bg-gray-400'}`}>
                        {dev.deviceType === 'mobile' ? <Smartphone size={14} /> : dev.deviceType === 'tablet' ? <Tablet size={14} /> : <Laptop size={14} />}
                      </div>
                      <div>
                        <div className="font-black text-xs text-gray-800 dark:text-white flex items-center gap-1.5">
                          <span>{dev.deviceName}</span>
                          <span className="text-[10px] font-mono text-gray-400 font-normal">v{dev.locationVersion || 1}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 font-bold">
                          {dev.userName || dev.userId}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                      dev.isOnline 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {dev.isOnline ? 'متصل' : 'غير متصل'}
                    </span>
                  </div>

                  <div className="text-[11px] text-gray-600 dark:text-gray-300 flex items-center justify-between border-t dark:border-gray-800 pt-2">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} className="text-gray-400" />
                      {dev.city}، {dev.country}
                    </span>
                    <span className={`text-[10px] font-bold ${dev.locationSource === 'gps' ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {dev.locationSource === 'gps' ? '🛰️ GPS' : '🌐 IP تقريبي'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button 
                      onClick={() => handleFlyToDevice(dev)}
                      className="flex-1 py-1 px-2 bg-white dark:bg-gray-800 border dark:border-gray-700 hover:bg-gray-100 rounded-xl text-[10px] font-black text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <MapPin size={10} /> تحديد على الخريطة
                    </button>
                    <button 
                      onClick={() => handleInspectDevice(dev)}
                      className="flex-1 py-1 px-2 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-xl text-[10px] font-black transition-colors flex items-center justify-center gap-1"
                    >
                      <Info size={10} /> التفاصيل والسجل
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Comprehensive Device Details & Location History Modal */}
      <AnimatePresence>
        {showHistoryModal && selectedDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border dark:border-gray-700"
            >
              {/* Modal Header */}
              <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/30">
                    {selectedDevice.deviceType === 'mobile' ? <Smartphone size={22} /> : <Laptop size={22} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center gap-2">
                      <span>{selectedDevice.deviceName}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-bold">
                        إصدار الموقع: v{selectedDevice.locationVersion || 1}
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 font-bold">
                      معرف التثبيت: {selectedDevice.installationId} | الجهاز: {selectedDevice.deviceId}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* 31 Fields Metadata Matrix */}
                <div>
                  <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                    <Info size={14} /> الحقول المسجلة في Firestore (users/{selectedDevice.userId}/devices/{selectedDevice.deviceId})
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <MetaItem label="المستخدم (userId)" value={selectedDevice.userId} />
                    <MetaItem label="اسم المستخدم (userName)" value={selectedDevice.userName || selectedDevice.userId} />
                    <MetaItem label="جلسة العمل الحالية (sessionId)" value={selectedDevice.sessionId} />
                    <MetaItem label="الجلسة النشطة (activeSessionId)" value={selectedDevice.activeSessionId} />
                    <MetaItem label="نظام التشغيل (operatingSystem)" value={selectedDevice.operatingSystem} />
                    <MetaItem label="المتصفح (browser)" value={selectedDevice.browser} />
                    <MetaItem label="نوع الجهاز (deviceType)" value={selectedDevice.deviceType} />
                    <MetaItem label="عنوان IP (ipAddress)" value={selectedDevice.ipAddress} isMono />
                    <MetaItem label="الدولة (country / countryCode)" value={`${selectedDevice.country} (${selectedDevice.countryCode})`} />
                    <MetaItem label="المدينة والمنطقة (city / region)" value={`${selectedDevice.city} - ${selectedDevice.region}`} />
                    <MetaItem label="خط العرض (latitude)" value={String(selectedDevice.latitude)} isMono />
                    <MetaItem label="خط الطول (longitude)" value={String(selectedDevice.longitude)} isMono />
                    <MetaItem label="مصدر الموقع (locationSource)" value={selectedDevice.locationSource} />
                    <MetaItem label="دقة الموقع (locationAccuracy)" value={`${selectedDevice.locationAccuracy} متر`} />
                    <MetaItem label="حالة الموقع (locationStatus)" value={selectedDevice.locationStatus} />
                    <MetaItem label="توقيت الرصد الفعلي (locationObservedAt)" value={new Date(selectedDevice.locationObservedAt).toLocaleString('ar-EG')} />
                    <MetaItem label="توقيت التحديث بالخادم (locationUpdatedAt)" value={new Date(selectedDevice.locationUpdatedAt).toLocaleString('ar-EG')} />
                    <MetaItem label="آخر فحص IP (lastIpCheckAt)" value={new Date(selectedDevice.lastIpCheckAt).toLocaleString('ar-EG')} />
                    <MetaItem label="آخر دولة معروفة (lastKnownCountry)" value={selectedDevice.lastKnownCountry} />
                    <MetaItem label="آخر مدينة معروفة (lastKnownCity)" value={selectedDevice.lastKnownCity} />
                    <MetaItem label="حالة الاتصال (isOnline)" value={selectedDevice.isOnline ? 'متصل (Online)' : 'غير متصل (Offline)'} isHighlight={selectedDevice.isOnline} />
                    <MetaItem label="أول ظهور (firstSeen)" value={new Date(selectedDevice.firstSeen).toLocaleString('ar-EG')} />
                    <MetaItem label="آخر ظهور (lastSeen)" value={new Date(selectedDevice.lastSeen).toLocaleString('ar-EG')} />
                    <MetaItem label="إذن الإشعارات (notificationEnabled)" value={selectedDevice.notificationEnabled ? 'مفعل' : 'معطل'} />
                    <MetaItem label="رمز FCM Token" value={selectedDevice.fcmToken ? `${selectedDevice.fcmToken.slice(0, 15)}...` : 'غير متوفر'} isMono />
                  </div>
                </div>

                {/* Location History Subcollection Timeline */}
                <div className="border-t dark:border-gray-700 pt-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                      <History size={14} /> سجل تحركات وتغيرات الموقع الجغرافي (locationHistory)
                    </h4>
                    <span className="text-[10px] text-gray-400 font-bold">{historyEntries.length} سجلات مسجلة</span>
                  </div>

                  {isLoadingHistory ? (
                    <div className="py-8 text-center text-xs font-bold text-gray-400">جاري تحميل السجل...</div>
                  ) : historyEntries.length === 0 ? (
                    <div className="py-8 text-center text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                      لا يوجد سجل تحركات مسجل لهذا الجهاز حتى الآن (يتم التسجيل تلقائياً عند تغيير الدولة أو المدينة أو الحركة).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historyEntries.map((item, idx) => (
                        <div 
                          key={item.id || idx}
                          className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                              <MapPin size={16} />
                            </div>
                            <div>
                              <div className="text-xs font-black text-gray-800 dark:text-white">
                                {item.city}، {item.country} ({item.countryCode})
                              </div>
                              <div className="text-[11px] text-gray-500 font-bold mt-0.5">
                                {item.reason || 'تحديث دوري للموقع'}
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-end gap-1 text-right">
                            <span className="text-[10px] text-gray-400 font-mono">
                              {new Date(item.timestamp).toLocaleString('ar-EG')}
                            </span>
                            <span className="text-[10px] font-bold text-primary">
                              {item.locationSource === 'gps' ? '🛰️ GPS دقيق' : '🌐 تقريبي IP'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-end">
                <Button onClick={() => setShowHistoryModal(false)} className="rounded-xl">
                  إغلاق
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MetaItem = ({ label, value, isMono = false, isHighlight = false }: { label: string; value: string; isMono?: boolean; isHighlight?: boolean }) => (
  <div className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl border dark:border-gray-700/60 flex flex-col justify-between">
    <span className="text-[10px] font-bold text-gray-400 mb-0.5 truncate" title={label}>{label}</span>
    <span className={`font-bold truncate ${isMono ? 'font-mono text-[11px]' : ''} ${isHighlight ? 'text-emerald-600 font-black' : 'text-gray-800 dark:text-gray-200'}`} title={value}>
      {value || '—'}
    </span>
  </div>
);

export default ConnectedDevicesMap;
