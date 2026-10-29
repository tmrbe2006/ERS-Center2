import { db, getFirebaseInstallationId } from '../firebase';
import { 
  doc, setDoc, getDoc, updateDoc, addDoc, collection, 
  serverTimestamp, runTransaction, onSnapshot, getDocs,
  collectionGroup, query, where, orderBy, limit
} from 'firebase/firestore';
import { User, ConnectedDevice, DeviceType, DeviceLocationSource, DeviceLocationStatus, LocationHistoryEntry } from '../types';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Geolocation } from '@capacitor/geolocation';

// ============================================================================
// Device & Session Identifiers (Per-Installation & Per-Session)
// ============================================================================

// Device ID is persistent across sessions and installs on this device/browser
export const getPersistentDeviceId = async (): Promise<string> => {
  let deviceId = localStorage.getItem('ers_device_id');
  if (!deviceId) {
    if (Capacitor.isNativePlatform()) {
      try {
        const idInfo = await Device.getId();
        deviceId = idInfo.identifier || `cap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      } catch {
        deviceId = `cap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
    } else {
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
    localStorage.setItem('ers_device_id', deviceId);
  }
  return deviceId;
};

// Session ID is independent for each application session / launch
export const getActiveSessionId = (): string => {
  let sessionId = sessionStorage.getItem('ers_session_id');
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('ers_session_id', sessionId);
  }
  return sessionId;
};

// Device metadata helper
export const getDeviceMetadata = async (): Promise<{
  deviceName: string;
  deviceType: DeviceType;
  browser: string;
  operatingSystem: string;
}> => {
  let deviceType: DeviceType = 'desktop';
  let deviceName = 'Web Station';
  let browser = 'Browser';
  let operatingSystem = 'Unknown OS';

  const ua = navigator.userAgent;

  // Detect Device Type
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(ua)) {
    deviceType = 'mobile';
  } else {
    deviceType = 'desktop';
  }

  // Detect Browser
  if (ua.indexOf('Firefox') > -1) {
    browser = 'Mozilla Firefox';
  } else if (ua.indexOf('SamsungBrowser') > -1) {
    browser = 'Samsung Internet';
  } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
    browser = 'Opera';
  } else if (ua.indexOf('Trident') > -1) {
    browser = 'Internet Explorer';
  } else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg/') > -1) {
    browser = 'Microsoft Edge';
  } else if (ua.indexOf('Chrome') > -1) {
    browser = 'Google Chrome';
  } else if (ua.indexOf('Safari') > -1) {
    browser = 'Apple Safari';
  }

  // Detect Operating System
  if (ua.indexOf('Win') !== -1) operatingSystem = 'Windows';
  else if (ua.indexOf('Mac') !== -1) operatingSystem = 'macOS';
  else if (ua.indexOf('Linux') !== -1) operatingSystem = 'Linux';
  else if (ua.indexOf('Android') !== -1) operatingSystem = 'Android';
  else if (ua.indexOf('like Mac') !== -1) operatingSystem = 'iOS';

  deviceName = `${operatingSystem} (${browser})`;

  // Capacitor native info if available
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      deviceName = `${info.manufacturer || ''} ${info.model || ''}`.trim() || deviceName;
      operatingSystem = `${info.operatingSystem} ${info.osVersion}`;
      deviceType = info.isVirtual ? 'desktop' : 'mobile';
    } catch {
      // Keep browser-detected
    }
  }

  return { deviceName, deviceType, browser, operatingSystem };
};

// ============================================================================
// IP Geolocation Determination
// ============================================================================

export interface IpGeoResult {
  ipAddress: string;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export const fetchIpGeolocation = async (): Promise<IpGeoResult | null> => {
  // Try 1: Local server endpoint
  try {
    const res = await fetch('/api/geo/ip-lookup', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.ipAddress) {
        return {
          ipAddress: data.ipAddress,
          country: data.country || 'المملكة العربية السعودية',
          countryCode: data.countryCode || 'SA',
          city: data.city || 'الرياض',
          region: data.region || 'الرياض',
          latitude: Number(data.latitude) || 24.7136,
          longitude: Number(data.longitude) || 46.6753,
          timestamp: Date.now()
        };
      }
    }
  } catch (err) {
    // Fall back to direct public service
  }

