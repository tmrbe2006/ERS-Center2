
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDi3fe3uYPUtsaihI9aVwl9OdZoW2CdhVs",
  authDomain: "firealarmsystem-6fdc2.firebaseapp.com",
  databaseURL: "https://firealarmsystem-6fdc2-default-rtdb.firebaseio.com",
  projectId: "firealarmsystem-6fdc2",
  storageBucket: "firealarmsystem-6fdc2.firebasestorage.app",
  messagingSenderId: "108775827318",
  appId: "1:108775827318:web:05d1d4a4b0469beebd3c57",
  measurementId: "G-YLWKXZRY9M"
});

const messaging = firebase.messaging();

const displayEmergencyNotification = (payload) => {
  const title = payload.notification?.title || payload.data?.title || '🚨 إنذار طوارئ حرج 🚨';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'بلاغ جديد يتطلب استجابة فورية!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    // نمط اهتزاز قوي لضمان انتباه المستخدم والتطبيق مغلق
    vibrate: [1000, 500, 1000, 500, 1000, 500, 2000],
    tag: 'emergency-alert-critical',
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { url: payload.data?.url || '/' },
    actions: [
      { action: 'open', title: '🚨 فتح البلاغ الآن 🚨' }
    ]
  };
  
  return self.registration.showNotification(title, options);
};

messaging.onBackgroundMessage((payload) => {
  return displayEmergencyNotification(payload);
});

self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      event.waitUntil(displayEmergencyNotification(payload));
    } catch (e) {
      const fallbackOptions = {
        body: event.data.text(),
        vibrate: [1000, 500, 1000],
        requireInteraction: true,
        tag: 'emergency-alert-critical'
      };
      event.waitUntil(self.registration.showNotification('🚨 بلاغ طوارئ جديد 🚨', fallbackOptions));
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
