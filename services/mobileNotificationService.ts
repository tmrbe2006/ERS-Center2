import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { User, UserRole } from '../types';
import { registerDeviceToken } from './deviceService';
import { deviceTrackingService } from './deviceTrackingService';
import { messaging } from '../firebase';
import { getToken } from 'firebase/messaging';

// Deduplication cache for alerts
const processedAlertIds = new Set<string>();

export interface NotificationStatus {
  isNative: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  token: string | null;
  error?: string;
}

export class MobileNotificationService {
  private static instance: MobileNotificationService;
  private currentToken: string | null = null;
  private currentUser: User | null = null;
  private navigationHandler: ((path: string) => void) | null = null;
  private initialized = false;

  private constructor() {}

  public static getInstance(): MobileNotificationService {
    if (!MobileNotificationService.instance) {
      MobileNotificationService.instance = new MobileNotificationService();
    }
    return MobileNotificationService.instance;
  }

  public setNavigationHandler(handler: (path: string) => void) {
    this.navigationHandler = handler;
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (user && this.currentToken) {
      registerDeviceToken(user, this.currentToken, true, 'granted');
      deviceTrackingService.setFcmToken(this.currentToken, true);
    }
  }

  public async initialize(): Promise<NotificationStatus> {
    if (this.initialized && this.currentToken) {
      return {
        isNative: Capacitor.isNativePlatform(),
        permission: 'granted',
        token: this.currentToken
      };
    }

    if (Capacitor.isNativePlatform()) {
      return await this.initNativePush();
    } else {
      return await this.initWebPush();
    }
  }

  // Native Android & iOS Push Integration
  private async initNativePush(): Promise<NotificationStatus> {
    try {
      // 1. Create Android High Priority Emergency Channel
      if (Capacitor.getPlatform() === 'android') {
        try {
          await PushNotifications.createChannel({
            id: 'ers_emergency_channel',
            name: 'قناة إنذارات ERS الطارئة',
            description: 'تنبيهات البلاغات العاجلة وحالات الطوارئ الميدانية مع صوت واهتزاز عالي الأولوية',
            importance: 5, // NotificationManager.IMPORTANCE_HIGH
            visibility: 1, // Notification.VISIBILITY_PUBLIC
            sound: 'siren.wav',
            vibration: true,
            lights: true,
            lightColor: '#DC004E'
          });
        } catch (channelErr) {
          console.warn('Channel creation error (may already exist):', channelErr);
        }
      }

      // 2. Check and Request Permission
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        return {
          isNative: true,
          permission: permStatus.receive === 'denied' ? 'denied' : 'prompt',
          token: null,
          error: 'تم رفض إذن الإشعارات من قبل المستخدم'
        };
      }

      // 3. Setup Native Listeners
      await this.setupNativeListeners();

      // 4. Register with Apple / Google APNs & FCM
      await PushNotifications.register();

      this.initialized = true;
      return {
        isNative: true,
        permission: 'granted',
        token: this.currentToken
      };
    } catch (error: any) {
      console.error('Error during native push initialization:', error);
      return {
        isNative: true,
        permission: 'denied',
        token: null,
        error: error?.message || 'فشل تهيئة الإشعارات الأصلية'
      };
    }
  }

  private async setupNativeListeners() {
    // On successfully receiving FCM / APNs Token
    PushNotifications.addListener('registration', async (token: Token) => {
      this.currentToken = token.value;
      deviceTrackingService.setFcmToken(token.value, true);
      if (this.currentUser) {
        await registerDeviceToken(this.currentUser, token.value, true, 'granted');
      }
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Push Registration Error:', error);
    });

    // Foreground Notification Received
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      const data = notification.data || {};
      const alertId = data.alertId || data.emergencyId || notification.id;

      // Deduplication: Avoid reprocessing same alert
      if (alertId && processedAlertIds.has(alertId)) {
        return;
      }
      if (alertId) processedAlertIds.add(alertId);

      // Record delivery success timestamp
      const instId = localStorage.getItem('ers_registered_inst_id');
      if (this.currentUser?.id && instId) {
        import('./deviceService').then(m => m.recordAlertDeliverySuccess(this.currentUser!.id, instId));
      }

      // Trigger custom UI event for in-app alert & siren
      window.dispatchEvent(new CustomEvent('ers:emergency-push-received', {
        detail: {
          emergencyId: data.emergencyId,
          typeName: data.typeName || notification.title,
          locationName: data.locationName || notification.body,
          data
        }
      }));
    });

    // Notification Tapped (Background or Cold Start)
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const data = action.notification.data || {};
      const emergencyId = data.emergencyId;

      if (emergencyId) {
        const targetPath = `/alarm/${emergencyId}`;
        if (this.navigationHandler) {
          this.navigationHandler(targetPath);
        } else {
          window.location.hash = targetPath;
        }
      }
    });
  }

  // Web Browser Fallback
  private async initWebPush(): Promise<NotificationStatus> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { isNative: false, permission: 'unsupported', token: null };
    }

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        return { isNative: false, permission: permission as any, token: null };
      }

      if (messaging) {
        try {
          const token = await getToken(messaging, {
            vapidKey: 'BPaH4_Y6I4N6H6_I4N6H6_I4N6H6_I4N6H6_I4N6H6_I4N6H6'
          });
          if (token) {
            this.currentToken = token;
            deviceTrackingService.setFcmToken(token, true);
            if (this.currentUser) {
              await registerDeviceToken(this.currentUser, token, true);
            }
            this.initialized = true;
            return { isNative: false, permission: 'granted', token };
          }
        } catch (tokenErr) {
          console.warn('Web FCM token generation fallback:', tokenErr);
        }
      }

      return { isNative: false, permission: 'granted', token: null };
    } catch (err: any) {
      return { isNative: false, permission: 'denied', token: null, error: err.message };
    }
  }

  public getToken(): string | null {
    return this.currentToken || localStorage.getItem('ers_fcm_token');
  }
}

export const mobileNotificationService = MobileNotificationService.getInstance();
