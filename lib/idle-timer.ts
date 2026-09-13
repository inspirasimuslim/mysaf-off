import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { getItem, removeItem, setItem } from './secure-storage';
import { clearLocalSession, signOutFromDevice } from './session';
import { setAuthNotice } from './suspension';

/**
 * Log keluar automatik selepas tempoh tidak aktif.
 *
 * "Aktiviti" ialah cap masa sahaja — sentuhan, tatalan, navigasi dan (di web)
 * papan kekunci mengemas kininya tanpa render semula. Satu `setTimeout` tidur
 * sehingga saat tempoh itu SEPATUTNYA tamat, bangun, dan sama ada log keluar
 * atau tidur semula untuk baki masa. Tiada pemasa dicipta semula pada setiap
 * sentuhan.
 *
 * Masa di latar belakang DIKIRA. Pemasa JS tidur bila app di latar, jadi bila
 * app kembali aktif semakan dijalankan serta-merta terhadap cap masa asal —
 * kembali ke hadapan bukan satu aktiviti. Cap masa itu juga disimpan ke storan
 * semasa app ke latar, supaya app yang dibunuh lalu dibuka semula selepas
 * tempoh tamat masih dilog keluar dan bukan mendapat 20 minit baharu.
 */

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

export const IDLE_MESSAGE = 'Sesi tamat kerana tidak aktif. Sila log masuk semula.';

const STORAGE_KEY = 'mysaff.last-activity';

/** Tulis ke storan paling kerap sekali seminit — SecureStore bukan untuk setiap sentuhan. */
const PERSIST_INTERVAL_MS = 60 * 1000;

let lastActivity = Date.now();
let lastPersisted = 0;
/** `false` sehingga cap masa tersimpan dari proses terdahulu selesai dibaca. */
let hydrated = false;
let expiring = false;

function persist(at: number): void {
  lastPersisted = Date.now();
  void setItem(STORAGE_KEY, String(at)).catch(() => undefined);
}

export function reportActivity(): void {
  const now = Date.now();
  lastActivity = now;
  // Sebelum hydrate, menulis akan menimpa cap masa lama yang belum sempat dibaca.
  if (hydrated && now - lastPersisted >= PERSIST_INTERVAL_MS) persist(now);
}

/**
 * Dipanggil oleh skrin log masuk: tiada sesi bermakna cap masa tersimpan sudah
 * tidak bermakna. Tanpa ini, cap masa lama dari app yang dibunuh akan melog
 * keluar akaun sebaik sahaja ia log masuk semula.
 */
export function resetIdleTracking(): void {
  hydrated = true;
  lastPersisted = 0;
  void removeItem(STORAGE_KEY).catch(() => undefined);
}

/**
 * Prop responder untuk View pembalut: dipanggil pada fasa CAPTURE bagi setiap
 * sentuhan dalam pokok di bawahnya (termasuk kandungan `Modal` di native), dan
 * sentiasa memulangkan `false` supaya tiada sentuhan dirampas.
 */
export const activityCaptureProps = {
  onStartShouldSetResponderCapture: () => {
    reportActivity();
    return false;
  },
  onMoveShouldSetResponderCapture: () => {
    reportActivity();
    return false;
  },
};

async function expireSession(): Promise<void> {
  if (expiring) return;
  expiring = true;
  resetIdleTracking();
  setAuthNotice(IDLE_MESSAGE);
  try {
    const { error } = await signOutFromDevice();
    // Tanpa talian `signOut` gagal dan sesi kekal — buang sesi tempatan juga.
    if (error) await clearLocalSession();
  } catch {
    await clearLocalSession().catch(() => undefined);
  } finally {
    expiring = false;
  }
}

/**
 * Pasang sekali di `app/(app)/_layout.tsx`. `active` ialah "ada sesi" — skrin
 * gate (sekatan, tukar kata laluan paksa) juga dikira, supaya sesi tidak
 * tergantung tanpa had di situ. Apabila sesi hilang, skrin log masuk dicapai
 * melalui `<Redirect>` sedia ada dalam layout tersebut.
 */
export function useIdleTimeout(active: boolean): void {
  const pathname = usePathname();

  // Navigasi antara skrin ialah aktiviti.
  useEffect(() => {
    if (active) reportActivity();
  }, [active, pathname]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (cancelled || !hydrated) return;

      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) {
        void expireSession();
        return;
      }
      timer = setTimeout(check, remaining);
    };

    void (async () => {
      if (hydrated) {
        // Aktif semula dalam proses yang sama = log masuk baharu.
        lastActivity = Date.now();
      } else {
        const stored = Number(await getItem(STORAGE_KEY).catch(() => null));
        if (cancelled) return;
        lastActivity = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
        hydrated = true;
      }
      persist(lastActivity);
      check();
    })();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
      else persist(lastActivity);
    });

    // Di web, tatalan roda, papan kekunci dan portal Modal tidak melalui responder.
    const webEvents = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;
    const onWebActivity = () => reportActivity();
    const webTarget = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null;
    webEvents.forEach((name) => webTarget?.addEventListener(name, onWebActivity, { capture: true, passive: true }));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appState.remove();
      webEvents.forEach((name) => webTarget?.removeEventListener(name, onWebActivity, { capture: true }));
    };
  }, [active]);
}