  // Try 2: Direct public fallback
  try {
    const res2 = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(3500) });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && data2.success !== false) {
        return {
          ipAddress: data2.ip || '127.0.0.1',
          country: data2.country || 'المملكة العربية السعودية',
          countryCode: data2.country_code || 'SA',
          city: data2.city || 'الرياض',
          region: data2.region || 'الرياض',
          latitude: Number(data2.latitude) || 24.7136,
          longitude: Number(data2.longitude) || 46.6753,
          timestamp: Date.now()
        };
      }
    }
  } catch {
    // Ignore
  }

  // Try 3: ipapi.co
  try {
    const res3 = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3500) });
    if (res3.ok) {
      const data3 = await res3.json();
      if (data3 && !data3.error) {
        return {
          ipAddress: data3.ip || '127.0.0.1',
          country: data3.country_name || 'المملكة العربية السعودية',
          countryCode: data3.country_code || 'SA',
          city: data3.city || 'الرياض',
          region: data3.region || 'الرياض',
          latitude: Number(data3.latitude) || 24.7136,
          longitude: Number(data3.longitude) || 46.6753,
          timestamp: Date.now()
        };
      }
    }
  } catch {
    // Ignore
  }

  return null;
};

// ============================================================================
// GPS Geolocation Determination
// ============================================================================

export interface GpsGeoResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const fetchGpsLocation = async (): Promise<GpsGeoResult | null> => {
  // Capacitor Native
  if (Capacitor.isNativePlatform()) {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 15,
        timestamp: pos.timestamp || Date.now()
      };
    } catch (err) {
      console.warn('Native GPS read failed:', err);
    }
  }

  // Standard Web Geolocation API
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 20,
            timestamp: pos.timestamp || Date.now()
          });
        },
        (err) => {
          console.warn('Web GPS read failed or denied:', err.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }

  return null;
};

// ============================================================================
// Device Tracking Manager Class
// ============================================================================

class DeviceTrackingService {
  private currentUser: User | null = null;
  private currentDeviceId: string = '';
  private currentSessionId: string = '';
  private currentInstallationId: string = '';
  private activeFcmToken: string = '';
  private notificationsEnabled: boolean = false;
  
  private periodicInterval: any = null;
  private heartbeatInterval: any = null;
  private isInitialized: boolean = false;
  private isUpdatingLocation: boolean = false;

  // Track last known values in memory to avoid unnecessary Firestore writes
  private lastObservedAt: number = 0;
  private lastSavedCoords: { lat: number; lng: number } | null = null;
  private lastSavedCountry: string = '';

  constructor() {
    this.currentSessionId = getActiveSessionId();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.currentDeviceId = await getPersistentDeviceId();
    this.currentInstallationId = await getFirebaseInstallationId();
    this.activeFcmToken = localStorage.getItem('ers_fcm_token') || '';
    
    // Check notification permission status
    if (typeof Notification !== 'undefined') {
      this.notificationsEnabled = Notification.permission === 'granted';
    }

    // Attach lifecycle listeners
    this.attachEventListeners();

    // Start 60-second heartbeat for accurate online/offline presence
    this.startHeartbeat();

    // Start 5-minute periodic location verification
    this.startPeriodicLocationCheck();
  }

  public setCurrentUser(user: User | null): void {
    const previousUser = this.currentUser;
    this.currentUser = user;

    if (user) {
      // Trigger instant location evaluation on login or user switch
      this.evaluateAndSyncDeviceLocation('login');
    } else if (previousUser) {
      // User logged out
      this.markDeviceOfflineOnLogout(previousUser.id);
    }
  }

  public setFcmToken(token: string, enabled: boolean = true): void {
    this.activeFcmToken = token;
    this.notificationsEnabled = enabled;
    localStorage.setItem('ers_fcm_token', token);

    // Update in Firestore without changing location
    if (this.currentUser?.id && this.currentDeviceId) {
      const devRef = doc(db, 'users', this.currentUser.id, 'devices', this.currentDeviceId);
      updateDoc(devRef, {
        fcmToken: token,
        notificationEnabled: enabled,
        lastSeen: Date.now()
      }).catch((e) => console.warn('Could not update device FCM token:', e));
    }
  }

  // Force trigger location check from UI or diagnostics
  public async forceRefreshLocation(triggerReason: string = 'manual'): Promise<ConnectedDevice | null> {
    return this.evaluateAndSyncDeviceLocation(triggerReason);
  }

  // ============================================================================
  // Core: Evaluate Location & Sync using Firestore Transaction
  // ============================================================================

