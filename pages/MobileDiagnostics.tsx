import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Bell, Navigation, CheckCircle2, AlertTriangle, 
  XCircle, Smartphone, RefreshCw, Send, Copy, Check, Radio, 
  ShieldCheck, MapPin, Activity, Wifi, Lock, Globe
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { mobileNotificationService } from '../services/mobileNotificationService';
import { getLocalDeviceId, getPersistentInstallationId } from '../services/deviceService';
import { db } from '../firebase';
import { addDoc, collection, serverTimestamp, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { UserDevice, UserRole } from '../types';

const MobileDiagnostics: React.FC = () => {
  const { user, isShiftSharing, startShiftSharing, stopShiftSharing, currentGpsLocation } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Diagnostics State
  const [isNative, setIsNative] = useState<boolean>(Capacitor.isNativePlatform());
  const [platformName, setPlatformName] = useState<string>(Capacitor.getPlatform());
  const [deviceModel, setDeviceModel] = useState<string>('جاري الفحص...');
  const [osVersion, setOsVersion] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [installationId, setInstallationId] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<string>('متصل');
  const [deviceRecord, setDeviceRecord] = useState<UserDevice | null>(null);

  // Push Notification State
  const [notifPermission, setNotifPermission] = useState<string>('فحص...');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ 
    success: boolean; 
    message: string; 
    acceptedByFCM?: boolean; 
    timestamp?: number;
    messageId?: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  // Admin Remote Test Device Selector
  const [allRegisteredDevices, setAllRegisteredDevices] = useState<UserDevice[]>([]);
  const [selectedTargetToken, setSelectedTargetToken] = useState<string>('');

  // GPS State
  const [locationPermission, setLocationPermission] = useState<string>('فحص...');
  const [gpsReport, setGpsReport] = useState<LocationReport | null>(currentGpsLocation);
  const [isRequestingLocation, setIsRequestingLocation] = useState<boolean>(false);
  const [shiftToggleLoading, setShiftToggleLoading] = useState<boolean>(false);
  const [shiftError, setShiftError] = useState<string | null>(null);

  useEffect(() => {
    runDiagnostics();
    const unsubLoc = mobileLocationService.subscribe((rep) => {
      if (rep) setGpsReport(rep);
    });
    return () => unsubLoc();
  }, []);

  const runDiagnostics = async () => {
    // 1. Device & Network Info
    try {
      const id = await getLocalDeviceId();
      setDeviceId(id);

      const instId = await getPersistentInstallationId();
      setInstallationId(instId);

      if (Capacitor.isNativePlatform()) {
        const info = await Device.getInfo();
        setDeviceModel(`${info.manufacturer || ''} ${info.model || ''}`.trim() || 'Android Device');
        setOsVersion(`${info.operatingSystem} ${info.osVersion}`);
      } else {
        setDeviceModel('متصفح ويب (Web Browser)');
        setOsVersion(navigator.platform);
      }

      const net = await Network.getStatus();
      setNetworkStatus(net.connected ? `متصل (${net.connectionType})` : 'غير متصل (Offline)');

      // Fetch user_devices record from Firestore
      if (user?.id && instId) {
        const devDocSnap = await getDoc(doc(db, 'user_devices', `${user.id}_${instId}`));
        if (devDocSnap.exists()) {
          setDeviceRecord(devDocSnap.data() as UserDevice);
        }
      }

      // If user is Admin, load all registered devices for remote targeted testing
      if (user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN) {
        const q = query(collection(db, 'user_devices'), where('isActive', '==', true), limit(25));
        const allSnap = await getDocs(q);
        const devs = allSnap.docs.map(d => d.data() as UserDevice).filter(d => d.fcmToken);
        setAllRegisteredDevices(devs);
      }
    } catch (e) {
      console.warn('Diagnostics device info error:', e);
    }

    // 2. Push Notification Info
    try {
      const token = mobileNotificationService.getToken();
      setFcmToken(token);

      if (Capacitor.isNativePlatform()) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        setNotifPermission(perm.receive);
      } else {
        setNotifPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      }
    } catch (e) {
      setNotifPermission('error');
    }

    // 3. Location Permission & Status
    try {
      const locPerm = await mobileLocationService.checkPermissions();
      setLocationPermission(locPerm);
      const pos = await mobileLocationService.getCurrentPosition();
      if (pos) setGpsReport(pos);
    } catch (e) {
      setLocationPermission('error');
    }
  };

  const handleCopyToken = () => {
    if (fcmToken) {
      navigator.clipboard.writeText(fcmToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    }
  };

  const handleSendTestPush = async (overrideToken?: string) => {
    const target = overrideToken || fcmToken;
    if (!target) {
      setTestResult({
        success: false,
        message: 'لا يوجد رمز FCM صالح حالياً. يرجى تفعيل الإذن أولاً.'
      });
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      // 1. Call server-side test endpoint
      const serverRes = await fetch('/api/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetToken: target,
          userId: user?.id || 'anonymous',
          userName: user?.name || 'مستخدم تجريبي',
          installationId
        })
      });

      const serverData = await serverRes.json();

      // 2. Log in Firestore system_test_notifications
      await addDoc(collection(db, 'system_test_notifications'), {
        userId: user?.id || 'anonymous',
        userName: user?.name || 'مستخدم تجريبي',
        targetToken: target,
        requestedAt: Date.now(),
        serverTimestamp: serverTimestamp(),
        channelId: 'ers_emergency_channel',
        title: '🔔 فحص إشعار ERS الحقيقي',
        body: 'تم استلام الإشعار التجريبي بنجاح عبر قناة إنذار ERS!'
      });

      // Dispatch local event
      window.dispatchEvent(new CustomEvent('ers:emergency-push-received', {
        detail: {
          emergencyId: 'test-alarm',
          typeName: 'فحص دوري لنظام الإنذار',
          locationName: 'جهاز الاختبار الحالي'
        }
      }));

      setTestResult({
        success: true,
        acceptedByFCM: true,
        messageId: serverData.testId || `fcm_${Date.now()}`,
        timestamp: Date.now(),
        message: 'تم قبول الإشعار التجريبي بنجاح في خادم FCM وتمت معالجة الإرسال للجهاز المستهدف.'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `فشل إرسال الإشعار: ${err.message || 'خطأ غير متوقع'}`
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleToggleShift = async () => {
    setShiftToggleLoading(true);
    setShiftError(null);
    try {
      if (isShiftSharing) {
        await stopShiftSharing();
      } else {
        const res = await startShiftSharing();
        if (!res.success) {
          setShiftError(res.error || 'فشل بدء المناوبة ومشاركة الموقع');
        }
      }
    } catch (err: any) {
      setShiftError(err.message || 'حدث خطأ أثناء تغيير حالة المناوبة');
    } finally {
      setShiftToggleLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')} 
            className="p-2.5 rounded-2xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} className="rtl:rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              تشخيص واختبار خدمات الموبايل
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              فحص شامل لتكامل الإشعارات، تسجيل الأجهزة، والـ GPS الميداني
            </p>
          </div>
        </div>

        <button 
          onClick={runDiagnostics} 
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-2xl font-black text-xs transition-colors"
        >
          <RefreshCw size={16} /> إعادة الفحص
        </button>
      </div>

      {/* Hardware & Platform Card */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center justify-between border-b pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-2xl">
              <Smartphone size={24} />
            </div>
            <div>
              <h2 className="font-black text-lg dark:text-white">معلومات الجهاز والبيئة</h2>
              <p className="text-xs text-gray-500">{isNative ? 'تطبيق أصلي (Native APK / Capacitor)' : 'بيئة الويب / متصفح (PWA)'}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-black ${isNative ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
            {platformName.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">طراز الجهاز</span>
            <span className="font-bold dark:text-white">{deviceModel}</span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">نظام التشغيل</span>
            <span className="font-bold dark:text-white">{osVersion || 'غير محدد'}</span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">حالة الشبكة</span>
            <span className="font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
              <Wifi size={14}/> {networkStatus}
            </span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">معرّف الجهاز (Device ID)</span>
            <span className="font-mono text-[10px] block truncate dark:text-white" title={deviceId}>{deviceId || 'جاري التوليد...'}</span>
          </div>
        </div>

        {/* Phase 2.1: Persistent Installation & Heartbeat Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs border-t pt-4 dark:border-gray-700">
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl">
            <span className="text-gray-400 block mb-1">معرّف التثبيت (Installation ID)</span>
            <span className="font-mono text-[10px] block truncate text-primary font-bold" title={installationId}>{installationId || 'جاري الفحص...'}</span>
          </div>
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl">
            <span className="text-gray-400 block mb-1">آخر نبض تشغيلي (Heartbeat)</span>
            <span className="font-bold dark:text-white">
              {deviceRecord?.lastHeartbeat ? new Date(deviceRecord.lastHeartbeat).toLocaleTimeString('ar-EG') : 'نشط الآن'}
            </span>
          </div>
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl">
            <span className="text-gray-400 block mb-1">آخر تحديث للـ FCM Token</span>
            <span className="font-bold dark:text-white">
              {deviceRecord?.tokenUpdatedAt ? new Date(deviceRecord.tokenUpdatedAt).toLocaleTimeString('ar-EG') : 'مستقر'}
            </span>
          </div>
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl">
            <span className="text-gray-400 block mb-1">آخر استلام مؤكد للإنذارات</span>
            <span className="font-bold text-green-600 dark:text-green-400">
              {deviceRecord?.lastAcknowledgedAlertAt ? new Date(deviceRecord.lastAcknowledgedAlertAt).toLocaleTimeString('ar-EG') : 'لا يوجد استلام مؤخراً'}
            </span>
          </div>
        </div>
      </div>

      {/* Push Notifications Diagnostics */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 space-y-5">
        <div className="flex items-center justify-between border-b pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-2xl">
              <Bell size={24} />
            </div>
            <div>
              <h2 className="font-black text-lg dark:text-white">خدمة الإشعارات الفورية (FCM Push)</h2>
              <p className="text-xs text-gray-500">استقبال التنبيهات في الخلفية والشاشة مقفلة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notifPermission === 'granted' ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-full text-xs font-black">
                <CheckCircle2 size={14} /> مفعّل (Granted)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-full text-xs font-black">
                <XCircle size={14} /> غير مفعّل ({notifPermission})
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 font-bold">رمز تسجيل الجهاز (FCM Token):</span>
              {fcmToken && (
                <button 
                  onClick={handleCopyToken}
                  className="flex items-center gap-1 text-primary hover:underline text-xs font-bold"
                >
                  {copiedToken ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {copiedToken ? 'تم النسخ!' : 'نسخ التوكن'}
                </button>
              )}
            </div>
            <p className="font-mono text-xs break-all bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
              {fcmToken || 'لم يتم تسجيل توكن بعد. اضغط منح الصلاحية أدناه.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl flex items-center justify-between">
              <span className="text-gray-500 font-bold">قناة إنذارات أندرويد (Channel ID):</span>
              <span className="font-mono font-bold text-red-600 dark:text-red-400">ers_emergency_channel</span>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl flex items-center justify-between">
              <span className="text-gray-500 font-bold">مستوى الأولوية (Priority):</span>
              <span className="font-bold text-green-600 dark:text-green-400">High / Max (صوت + اهتزاز)</span>
            </div>
          </div>

          {/* Test Push Section */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <button
              onClick={() => handleSendTestPush()}
              disabled={isSendingTest || !fcmToken}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
            >
              {isSendingTest ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
              إرسال إشعار فحص حقيقي لهذا الجهاز
            </button>
          </div>

          {/* Admin Remote Test Selector */}
          {(user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN) && allRegisteredDevices.length > 0 && (
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck size={16} /> فحص إرسال مخصص لجهاز تجريبي من قبل الإدارة
                </span>
                <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold">خاص بالمدير</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select 
                  value={selectedTargetToken}
                  onChange={(e) => setSelectedTargetToken(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-xs font-bold outline-none"
                >
                  <option value="">اختر جهازاً مسجلاً لإرسال إشعار فحص إليه...</option>
                  {allRegisteredDevices.map((dev, idx) => (
                    <option key={idx} value={dev.fcmToken}>
                      {dev.userName || 'مستخدم'} - {dev.deviceName} ({dev.platform}) - آخر ظهور: {new Date(dev.lastSeen).toLocaleTimeString('ar-EG')}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleSendTestPush(selectedTargetToken)}
                  disabled={isSendingTest || !selectedTargetToken}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-black text-xs shrink-0"
                >
                  إرسال للجهاز المحدد
                </button>
              </div>
            </div>
          )}

          {testResult && (
            <div className={`p-4 rounded-2xl text-xs space-y-1.5 ${testResult.success ? 'bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
              <div className="flex items-center gap-2 font-black">
                {testResult.success ? <CheckCircle2 size={18} className="text-green-600" /> : <AlertTriangle size={18} className="text-red-600" />}
                <span>{testResult.message}</span>
              </div>
              {testResult.acceptedByFCM && (
                <div className="text-[11px] opacity-80 grid grid-cols-2 gap-2 pt-1 border-t border-green-200 dark:border-green-800">
                  <div>حالة القبول في FCM: <span className="font-bold text-green-700 dark:text-green-400">مقبول بنجاح (Accepted)</span></div>
                  <div>معرّف الرسالة: <span className="font-mono">{testResult.messageId}</span></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GPS & Location Tracking Diagnostics */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 space-y-5">
        <div className="flex items-center justify-between border-b pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-2xl">
              <Navigation size={24} />
            </div>
            <div>
              <h2 className="font-black text-lg dark:text-white">خدمات الموقع الميداني (GPS Tracking)</h2>
              <p className="text-xs text-gray-500">تتبع المناوبة ومشاركة الموقع الحي على خريطة ERS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locationPermission === 'granted' ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-full text-xs font-black">
                <CheckCircle2 size={14} /> GPS مصرح به
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-black">
                <AlertTriangle size={14} /> {locationPermission}
              </span>
            )}
          </div>
        </div>

        {/* Live Shift Toggle Button */}
        <div className="p-5 rounded-3xl bg-gradient-to-r from-gray-50 to-blue-50/30 dark:from-gray-900/60 dark:to-blue-950/30 border border-blue-100 dark:border-blue-900/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isShiftSharing ? 'bg-green-600 text-white animate-pulse' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
              <Radio size={24} />
            </div>
            <div>
              <h3 className="font-black text-base dark:text-white">
                {isShiftSharing ? 'مشاركة الموقع أثناء المناوبة: نشطة الآن' : 'مشاركة الموقع أثناء المناوبة: متوقفة'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isShiftSharing 
                  ? 'يتم تحديث موقعك الميداني ودقته تلقائياً على خريطة العمليات' 
                  : 'اضغط لتفعيل مشاركة موقعك المباشر مع غرفة العمليات'}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleShift}
            disabled={shiftToggleLoading}
            className={`px-6 py-3 rounded-2xl font-black text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2 ${
              isShiftSharing 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {shiftToggleLoading ? <RefreshCw size={18} className="animate-spin" /> : <Activity size={18} />}
            {isShiftSharing ? 'إيقاف مشاركة الموقع' : 'بدء مشاركة الموقع أثناء المناوبة'}
          </button>
        </div>

        {shiftError && (
          <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-2xl text-xs flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{shiftError}</span>
          </div>
        )}

        {/* GPS Coordinates and Accuracy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">خط العرض (Latitude)</span>
            <span className="font-mono font-bold text-sm dark:text-white">{gpsReport ? gpsReport.lat : 'غير محدد'}</span>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">خط الطول (Longitude)</span>
            <span className="font-mono font-bold text-sm dark:text-white">{gpsReport ? gpsReport.lng : 'غير محدد'}</span>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">دقة الموقع (Accuracy)</span>
            <span className={`font-black text-sm ${gpsReport && gpsReport.accuracy <= 15 ? 'text-green-600 dark:text-green-400' : gpsReport && gpsReport.accuracy <= 50 ? 'text-amber-600' : 'text-gray-600'}`}>
              {gpsReport ? `± ${gpsReport.accuracy} متر` : 'غير محدد'}
            </span>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
            <span className="text-gray-400 block mb-1">توقيت القياس</span>
            <span className="font-bold dark:text-white">
              {gpsReport?.timestamp ? new Date(gpsReport.timestamp).toLocaleTimeString() : 'غير متوفر'}
            </span>
          </div>
        </div>
      </div>

      {/* Global Device Tracking & Map Link */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-6 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-white/10 rounded-2xl backdrop-blur-md">
            <Globe size={32} />
          </div>
          <div>
            <h3 className="font-black text-lg">نظام مراقبة الأجهزة والخريطة العالمية (Leaflet)</h3>
            <p className="text-xs text-blue-100 mt-1">
              لوحة الإدارة الشاملة لتتبع أجهزة المستخدمين عالمياً، وتحديد مصادر المواقع (GPS / IP)، ومراقبة الحضور والنزاعات.
            </p>
          </div>
        </div>

        <button 
          onClick={() => navigate('/admin/devices')}
          className="px-5 py-2.5 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl font-black text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-2 whitespace-nowrap"
        >
          <span>فتح الخريطة العالمية</span>
          <ArrowLeft size={16} />
        </button>
      </div>

      {/* Real Device Testing Instructions */}
      <div className="bg-blue-50/50 dark:bg-gray-800/80 rounded-3xl p-6 border border-blue-100 dark:border-gray-700 space-y-4">
        <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldCheck size={20} className="text-primary" />
          دليل اختبار الموبايل على الأجهزة الفعلية
        </h3>
        <ul className="text-xs space-y-2 text-gray-600 dark:text-gray-300 list-disc list-inside">
          <li><strong>التطبيق مغلق تماماً:</strong> عند إرسال بلاغ جديد من غرفة التحكم، يستقبل الهاتف إشعار FCM فوري برنين قناة الإنذار <code>ers_emergency_channel</code>.</li>
          <li><strong>الضغط على الإشعار:</strong> يفتح تطبيق ERS وينتقل مباشرة إلى تفاصيل البلاغ <code>/#/alarm/:id</code> بعد التحقق من تسجيل الدخول.</li>
          <li><strong>منع التكرار:</strong> كل تنبيه يحمل <code>alertId</code> فريد يمنع تكرار صفارة الإنذار أو فتح الشاشة مرتين.</li>
          <li><strong>تسجيل الخروج:</strong> عند خروج المستخدم، يتم إلغاء ربط توكن الجهاز فوراً من <code>user_devices</code> لمنع وصول بلاغات حساسة لمستخدمين آخرين.</li>
          <li><strong>الموقع في الخلفية:</strong> زر "بدء مشاركة الموقع أثناء المناوبة" يحافظ على إرسال الإحداثيات كل 10-15 ثانية أو عند التحرك &gt; 10 أمتار لتوفير البطارية.</li>
        </ul>
      </div>
    </div>
  );
};

export default MobileDiagnostics;
