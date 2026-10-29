
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDi3fe3uYPUtsaihI9aVwl9OdZoW2CdhVs",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "firealarmsystem-6fdc2.firebaseapp.com",
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://firealarmsystem-6fdc2-default-rtdb.firebaseio.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "firealarmsystem-6fdc2",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "firealarmsystem-6fdc2.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "108775827318",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:108775827318:web:05d1d4a4b0469beebd3c57",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-YLWKXZRY9M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;
export default app;