  public async evaluateAndSyncDeviceLocation(triggerReason: string = 'periodic'): Promise<ConnectedDevice | null> {
    if (!this.currentUser?.id) return null;
    if (this.isUpdatingLocation) return null;

    this.isUpdatingLocation = true;
    try {
      const userId = this.currentUser.id;
      const deviceId = this.currentDeviceId || await getPersistentDeviceId();
      const installationId = this.currentInstallationId || await getFirebaseInstallationId();
      const sessionId = this.currentSessionId || getActiveSessionId();
      const metadata = await getDeviceMetadata();

      // 1. Fetch IP Geolocation (Always automatic, non-intrusive)
      const ipResult = await fetchIpGeolocation();
      const now = Date.now();

      // 2. Try GPS Geolocation if available
      const gpsResult = await fetchGpsLocation();

      // Determine observation source and values
      let lat = 24.7136;
      let lng = 46.6753;
      let country = 'المملكة العربية السعودية';
      let countryCode = 'SA';
      let city = 'الرياض';
      let region = 'الرياض';
      let ipAddress = ipResult?.ipAddress || '127.0.0.1';
      let source: DeviceLocationSource = 'none';
      let accuracy = 10000;
      let status: DeviceLocationStatus = 'approximate';
      let observationTime = now;

      if (gpsResult) {
        // High confidence GPS
        lat = gpsResult.latitude;
        lng = gpsResult.longitude;
        accuracy = gpsResult.accuracy;
        source = 'gps';
        status = 'active';
        observationTime = gpsResult.timestamp;

        // Use IP data for country/city context if available
        if (ipResult) {
          country = ipResult.country;
          countryCode = ipResult.countryCode;
          city = ipResult.city;
          region = ipResult.region;
        }
      } else if (ipResult) {
        // Approximate IP location
        lat = ipResult.latitude;
        lng = ipResult.longitude;
        country = ipResult.country;
        countryCode = ipResult.countryCode;
        city = ipResult.city;
        region = ipResult.region;
        accuracy = 45000; // ~45km approximate radius
        source = 'ip';
        status = 'approximate';
        observationTime = ipResult.timestamp;
      } else {
        // Both failed
        status = 'stale';
        source = 'none';
      }

      const deviceDocRef = doc(db, 'users', userId, 'devices', deviceId);

      // Execute Firestore Transaction to handle versioning, conflict resolution, and stale protection
      const updatedDevice = await runTransaction(db, async (tx) => {
        const snap = await tx.get(deviceDocRef);
        const existing = snap.data() as ConnectedDevice | undefined;

        let effectiveVersion = 1;
        let effectiveFirstSeen = now;
        let lastKnownCountry = country;
        let lastKnownCity = city;
        let shouldLogHistory = false;
        let historyReason = triggerReason;

        if (existing) {
          effectiveVersion = (existing.locationVersion || 0) + 1;
          effectiveFirstSeen = existing.firstSeen || now;
          lastKnownCountry = existing.country || country;
          lastKnownCity = existing.city || city;

          // Conflict Rule A: Never let older observation overwrite newer observation
          if (observationTime < (existing.locationObservedAt || 0)) {
            // Keep existing location data, only update heartbeat and online status
            tx.update(deviceDocRef, {
              isOnline: true,
              lastSeen: now,
              activeSessionId: sessionId
            });
            return {
              ...existing,
              isOnline: true,
              lastSeen: now,
              activeSessionId: sessionId
            } as ConnectedDevice;
          }

          // Conflict Rule B: If incoming is IP, but existing is GPS observed recently (within 15 minutes),
          // preserve GPS coordinates and only update IP / lastIpCheckAt
          const isExistingGpsRecent = existing.locationSource === 'gps' && 
                                     (now - (existing.locationObservedAt || 0) < 15 * 60 * 1000);
          
          if (source === 'ip' && isExistingGpsRecent && existing.latitude && existing.longitude) {
            lat = existing.latitude;
            lng = existing.longitude;
            source = 'gps';
            accuracy = existing.locationAccuracy;
            status = existing.locationStatus;
            observationTime = existing.locationObservedAt;
          }

          // Conflict Rule C: Check if location changed country or city or moved significantly (> 2km)
          const countryChanged = existing.country && existing.country !== country;
          const cityChanged = existing.city && existing.city !== city;
          const distKm = Math.hypot(existing.latitude - lat, existing.longitude - lng) * 111; // ~111km per deg

          if (countryChanged) {
            shouldLogHistory = true;
            historyReason = `انتقال دولي: من ${existing.country} إلى ${country}`;
          } else if (cityChanged) {
            shouldLogHistory = true;
            historyReason = `تغيير المدينة: من ${existing.city} إلى ${city}`;
          } else if (distKm > 2 && source === 'gps') {
            shouldLogHistory = true;
            historyReason = `حركة ميدانية (${Math.round(distKm)} كم)`;
          }

          // Handle determination failure -> preserve last known location and mark stale
          if (status === 'stale') {
            lat = existing.latitude || lat;
            lng = existing.longitude || lng;
            country = existing.country || country;
            city = existing.city || city;
            region = existing.region || region;
          }
        } else {
          // First time registration
          shouldLogHistory = true;
          historyReason = 'التسجيل الأولي للجهاز';
        }

        const devicePayload: ConnectedDevice = {
          deviceId,
          installationId,
          userId,
          userName: this.currentUser?.name || this.currentUser?.username || 'مستخدم',
          sessionId,
          deviceName: metadata.deviceName,
          deviceType: metadata.deviceType,
          browser: metadata.browser,
          operatingSystem: metadata.operatingSystem,
          fcmToken: this.activeFcmToken,
          notificationEnabled: this.notificationsEnabled,
          ipAddress,
          country,
          countryCode,
          city,
          region,
          latitude: lat,
          longitude: lng,
          locationSource: source,
          locationAccuracy: accuracy,
          locationStatus: status,
          locationObservedAt: observationTime,
          locationUpdatedAt: now,
          locationVersion: effectiveVersion,
          lastIpCheckAt: ipResult ? now : (existing?.lastIpCheckAt || now),
          lastKnownCountry,
          lastKnownCity,
          activeSessionId: sessionId,
          isOnline: true,
          firstSeen: effectiveFirstSeen,
          lastSeen: now,
          lastLocationUpdate: now
        };

        tx.set(deviceDocRef, devicePayload, { merge: true });

        return { devicePayload, shouldLogHistory, historyReason };
      });

      // Write location history record asynchronously if significant movement or country change occurred
      if (updatedDevice?.shouldLogHistory) {
        this.recordLocationHistory(userId, deviceId, updatedDevice.devicePayload, updatedDevice.historyReason);
      }

      this.lastObservedAt = observationTime;
      this.lastSavedCoords = { lat, lng };
      this.lastSavedCountry = country;

      return updatedDevice?.devicePayload || null;
    } catch (err) {
      console.error('Failed to sync device location:', err);
      return null;
    } finally {
      this.isUpdatingLocation = false;
    }
  }

