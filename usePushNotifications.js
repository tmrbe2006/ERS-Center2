
import { useState, useEffect } from 'react';
import { messaging } from './firebaseConfig';
import { getToken, onMessage } from 'firebase/messaging';

export const usePushNotifications = () => {
  const [fcmToken, setFcmToken] = useState(null);

  const requestPermission = async () => {
    try {
      if (!messaging) return;
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: 'BPaH4_Y6I4N6H6_I4N6H6_I4N6H6_I4N6H6_I4N6H6_I4N6H6' // استبدل بـ VAPID Key الخاص بك من Firebase Console
        });
        if (token) {
          setFcmToken(token);
          console.log('FCM Token:', token);
        }
      }
    } catch (error) {
      console.error('Push Permission Error:', error);
    }
  };

  useEffect(() => {
    if (messaging) {
      onMessage(messaging, (payload) => {
        console.log('Message received in foreground:', payload);
        // يمكنك إظهار Toast مخصص هنا
      });
    }
  }, []);

  return { fcmToken, requestPermission };
};
