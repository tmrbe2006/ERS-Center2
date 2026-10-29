
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';

// تسجيل الـ Service Worker المتوافق مع FCM
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((reg) => console.log('FCM SW Registered!', reg))
      .catch((err) => console.log('FCM SW Reg failed!', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