  // ============================================================================
  // Location History Subcollection
  // ============================================================================

  private async recordLocationHistory(
    userId: string, 
    deviceId: string, 
    device: ConnectedDevice, 
    reason: string
  ): Promise<void> {
    try {
      const historyCol = collection(db, 'users', userId, 'devices', deviceId, 'locationHistory');
      const entry: LocationHistoryEntry = {
        deviceId,
        userId,
        latitude: device.latitude,
        longitude: device.longitude,
        country: device.country,
        countryCode: device.countryCode,
        city: device.city,
        region: device.region,
        locationSource: device.locationSource,
        locationAccuracy: device.locationAccuracy,
        locationStatus: device.locationStatus,
        timestamp: Date.now(),
        reason
      };
      await addDoc(historyCol, entry);
    } catch (e) {
      console.warn('Could not record location history:', e);
    }
  }

  // ============================================================================
  // Presence: Heartbeat & Offline Management
  // ============================================================================

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    // Every 60 seconds, heartbeat to keep online status active
    this.heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && this.currentUser?.id && this.currentDeviceId) {
        const devRef = doc(db, 'users', this.currentUser.id, 'devices', this.currentDeviceId);
        updateDoc(devRef, {
          isOnline: true,
          lastSeen: Date.now(),
          activeSessionId: this.currentSessionId
        }).catch(() => {});
      }
    }, 60000);
  }

  private startPeriodicLocationCheck(): void {
    if (this.periodicInterval) clearInterval(this.periodicInterval);
    // Every 5 minutes during app activity
    this.periodicInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.evaluateAndSyncDeviceLocation('5min_interval');
      }
    }, 5 * 60 * 1000);
  }

  public async markDeviceOfflineOnLogout(userId: string): Promise<void> {
    try {
      const deviceId = this.currentDeviceId || await getPersistentDeviceId();
      const devRef = doc(db, 'users', userId, 'devices', deviceId);
      await updateDoc(devRef, {
        isOnline: false,
        lastSeen: Date.now(),
        activeSessionId: ''
      });
    } catch (err) {
      console.warn('Could not mark device offline on logout:', err);
    }
  }

  // ============================================================================
  // Event Listeners: Reconnect, Network Change, Visibility
  // ============================================================================

  private attachEventListeners(): void {
    if (typeof window === 'undefined') return;

    // 1. Reconnect (Online event)
    window.addEventListener('online', () => {
      this.evaluateAndSyncDeviceLocation('network_reconnected');
    });

    // 2. Disconnect (Offline event)
    window.addEventListener('offline', () => {
      if (this.currentUser?.id && this.currentDeviceId) {
        const devRef = doc(db, 'users', this.currentUser.id, 'devices', this.currentDeviceId);
        updateDoc(devRef, {
          isOnline: false,
          locationStatus: 'stale',
          lastSeen: Date.now()
        }).catch(() => {});
      }
    });

    // 3. Network connection change (Web)
    if ('connection' in navigator && (navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', () => {
        this.evaluateAndSyncDeviceLocation('network_interface_changed');
      });
    }

    // 4. Capacitor Network plugin change
    if (Capacitor.isNativePlatform()) {
      Network.addListener('networkStatusChange', (status) => {
        if (status.connected) {
          this.evaluateAndSyncDeviceLocation('native_network_changed');
        }
      });
    }

    // 5. App visibility / Unload
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // App returned to foreground
        this.evaluateAndSyncDeviceLocation('foreground_resume');
      }
    });

    window.addEventListener('beforeunload', () => {
      if (this.currentUser?.id && this.currentDeviceId) {
        // Send fast update
        const devRef = doc(db, 'users', this.currentUser.id, 'devices', this.currentDeviceId);
        updateDoc(devRef, {
          isOnline: false,
          lastSeen: Date.now()
        }).catch(() => {});
      }
    });
  }

  // Diagnostics / Testing Helper: Simulate Country Transition (Saudi Arabia -> Egypt)
  public async simulateCountryTransition(countryName: string, cityName: string, lat: number, lng: number, ip: string): Promise<void> {
    if (!this.currentUser?.id) return;
    const userId = this.currentUser.id;
    const deviceId = this.currentDeviceId || await getPersistentDeviceId();
    const deviceDocRef = doc(db, 'users', userId, 'devices', deviceId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(deviceDocRef);
      const existing = snap.data() as ConnectedDevice | undefined;
      const now = Date.now();
      const version = (existing?.locationVersion || 0) + 1;

      const payload: Partial<ConnectedDevice> = {
        country: countryName,
        countryCode: countryName === 'جمهورية مصر العربية' ? 'EG' : 'SA',
        city: cityName,
        region: cityName,
        latitude: lat,
        longitude: lng,
        ipAddress: ip,
        locationSource: 'ip',
        locationAccuracy: 40000,
        locationStatus: 'approximate',
        locationObservedAt: now,
        locationUpdatedAt: now,
        locationVersion: version,
        lastIpCheckAt: now,
        lastKnownCountry: existing?.country || 'المملكة العربية السعودية',
        lastKnownCity: existing?.city || 'الرياض',
        isOnline: true,
        lastSeen: now,
        lastLocationUpdate: now
      };

      tx.set(deviceDocRef, payload, { merge: true });
    });

    // Record transition history
    if (this.currentUser?.id && this.currentDeviceId) {
      const historyCol = collection(db, 'users', userId, 'devices', deviceId, 'locationHistory');
      await addDoc(historyCol, {
        deviceId,
        userId,
        latitude: lat,
        longitude: lng,
        country: countryName,
        countryCode: countryName === 'جمهورية مصر العربية' ? 'EG' : 'SA',
        city: cityName,
        region: cityName,
        locationSource: 'ip',
        locationAccuracy: 40000,
        locationStatus: 'approximate',
        timestamp: Date.now(),
        reason: `محاكاة اختبار الانتقال الدولي: إلى ${countryName} (${cityName})`
      });
    }
  }
}

export const deviceTrackingService = new DeviceTrackingService();
