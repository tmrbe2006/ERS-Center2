
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, UserRole, Settings, Emergency, EmergencyStatus, AppLinks } from '../types';
import { db, auth } from '../firebase';
import { 
  collection, onSnapshot, addDoc, updateDoc, setDoc, doc, getDoc, 
  arrayUnion, query, orderBy, serverTimestamp, where, limit, 
  enableNetwork, disableNetwork 
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { mobileNotificationService } from '../services/mobileNotificationService';
import { mobileLocationService, LocationReport } from '../services/mobileLocationService';
import { unregisterDeviceOnLogout } from '../services/deviceService';
import { deviceTrackingService } from '../services/deviceTrackingService';
import { auditService } from '../services/auditService';
import { emergencyWorkflowService } from '../services/emergencyWorkflowService';
import { escalationService } from '../services/escalationService';
import { EscalationConfig, AcknowledgmentStage } from '../types';

interface AppContextType {
  user: User | null;
  users: User[];
  login: (username: string, role: UserRole, password?: string, initialCoords?: {lat: number, lng: number}, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  emergencies: Emergency[];
  activeEmergencies: Emergency[];
  createEmergency: (data: Partial<Emergency>) => Promise<string>;
  acknowledgeEmergency: (id: string, notes?: string) => Promise<{ success: boolean; stage: AcknowledgmentStage; message?: string }>;
  respondToEmergency: (id: string, action: string) => Promise<void>;
  markOnScene: (id: string) => Promise<void>;
  dismissEmergency: (id: string) => Promise<void>;
  closeEmergency: (id: string, reason?: string, overrideReason?: string) => Promise<{ success: boolean; message?: string }>;
  updateEmergencyReport: (id: string, report: string) => Promise<void>;
  appLinks: AppLinks;
  updateAppLinks: (links: AppLinks) => Promise<void>;
  geminiApiKey: string;
  geminiApiKeySecondary: string;
  updateGeminiApiKeys: (primary: string, secondary: string) => Promise<void>;
  escalationConfig: EscalationConfig;
  updateEscalationConfig: (cfg: Partial<EscalationConfig>) => Promise<void>;
  unlockAudio: () => void;
  stopAllAlerts: () => void;
  playGlobalSiren: () => void;
  logAdminAction: (type: string, details: string) => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  isFirebaseReady: boolean;
  isOfflineMode: boolean;
  isAudioUnlocked: boolean;
  isSyncing: boolean;
  // Mobile Shift Location & GPS
  isShiftSharing: boolean;
  startShiftSharing: () => Promise<{ success: boolean; error?: string }>;
  stopShiftSharing: () => Promise<void>;
  currentGpsLocation: LocationReport | null;
}

const themeColors: Record<string, string> = {
  blue: '#1976d2', red: '#dc004e', green: '#10b981', purple: '#7c3aed',
  indigo: '#6366f1', orange: '#f59e0b', teal: '#14b8a6', pink: '#ec4899', amber: '#d97706',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('esr_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('esr_settings');
    return saved ? JSON.parse(saved) : { darkMode: false, language: 'ar', themeColor: 'blue', doNotDisturb: { enabled: false, start: "22:00", end: "07:00" }, translationLanguage: 'English', muteSiren: false };
  });
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [appLinks, setAppLinks] = useState<AppLinks>({ androidUrl: '', iosUrl: '' });
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiApiKeySecondary, setGeminiApiKeySecondary] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const [isShiftSharing, setIsShiftSharing] = useState<boolean>(() => mobileLocationService.isShiftActive());
  const [currentGpsLocation, setCurrentGpsLocation] = useState<LocationReport | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sirenRef = useRef<any>(null);
  const settingsRef = useRef(settings);
  const userRef = useRef(user); 
  const [activeEmergencies, setActiveEmergencies] = useState<Emergency[]>([]);

  // Mobile Push & Native Setup & Global Device Tracking
  useEffect(() => {
    mobileNotificationService.initialize();
    deviceTrackingService.initialize();

    if (user) {
      mobileNotificationService.setCurrentUser(user);
      mobileLocationService.setCurrentUser(user);
      deviceTrackingService.setCurrentUser(user);
    }

    const unsubLoc = mobileLocationService.subscribe((report) => {
      setCurrentGpsLocation(report);
      setIsShiftSharing(mobileLocationService.isShiftActive());
    });

    const handlePushReceived = (e: any) => {
      if (!settingsRef.current.muteSiren) {
        playGlobalSiren();
      }
    };
    window.addEventListener('ers:emergency-push-received', handlePushReceived);

    return () => {
      unsubLoc();
      window.removeEventListener('ers:emergency-push-received', handlePushReceived);
    };
  }, []);

  useEffect(() => {
    mobileNotificationService.setCurrentUser(user);
    mobileLocationService.setCurrentUser(user);
    deviceTrackingService.setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    settingsRef.current = settings;
    const color = themeColors[settings.themeColor] || themeColors.blue;
    document.documentElement.style.setProperty('--color-primary', color);
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('esr_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const unlockAudio = () => {
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => setIsAudioUnlocked(true));
    } else { setIsAudioUnlocked(true); }
  };

  const playGlobalSiren = () => {
    if (sirenRef.current || settingsRef.current.muteSiren) return;
    const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth'; osc2.type = 'square';
    const sweep = () => {
        const now = ctx.currentTime;
        osc1.frequency.setValueAtTime(1000, now); osc1.frequency.exponentialRampToValueAtTime(2500, now + 0.2);
        osc2.frequency.setValueAtTime(800, now); osc2.frequency.exponentialRampToValueAtTime(2000, now + 0.2);
    };
    sweep();
    const interval = setInterval(sweep, 450);
    gain.gain.value = 0.5; osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(); osc2.start();
    sirenRef.current = { osc1, osc2, interval };
  };

  const stopAllAlerts = () => {
    if (sirenRef.current) {
        sirenRef.current.osc1.stop(); sirenRef.current.osc2.stop();
        clearInterval(sirenRef.current.interval);
        sirenRef.current = null;
    }
  };

  useEffect(() => {
    if (!isFirebaseReady || !auth.currentUser) return;
    const unsubActive = onSnapshot(query(collection(db, 'emergencies'), where('status', '==', EmergencyStatus.ACTIVE)), (snap) => {
      const activeList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergency));
      setActiveEmergencies(activeList);
      const currentUser = userRef.current;
      const needsAlert = activeList.filter(e => !e.responders?.includes(currentUser?.name || '') && !e.dismissedBy?.includes(currentUser?.id || ''));
      if (needsAlert.length > 0 && !settingsRef.current.muteSiren) playGlobalSiren();
      else stopAllAlerts();
    });
    const unsubConfig = onSnapshot(doc(db, 'system', 'config'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.appLinks) setAppLinks(data.appLinks);
            if (data.geminiApiKey) setGeminiApiKey(data.geminiApiKey);
            if (data.geminiApiKeySecondary) setGeminiApiKeySecondary(data.geminiApiKeySecondary);
        }
    });
    const unsubAll = onSnapshot(query(collection(db, 'emergencies'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
      setEmergencies(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergency)));
    });
    const unsubU = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({id: d.id, ...d.data()} as User)));
    });
    return () => { unsubConfig(); unsubActive(); unsubAll(); unsubU(); stopAllAlerts(); };
  }, [isFirebaseReady]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
      if (u) setIsFirebaseReady(true);
      else signInAnonymously(auth);
    });
    return () => unsubscribe();
  }, []);

  const login = async (username: string, requestedRole: UserRole, password?: string, initialCoords?: {lat: number, lng: number}) => {
    const id = username.toLowerCase().replace(/\s+/g, '-');
    const userDocRef = doc(db, 'users', id);
    const userSnap = await getDoc(userDocRef);
    let finalUserData: any;
    if (userSnap.exists()) {
        const dbData = userSnap.data() as User;
        finalUserData = { ...dbData, status: 'online', lastLogin: Date.now(), lastHeartbeat: Date.now() };
        await updateDoc(userDocRef, { status: 'online', lastLogin: Date.now(), lastHeartbeat: Date.now() });
    } else {
        finalUserData = { id, name: username, username, role: requestedRole, status: 'online', lastLogin: Date.now(), lastHeartbeat: Date.now(), lastLocation: initialCoords || { lat: 0, lng: 0, timestamp: Date.now() } };
        await setDoc(userDocRef, finalUserData);
    }
    setUser(finalUserData as User);
    localStorage.setItem('esr_user', JSON.stringify(finalUserData));
    mobileNotificationService.setCurrentUser(finalUserData as User);
    mobileLocationService.setCurrentUser(finalUserData as User);
    deviceTrackingService.setCurrentUser(finalUserData as User);
  };

  const logout = async () => { 
    if (user) {
      await unregisterDeviceOnLogout(user.id);
      await deviceTrackingService.markDeviceOfflineOnLogout(user.id);
      await mobileLocationService.stopShiftSharing();
      updateDoc(doc(db, 'users', user.id), { status: 'offline' });
    }
    mobileNotificationService.setCurrentUser(null);
    mobileLocationService.setCurrentUser(null);
    deviceTrackingService.setCurrentUser(null);
    setUser(null); 
    localStorage.removeItem('esr_user'); 
    stopAllAlerts(); 
  };

  const [escalationConfig, setEscalationConfig] = useState<EscalationConfig>(() => escalationService.getConfig());

  // Automatic Escalation Engine Loop (Phase 2.4)
  useEffect(() => {
    if (!isFirebaseReady) return;

    // Load initial config
    escalationService.loadConfig().then(cfg => setEscalationConfig(cfg));

    const interval = setInterval(() => {
      escalationService.checkAndEscalateEmergencies();
    }, 12000); // Check every 12 seconds

    return () => clearInterval(interval);
  }, [isFirebaseReady]);

  const startShiftSharing = async () => {
    const res = await mobileLocationService.startShiftSharing();
    if (res.success) {
      setIsShiftSharing(true);
    }
    return res;
  };

  const stopShiftSharing = async () => {
    await mobileLocationService.stopShiftSharing();
    setIsShiftSharing(false);
  };
  
  const createEmergency = async (data: Partial<Emergency>) => {
    const now = Date.now();
    const severity = data.severity || 'High';
    const slaTargetMinutes = severity === 'High' ? 3 : severity === 'Medium' ? 5 : 8;

    const payload: Partial<Emergency> = {
      ...data,
      createdBy: user?.id,
      creatorName: user?.name,
      createdAt: now,
      status: EmergencyStatus.ACTIVE,
      severity,
      slaTargetMinutes,
      dispatchedAt: now,
      escalationLevel: 0,
      escalationStatus: 'pending',
      responders: []
    };

    const docRef = await addDoc(collection(db, 'emergencies'), payload);

    // Audit creation event
    await auditService.logEvent({
      eventType: 'EMERGENCY_CREATED',
      emergencyId: docRef.id,
      actorUserId: user?.id || 'anonymous',
      actorName: user?.name || user?.username,
      actorRole: user?.role || 'user',
      actionDetails: `إنشاء بلاغ طوارئ جديد (${data.typeName || 'طوارئ'}) بموقع (${data.locationName || 'غير محدد'}) بدرجة خطورة (${severity})`,
      source: 'web'
    });

    return docRef.id;
  };

  const acknowledgeEmergency = async (id: string, notes?: string) => {
    if (!user) return { success: false, stage: 'CREATED' as AcknowledgmentStage, message: 'المستخدم غير مسجل' };
    const coords = currentGpsLocation ? { 
      lat: currentGpsLocation.latitude, 
      lng: currentGpsLocation.longitude, 
      accuracy: currentGpsLocation.accuracy 
    } : undefined;
    return await emergencyWorkflowService.acknowledgeEmergency(id, user, notes, coords);
  };
  
  const respondToEmergency = async (id: string, action: string) => {
    if (!user) return;
    stopAllAlerts(); 
    mobileLocationService.setAssignedEmergency(id);
    const coords = currentGpsLocation ? { 
      lat: currentGpsLocation.latitude, 
      lng: currentGpsLocation.longitude, 
      accuracy: currentGpsLocation.accuracy 
    } : undefined;
    await emergencyWorkflowService.startResponding(id, user, action, coords);
  };

  const markOnScene = async (id: string) => {
    if (!user) return;
    const coords = currentGpsLocation ? { 
      lat: currentGpsLocation.latitude, 
      lng: currentGpsLocation.longitude, 
      accuracy: currentGpsLocation.accuracy 
    } : undefined;
    await emergencyWorkflowService.markOnScene(id, user, coords);
  };

  const dismissEmergency = async (id: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'emergencies', id), { dismissedBy: arrayUnion(user.id) });
  };

  const closeEmergency = async (id: string, reason?: string, overrideReason?: string) => { 
    stopAllAlerts(); 
    mobileLocationService.setAssignedEmergency(null);
    if (!user) return { success: false, message: 'غير مسجل دخول' };
    return await emergencyWorkflowService.closeEmergencySecure(id, user, reason, overrideReason);
  };

  const updateEscalationConfig = async (cfg: Partial<EscalationConfig>) => {
    await escalationService.updateConfig(cfg);
    setEscalationConfig(escalationService.getConfig());
  };

  const updateEmergencyReport = async (id: string, report: string) => { await updateDoc(doc(db, 'emergencies', id), { aiReport: report }); };
  const updateAppLinks = async (links: AppLinks) => { await setDoc(doc(db, 'system', 'config'), { appLinks: links }, { merge: true }); };
  const updateGeminiApiKeys = async (primary: string, secondary: string) => { await setDoc(doc(db, 'system', 'config'), { geminiApiKey: primary, geminiApiKeySecondary: secondary }, { merge: true }); };
  const logAdminAction = async (type: string, details: string) => { if (user) await addDoc(collection(db, 'admin_logs'), { userId: user.id, userName: user.name, actionType: type, details, timestamp: Date.now() }); };
  const updateProfile = async (data: any) => { if (user) { await updateDoc(doc(db, 'users', user.id), data); const updated = { ...user, ...data }; setUser(updated); localStorage.setItem('esr_user', JSON.stringify(updated)); } };
  
  return (
    <AppContext.Provider value={{ 
      user, users, login, logout, settings, updateSettings: (s) => setSettings(p => ({...p, ...s})), 
      emergencies, activeEmergencies, createEmergency, acknowledgeEmergency, respondToEmergency, markOnScene, dismissEmergency, closeEmergency, 
      updateEmergencyReport, appLinks, updateAppLinks, geminiApiKey, geminiApiKeySecondary, updateGeminiApiKeys,
      escalationConfig, updateEscalationConfig,
      unlockAudio, stopAllAlerts, playGlobalSiren, logAdminAction, updateProfile, isFirebaseReady, isOfflineMode, isAudioUnlocked, isSyncing,
      isShiftSharing, startShiftSharing, stopShiftSharing, currentGpsLocation
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp error');
  return context;
};
