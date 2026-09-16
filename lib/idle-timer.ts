import * as SecureStore from 'expo-secure-store';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { forceSignedOut } from './auth-context';
import { clearLocalSession, signOutFromDevice } from './session';
import { setAuthNotice } from './suspension';

/**
 * Log keluar automatik selepas tempoh tidak aktif.
 *
 * "Aktiviti" ialah cap masa sahaja — sentuhan, tatalan, navigasi dan (di web)
 * papan kekunci mengemas kininya tanpa render semula. Satu `setTimeout` tidur
 * sehingga saat tempoh itu SEPATUTNYA tamat, bangun, dan sama ada log keluar
 * atau tidur semula untuk baki masa.
 *
 * Masa di latar belakang DIKIRA. Pemasa JS tidur bila app di latar, jadi bila
 * app kembali aktif semakan dijalankan serta-merta terhadap cap masa asal —
 * kembali ke hadapan bukan satu aktiviti.
 *
 * Tiga perkara yang dahulu membolehkan sesi terlepas selepas app di latar
 * lebih 20 minit (APK release, Android):
 *
 *   1. Log keluar bergantung pada rangkaian. `signOut()` Supabase menghantar
 *      permintaan (dan mungkin menunggu refresh token yang memegang kunci
 *      dalaman) SEBELUM sesi dibuang. Selepas lama di latar, sambungan HTTP
 *      dalam pool sudah mati dan OkHttp React Native tiada had masa baca —
 *      permintaan itu boleh tergantung tanpa penghujung, sesi kekal, dan
 *      sentuhan pengguna seterusnya dikira aktiviti baharu. Kini sesi
 *      dikeluarkan dari UI SERTA-MERTA (`forceSignedOut`) dan pembatalan di
 *      pelayan hanyalah cuba-terbaik dengan had masa.
 *
 *   2. Tulisan cap masa semasa ke latar ialah rantaian beberapa panggilan
 *      SecureStore async; Android boleh membekukan proses di tengah rantaian.
 *      Kini satu kunci ditulis dengan `SecureStore.setItem` SYNCHRONOUS — ia
 *      selesai sebelum pengendali AppState pulang.
 *
 *   3. Pemasangan semula layout dalam proses yang sama (aktiviti Android
 *      dicipta semula) dahulu dianggap log masuk baharu dan menetapkan semula
 *      pemasa. Kini hanya skrin log masuk (`resetIdleTracking`) yang memulakan
 *      sesi baharu.
 *
 * Tambahan: aktiviti yang tiba SELEPAS tempoh tamat (cth. sentuhan yang
 * diproses sebelum acara AppState 'active') tidak menghidupkan semula sesi —
 * ia terus mencetuskan log keluar.
 *
 * Setiap titik keputusan dilog dengan tag `[IdleTimer]` — kelihatan dalam
 * build release melalui `adb logcat -s ReactNativeJS`.
 */

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

export const IDLE_MESSAGE = 'Sesi tamat kerana tidak aktif. Sila log masuk semula.';

/** Satu nilai kecil tanpa chunk, supaya boleh ditulis secara synchronous. */
const STORAGE_KEY = 'mysaff.idle.last-activity';

/** Format lama (chunk async) — dibuang sekali pada permulaan proses. */
const LEGACY_KEYS = ['mysaff.last-activity', 'mysaff.last-activity.0'];

/** Tulis ke storan paling kerap sekali seminit — SecureStore bukan untuk setiap sentuhan. */
const PERSIST_INTERVAL_MS = 60 * 1000;

/** Had menunggu pembatalan sesi di pelayan; sesi tempatan sudah dibuang lebih awal. */
const SIGN_OUT_TIMEOUT_MS = 8000;

let lastActivity = Date.now();
let lastPersisted = 0;
/** `true` bila `lastActivity` sudah mewakili sesi dalam proses ini. */
let loaded = false;
/** Ditetapkan oleh skrin log masuk: pemasangan seterusnya ialah sesi baharu. */
let freshSession = false;
let expiring = false;

function log(message: string, ...details: unknown[]): void {
  console.log('[IdleTimer] ' + message, ...details);
}

function stamp(at: number): string {
  return at > 0 ? new Date(at).toISOString() + ' (' + at + ')' : 'tiada';
}

function seconds(ms: number): string {
  return Math.round(ms / 1000) + 's';
}

function writeStored(at: number, reason: string): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage?.setItem(STORAGE_KEY, String(at));
    } else {
      SecureStore.setItem(STORAGE_KEY, String(at));
    }
    lastPersisted = Date.now();
    log('tulis cap masa [' + reason + ']: ' + stamp(at));
  } catch (error) {
    log('GAGAL tulis cap masa [' + reason + ']', error);
  }
}

