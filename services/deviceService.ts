import { db, getFirebaseInstallationId } from '../firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { User, UserDevice } from '../types';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

// Generate or retrieve persistent local device ID (hardware or browser profile)
export const getLocalDeviceId = async (): Promise<string> => {
  let deviceId = localStorage.getItem('ers_device_id');
  if (!deviceId) {
    if (Capacitor.isNativePlatform()) {
      try {
        const idInfo = await Device.getId();
        deviceId = idInfo.identifier || `android_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      } catch (e) {
        deviceId = `native_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
    } else {
      deviceId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    localStorage.setItem('ers_device_id', deviceId);
  }
  return deviceId;
};

// Generate or retrieve independent Installation ID
export const getPersistentInstallationId = async (): Promise<string> => {
  return await getFirebaseInstallationId();
};

let heartbeatInterval: any = null;

/**
 * Register or update device record in `user_devices` collection (Phase 2.1).
 * Ensures an independent record per installation even for the same user across multiple browsers or devices.
 */
export const registerDeviceToken = async (
  user: User,
  token: string,
  notificationsEnabled: boolean = true,
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'granted'
): Promise<UserDevice | null> => {
  if (!user?.id) return null;

  try {
    const deviceId = await getLocalDeviceId();
    const installationId = await getPersistentInstallationId();

    let platform: 'android' | 'ios' | 'web' = 'web';
    let deviceModel = 'Web Browser';
    let operatingSystem = navigator.userAgent;
    let deviceName = 'متصفح ويب';

    if (Capacitor.isNativePlatform()) {
      const capPlatform = Capacitor.getPlatform();
      platform = capPlatform === 'android' ? 'android' : capPlatform === 'ios' ? 'ios' : 'web';
      try {
        const info = await Device.getInfo();
        deviceModel = `${info.manufacturer || ''} ${info.model || ''}`.trim() || 'Android Device';
        operatingSystem = `${info.operatingSystem} ${info.osVersion}`;
        deviceName = info.name || deviceModel;
      } catch (err) {
        console.warn('Could not read native device info:', err);
      }
    } else {
      deviceName = navigator.userAgent.includes('Chrome') ? 'Google Chrome' : 
                   navigator.userAgent.includes('Firefox') ? 'Mozilla Firefox' :
                   navigator.userAgent.includes('Safari') ? 'Apple Safari' : 'Web Browser';
    }

    // Independent record per installation: users/{user.id}_inst_{installationId}
    const docKey = `${user.id}_${installationId}`;
    const deviceDocRef = doc(db, 'user_devices', docKey);
    const existingSnap = await getDoc(deviceDocRef);

    const now = Date.now();
    let tokenUpdatedAt = now;
    let createdAt = now;

    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as UserDevice;
      createdAt = existingData.createdAt || now;
      if (existingData.fcmToken === token && existingData.tokenUpdatedAt) {
        tokenUpdatedAt = existingData.tokenUpdatedAt;
      }
    }

    const record: UserDevice = {
      installationId,
      deviceId,
      userId: user.id,
      userName: user.name || user.username,
      userRole: user.role,
      deviceName,
      deviceModel,
      platform,
      operatingSystem,
      appVersion: '2.0.0-phase4',
      fcmToken: token || '',
      tokenUpdatedAt,
      notificationsEnabled,
      permissionStatus,
      isActive: true,
      lastSeen: now,
      lastHeartbeat: now,
      createdAt,
      updatedAt: now,
    };

    await setDoc(deviceDocRef, {
      ...record,
      serverUpdatedAt: serverTimestamp()
    }, { merge: true });

    // Store active token and installation ID in localStorage for instant offline access
    if (token) localStorage.setItem('ers_fcm_token', token);
    localStorage.setItem('ers_registered_inst_id', installationId);

    // Start background heartbeat
    startDeviceHeartbeat(user.id, installationId);

    return record;
  } catch (error) {
    console.error('Failed to register device in Firestore:', error);
    return null;
  }
};

/**
 * Updates the device heartbeat timestamp in Firestore periodically
 */
export const startDeviceHeartbeat = (userId: string, installationId: string) => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(async () => {
    try {
      const docKey = `${userId}_${installationId}`;
      const deviceDocRef = doc(db, 'user_devices', docKey);
      await updateDoc(deviceDocRef, {
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        isActive: true,
        serverUpdatedAt: serverTimestamp()
      });
    } catch (e) {
      // Ignore background heartbeat network errors
    }
  }, 45000); // 45 seconds interval
};

export const stopDeviceHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

/**
 * Records alert delivery success timestamp on the user device record
 */
export const recordAlertDeliverySuccess = async (userId: string, installationId: string) => {
  try {
    const docKey = `${userId}_${installationId}`;
    const deviceDocRef = doc(db, 'user_devices', docKey);
    await updateDoc(deviceDocRef, {
      lastSuccessfulDeliveryAt: Date.now(),
      updatedAt: Date.now(),
      serverUpdatedAt: serverTimestamp()
    });
  } catch (e) {}
};

/**
 * Records alert acknowledgment timestamp on the user device record
 */
export const recordAlertAcknowledgment = async (userId: string, installationId: string) => {
  try {
    const docKey = `${userId}_${installationId}`;
    const deviceDocRef = doc(db, 'user_devices', docKey);
    await updateDoc(deviceDocRef, {
      lastAcknowledgedAlertAt: Date.now(),
      updatedAt: Date.now(),
      serverUpdatedAt: serverTimestamp()
    });
  } catch (e) {}
};

/**
 * Safely de-registers device on logout so this device stops receiving user's alerts
 */
export const unregisterDeviceOnLogout = async (userId: string): Promise<void> => {
  try {
    stopDeviceHeartbeat();
    const installationId = await getPersistentInstallationId();
    const docKey = `${userId}_${installationId}`;
    const deviceDocRef = doc(db, 'user_devices', docKey);
    
    const snap = await getDoc(deviceDocRef);
    if (snap.exists()) {
      await updateDoc(deviceDocRef, {
        isActive: false,
        fcmToken: '',
        deactivatedReason: 'user_logged_out',
        updatedAt: Date.now(),
        serverUpdatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.warn('Failed to unregister device on logout:', error);
  }
};
