// src/hooks/usePushNotifications.ts
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import client from '../api/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}

async function doSubscribe() {
  const swReady = new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Service worker did not become ready in time')), 10000);
    navigator.serviceWorker.ready.then((reg) => { clearTimeout(timer); resolve(reg); });
  });
  const registration = await swReady;
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    await client.post('/push/subscribe', existing.toJSON());
    return 'already-subscribed';
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await client.post('/push/subscribe', subscription.toJSON());
  return 'subscribed';
}

// Returns whether the user should be prompted to enable notifications
// and an enablePush() function to call on a user gesture (button tap)
export function usePushNotifications(isLoggedIn: boolean) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    // If already granted, just sync the subscription silently
    if (Notification.permission === 'granted') {
      doSubscribe().catch(() => {});
      return;
    }

    // If not yet decided, show the banner asking the user to enable
    if (Notification.permission === 'default') {
      setShowBanner(true);
    }
  }, [isLoggedIn]);

  async function enablePush() {
    setShowBanner(false);
    try {
      const result = await doSubscribe();
      if (result === 'denied') {
        toast.error('Notification permission denied');
      }
    } catch (err: any) {
      toast.error('Push setup failed: ' + (err?.message ?? 'unknown error'));
      console.warn('Push subscription failed:', err);
    }
  }

  function dismissBanner() {
    setShowBanner(false);
  }

  return { showBanner, enablePush, dismissBanner };
}
