
const CACHE_NAME = 'ers-system-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      ))
    ])
  );
});

// معالج الإشعارات الموحد (يدعم FCM والـ Push المباشر) عند قفل الهاتف
self.addEventListener('push', (event) => {
  let data = { 
    title: '🚨 إنذار طوارئ حرج (ERS System) 🚨', 
    body: 'بلاغ طوارئ جديد غير مستجاب! تدخل فوري مطلوب.',
    tag: 'emergency-alert-critical',
    url: '/'
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.notification?.title || payload.title || data.title,
        body: payload.notification?.body || payload.body || data.body,
        tag: payload.data?.tag || payload.tag || data.tag,
        url: payload.data?.url || payload.url || data.url
      };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    // نمط اهتزاز "عدواني" لضمان انتباه المستخدم والتطبيق مغلق/الهاتف مقفول
    vibrate: [1000, 200, 1000, 200, 1000, 500, 2000, 500, 2000],
    tag: data.tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: {
      url: data.url
    },
    actions: [
      { action: 'respond', title: '🚨 فتح البلاغ الآن 🚨' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
