import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getItem, removeItem, setItem } from './secure-storage';
import { supabase } from './supabase';
import { withTimeout } from './with-timeout';

/**
 * Notifikasi push (Expo Push Service -> FCM). Hanya aplikasi native; web tiada push.
 * Penghantaran dilakukan oleh Edge Function `send-push` (lihat migration 172).
 */
const TOKEN_KEY = 'mysaff.push.token';
const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

if (isNative) {
  // Notifikasi yang tiba semasa app dibuka tetap dipaparkan sebagai sepanduk.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function registerForPush(): Promise<void> {
  if (Platform.OS === 'android') {
    // Saluran mesti wujud sebelum kebenaran diminta pada Android 13+.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifikasi MySAFF',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return;

  await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  await setItem(TOKEN_KEY, token);
}

/** Buang token peranti ini daripada akaun semasa (panggil SEBELUM log keluar). Cuba-terbaik. */
export async function unregisterPushToken(): Promise<void> {
  if (!isNative) return;
  try {
    const token = await getItem(TOKEN_KEY);
    if (!token) return;
    await withTimeout(Promise.resolve(supabase.rpc('unregister_push_token', { p_token: token })), 5000);
    await removeItem(TOKEN_KEY);
  } catch {
    // Token lapuk akan dibuang sendiri oleh pelayan bila Expo melaporkan DeviceNotRegistered.
  }
}

/** Daftarkan peranti selepas log masuk dan buka skrin yang betul bila notifikasi diketik. */
export function usePushNotifications(userId: string | undefined): void {
  const router = useRouter();

  useEffect(() => {
    if (!isNative || !userId) return;
    void registerForPush().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!isNative) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url !== 'string' || !url.startsWith('/(app)/')) return;
      // `n` memaksa skrin tab tersembunyi memuat semula data.
      const separator = url.includes('?') ? '&' : '?';
      router.push((url + separator + 'n=' + Date.now()) as never);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        open(response);
        if (response) void Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
}
