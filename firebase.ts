
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDi3fe3uYPUtsaihI9aVwl9OdZoW2CdhVs",
  authDomain: "firealarmsystem-6fdc2.firebaseapp.com",
  databaseURL: "https://firealarmsystem-6fdc2-default-rtdb.firebaseio.com",
  projectId: "firealarmsystem-6fdc2",
  storageBucket: "firealarmsystem-6fdc2.firebasestorage.app",
  messagingSenderId: "108775827318",
  appId: "1:108775827318:web:05d1d4a4b0469beebd3c57",
  measurementId: "G-YLWKXZRY9M"
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    cacheSizeBytes: 104857600
  })
});

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// تفعيل المراسلة (للويب)
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// الحصول على معرّف التثبيت Firebase Installation ID
export const getFirebaseInstallationId = async (): Promise<string> => {
  if (typeof window === 'undefined') return 'server_inst_id';
  try {
    const { getInstallations, getId } = await import("firebase/installations");
    const installations = getInstallations(app);
    const id = await getId(installations);
    if (id) return id;
  } catch (err) {
    console.warn("Could not retrieve Firebase Installation ID directly:", err);
  }
  // Persistent fallback in localStorage
  let cachedId = localStorage.getItem('ers_installation_id');
  if (!cachedId) {
    cachedId = `fid_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('ers_installation_id', cachedId);
  }
  return cachedId;
};