function readStored(): number | null {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof window !== 'undefined'
          ? (window.localStorage?.getItem(STORAGE_KEY) ?? null)
          : null
        : SecureStore.getItem(STORAGE_KEY);
    const value = Number(raw);
    return raw !== null && Number.isFinite(value) && value > 0 ? value : null;
  } catch (error) {
    log('GAGAL baca cap masa', error);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tamat masa ' + ms + 'ms')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Web: tab lain dalam pelayar yang sama berkongsi SATU sesi (localStorage), dan
 * log keluar di satu tab disebarkan ke semua tab oleh Supabase. Tanpa ini, tab
 * yang dibiarkan terbuka di belakang akan tamat tempoh dan melog keluar tab
 * yang sedang digunakan. Setiap tab yang aktif menulis cap masa sekurang-
 * kurangnya sekali seminit, jadi cap masa tersimpan yang LEBIH BARU daripada
 * ingatan tab ini ialah aktiviti di tab lain.
 */
function adoptOtherTabActivity(now: number): void {
  if (Platform.OS !== 'web' || !loaded) return;
  const stored = readStored();
  if (stored !== null && stored > lastActivity && stored <= now) {
    log('aktiviti di tab lain: ' + stamp(stored));
    lastActivity = stored;
  }
}

export function reportActivity(): void {
  const now = Date.now();
  if (now - lastActivity >= IDLE_TIMEOUT_MS) adoptOtherTabActivity(now);

  // Tempoh sudah tamat: sentuhan ini tidak boleh memanjangkan sesi yang sepatutnya sudah ditutup.
  if (loaded && !freshSession && now - lastActivity >= IDLE_TIMEOUT_MS) {
    log('aktiviti selepas tempoh tamat (elapsed ' + seconds(now - lastActivity) + ') — tidak dikira');
    void expireSession('aktiviti-lewat');
    return;
  }

  lastActivity = now;
  if (loaded && now - lastPersisted >= PERSIST_INTERVAL_MS) writeStored(now, 'aktiviti');
}

/**
 * Dipanggil oleh skrin log masuk: tiada sesi bermakna cap masa tersimpan sudah
 * tidak bermakna, dan sesi seterusnya bermula dari saat log masuk.
 */
export function resetIdleTracking(): void {
  freshSession = true;
  lastActivity = Date.now();
  writeStored(0, 'reset');
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

async function expireSession(reason: string): Promise<void> {
  if (expiring) return;
  expiring = true;

  log('KEPUTUSAN: log keluar [' + reason + ']');
  resetIdleTracking();
  setAuthNotice(IDLE_MESSAGE);

  // UI dahulu — tidak menunggu rangkaian yang mungkin tergantung selepas lama di latar.
  forceSignedOut();

  try {
    const { error } = await withTimeout(signOutFromDevice(), SIGN_OUT_TIMEOUT_MS);
    if (error) throw error;
    log('signOut selesai');
  } catch (error) {
    log('signOut gagal/tamat masa — buang sesi tempatan terus', error);
    await withTimeout(clearLocalSession(), SIGN_OUT_TIMEOUT_MS).catch((caught: unknown) =>
      log('clearLocalSession belum selesai (sesi storan sudah dibuang)', caught),
    );
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

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = (reason: string) => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (cancelled) return;

      adoptOtherTabActivity(Date.now());
      const elapsed = Date.now() - lastActivity;
      log(
        'semak [' + reason + ']: aktiviti terakhir ' + stamp(lastActivity) +
          ', elapsed ' + seconds(elapsed) + ' / had ' + seconds(IDLE_TIMEOUT_MS),
      );

      if (elapsed >= IDLE_TIMEOUT_MS) {
        void expireSession(reason);
        return;
      }

      log('KEPUTUSAN: kekal log masuk, baki ' + seconds(IDLE_TIMEOUT_MS - elapsed));
      timer = setTimeout(() => check('pemasa'), IDLE_TIMEOUT_MS - elapsed);
    };

    const now = Date.now();
    if (freshSession) {
      freshSession = false;
      lastActivity = now;
      log('pasang: log masuk baharu');
    } else if (!loaded) {
      const stored = readStored();
      // Cap masa "masa depan" (jam peranti diundur) tidak boleh memanjangkan sesi.
      lastActivity = stored === null ? now : Math.min(stored, now);
      log('pasang: proses baharu, cap masa tersimpan ' + stamp(stored ?? 0) + (stored === null ? ' — anggap aktif sekarang' : ''));
      if (Platform.OS !== 'web') {
        LEGACY_KEYS.forEach((key) => void SecureStore.deleteItemAsync(key).catch(() => undefined));
      }
    } else {
      log('pasang semula dalam proses sama — kekalkan aktiviti terakhir');
    }
    loaded = true;
    writeStored(lastActivity, 'pasang');
    check('pasang');

    // Web: react-native-web memetakan AppState kepada `document.visibilitychange` —
    // tab di latar = 'background', kembali ke tab = 'active'.
    const appState = AppState.addEventListener('change', (state) => {
      log('AppState -> ' + state);
      if (state === 'active') check('kembali-aktif');
      else writeStored(lastActivity, 'latar-' + state);
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

  // Navigasi antara skrin ialah aktiviti. Diisytihar SELEPAS effect di atas supaya
  // cap masa sudah dimuatkan sebelum navigasi pertama dinilai.
  useEffect(() => {
    if (active) reportActivity();
  }, [active, pathname]);
}
