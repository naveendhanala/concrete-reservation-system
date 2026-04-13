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

async function createPushSubscription() {
  // Step 1: request permission — does NOT need the SW, works immediately on user gesture
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  // Step 2: now wait for SW (it should be ready quickly since permission was just granted)
  const swReady = new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Service worker is not ready. Try reinstalling the app.')),
      10000
    );
    navigator.serviceWorker.ready.then((reg) => { clearTimeout(timer); resolve(reg); });
  });
  const registration = await swReady;

  // Step 3: subscribe to push
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await client.post('/push/subscribe', subscription.toJSON());
  return 'subscribed';
}

async function syncExistingSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await client.post('/push/subscribe', existing.toJSON());
  }
}

export function usePushNotifications(isLoggedIn: boolean) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    if (Notification.permission === 'granted') {
      syncExistingSubscription().catch(() => {});
      return;
    }

    if (Notification.permission === 'default') {
      setShowBanner(true);
    }
  }, [isLoggedIn]);

  async function enablePush() {
    setShowBanner(false);
    try {
      const result = await createPushSubscription();
      if (result === 'denied') {
        toast.error('Notification permission denied');
      } else {
        toast.success('Notifications enabled');
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
