import { Geolocation, Position, WatchPositionCallback } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { User, UserRole } from '../types';

export interface LocationReport {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
  isLiveShift: boolean;
}

export class MobileLocationService {
  private static instance: MobileLocationService;
  private watchId: string | null = null;
  private currentUser: User | null = null;
  private isSharingShift: boolean = false;
  private lastReportTime: number = 0;
  private lastReportedCoords: { lat: number; lng: number } | null = null;
  private assignedEmergencyId: string | null = null;
  private listeners: ((report: LocationReport | null) => void)[] = [];

  private constructor() {
    const savedState = localStorage.getItem('ers_shift_sharing');
    if (savedState === 'true') {
      this.isSharingShift = true;
    }
  }

  public static getInstance(): MobileLocationService {
    if (!MobileLocationService.instance) {
      MobileLocationService.instance = new MobileLocationService();
    }
    return MobileLocationService.instance;
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (!user && this.isSharingShift) {
      this.stopShiftSharing();
    }
  }

  public setAssignedEmergency(emergencyId: string | null) {
    this.assignedEmergencyId = emergencyId;
  }

  public subscribe(callback: (report: LocationReport | null) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(report: LocationReport | null) {
    this.listeners.forEach(l => l(report));
  }

  public isShiftActive(): boolean {
    return this.isSharingShift;
  }

  // Request native or browser permissions
  public async checkPermissions(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
      if (Capacitor.isNativePlatform()) {
        const status = await Geolocation.checkPermissions();
        return status.location === 'granted' ? 'granted' : status.location === 'denied' ? 'denied' : 'prompt';
      } else {
        if ('permissions' in navigator) {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          return res.state as 'granted' | 'denied' | 'prompt';
        }
        return 'prompt';
      }
    } catch (e) {
      return 'prompt';
    }
  }

  public async requestPermissions(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await Geolocation.requestPermissions({
          permissions: ['location', 'coarseLocation']
        });
        return res.location === 'granted';
      }
      return true;
    } catch (e) {
      console.warn('Location request error:', e);
      return false;
    }
  }

  // Get immediate single position
  public async getCurrentPosition(): Promise<LocationReport | null> {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      });
      return this.formatPosition(pos, this.isSharingShift);
    } catch (e) {
      console.warn('Failed to get current GPS location:', e);
      return null;
    }
  }

  // Start shift location sharing
  public async startShiftSharing(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentUser) {
      return { success: false, error: 'يجب تسجيل الدخول لبدء المناوبة ومشاركة الموقع' };
    }

    const perm = await this.checkPermissions();
    if (perm !== 'granted') {
      const granted = await this.requestPermissions();
      if (!granted) {
        return { 
          success: false, 
          error: 'تم رفض إذن الوصول إلى خدمات الموقع (GPS). يرجى تمكينه من إعدادات الهاتف لمشاركة الموقع أثناء المناوبة.' 
        };
      }
    }

    try {
      this.isSharingShift = true;
      localStorage.setItem('ers_shift_sharing', 'true');

      // Fetch immediately
      const initialPos = await this.getCurrentPosition();
      if (initialPos) {
        await this.syncLocationToFirestore(initialPos);
        this.notifyListeners(initialPos);
      }

      // Start continuous watch with battery optimization (minimum 10 seconds interval / 10 meters distance)
      if (this.watchId) {
        await Geolocation.clearWatch({ id: this.watchId });
      }

      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        },
        async (position: Position | null, err?: any) => {
          if (err || !position) {
            console.warn('Location watch error:', err);
            return;
          }

          const now = Date.now();
          // Battery optimization: Throttle updates to at most once every 10 seconds unless moved significantly
          const timeSinceLast = now - this.lastReportTime;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          let movedSignificant = true;
          if (this.lastReportedCoords) {
            const dist = this.calculateDistance(
              this.lastReportedCoords.lat,
              this.lastReportedCoords.lng,
              lat,
              lng
            );
            movedSignificant = dist >= 10; // at least 10 meters
          }

          if (timeSinceLast >= 10000 || movedSignificant) {
            this.lastReportTime = now;
            this.lastReportedCoords = { lat, lng };

            const report = this.formatPosition(position, true);
            await this.syncLocationToFirestore(report);
            this.notifyListeners(report);
          }
        }
      );

      return { success: true };
    } catch (err: any) {
      console.error('Error starting location watch:', err);
      this.isSharingShift = false;
      localStorage.removeItem('ers_shift_sharing');
      return { success: false, error: err.message || 'تعذر بدء تتبع الموقع' };
    }
  }

  // Stop shift location sharing
  public async stopShiftSharing(): Promise<void> {
    this.isSharingShift = false;
    localStorage.removeItem('ers_shift_sharing');

    if (this.watchId) {
      try {
        await Geolocation.clearWatch({ id: this.watchId });
      } catch (e) {}
      this.watchId = null;
    }

    if (this.currentUser) {
      try {
        await updateDoc(doc(db, 'users', this.currentUser.id), {
          'lastLocation.isLiveShift': false,
          shiftStatus: 'off-duty',
          lastShiftEnd: Date.now()
        });
      } catch (e) {
        console.warn('Failed to update off-duty status in Firestore:', e);
      }
    }

    this.notifyListeners(null);
  }

  // Update Firestore user and active emergency telemetry
  private async syncLocationToFirestore(report: LocationReport) {
    if (!this.currentUser) return;

    try {
      // 1. Update user profile location & freshness
      const userDocRef = doc(db, 'users', this.currentUser.id);
      await updateDoc(userDocRef, {
        lastLocation: {
          lat: report.lat,
          lng: report.lng,
          accuracy: report.accuracy,
          timestamp: report.timestamp,
          isLiveShift: report.isLiveShift
        },
        shiftStatus: report.isLiveShift ? 'on-duty' : 'off-duty',
        lastHeartbeat: Date.now()
      });

      // 2. If actively responding to an emergency, append to incident telemetry
      if (this.assignedEmergencyId) {
        await addDoc(collection(db, `emergencies/${this.assignedEmergencyId}/telemetry`), {
          userId: this.currentUser.id,
          userName: this.currentUser.name || this.currentUser.username,
          lat: report.lat,
          lng: report.lng,
          accuracy: report.accuracy,
          speed: report.speed || null,
          timestamp: report.timestamp,
          serverTimestamp: serverTimestamp()
        });
      }
    } catch (e) {
      // Cache locally if offline
      localStorage.setItem('ers_last_cached_location', JSON.stringify(report));
    }
  }

  private formatPosition(pos: Position, isLiveShift: boolean): LocationReport {
    return {
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      accuracy: Math.round(pos.coords.accuracy || 0),
      speed: pos.coords.speed ? Number(pos.coords.speed.toFixed(1)) : null,
      heading: pos.coords.heading ? Math.round(pos.coords.heading) : null,
      timestamp: pos.timestamp || Date.now(),
      isLiveShift
    };
  }

  // Haversine distance formula in meters
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export const mobileLocationService = MobileLocationService.getInstance();
