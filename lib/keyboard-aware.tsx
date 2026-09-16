import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

/**
 * Pastikan medan yang sedang ditaip kekal kelihatan di atas papan kekunci.
 *
 * KENAPA TIDAK KeyboardAvoidingView SAHAJA
 *   - Android: Expo SDK 54+ sentiasa edge-to-edge, jadi `adjustResize` tidak lagi
 *     mengecilkan tetingkap bila papan kekunci muncul. ScrollView tidak berubah
 *     saiz, tiada ruang untuk ditatal, dan Android tidak menatal ke medan fokus.
 *   - iOS: ScrollView React Native tidak pernah menatal ke medan fokus sendiri.
 *   - `react-native-keyboard-controller` menyelesaikan kedua-duanya tetapi ialah
 *     modul natif — tidak dimuatkan dalam Expo Go dan memerlukan build baharu.
 *
 * CARA IA BERFUNGSI (JS tulen, kedua-dua platform)
 *   1. `TextField` mendaftar bekasnya sendiri (label + kotak + ralat) bila
 *      difokus, melalui konteks bekas tatal terdekat.
 *   2. Bila papan kekunci muncul, bekas mengukur BERAPA BANYAK dirinya
 *      ditindih (bawah bekas − atas papan kekunci). Nilai itu ditambah sebagai
 *      padding bawah — jadi jika tetingkap SUDAH dikecilkan (atau
 *      KeyboardAvoidingView di luar sudah mengecilkannya), tindihannya 0 dan
 *      tiada ruang kosong berganda.
 *   3. Bekas menatal secukupnya supaya BAWAH medan (bukan baris pertamanya)
 *      berada `MARGIN` di atas papan kekunci — penting untuk medan multiline
 *      seperti Alamat. Medan multiline yang membesar semasa menaip diulang.
 *
 * Hanya medan yang DIDAFTAR diurus. Bekas tidak menyentuh medan dalam Modal lain
 * (Modal ialah tetingkap berasingan dengan koordinat berbeza).
 */

type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

type Frame = { y: number; height: number };

/** Ruang antara bawah medan dan atas papan kekunci — termasuk bar cadangan/toolbar. */
const MARGIN = 24;
/** Tunggu susun atur selepas padding berubah sebelum mengukur semula. */
const LAYOUT_DELAY_MS = 60;

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

function measure(node: Measurable | null | undefined): Promise<Frame | null> {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    node.measureInWindow((_x, y, _width, height) => resolve(Number.isFinite(y) ? { y, height } : null));
  });
}

type KeyboardAwareApi = {
  /** Medan difokus (atau membesar): daftar dan tatal jika perlu. */
  focus: (target: Measurable | null) => void;
  /** Medan kehilangan fokus. */
  blur: (target: Measurable | null) => void;
};

const KeyboardAwareContext = createContext<KeyboardAwareApi | null>(null);

export const KeyboardAwareProvider = KeyboardAwareContext.Provider;

/** Untuk `TextField`: `null` bila medan tidak berada dalam bekas yang diurus. */
export function useKeyboardAwareField(): KeyboardAwareApi | null {
  return useContext(KeyboardAwareContext);
}

/**
 * @param scrollRef ScrollView yang akan ditatal.
 * @param frameRef  Elemen yang tindihannya dengan papan kekunci diukur untuk
 *                  padding. Lalai: ScrollView itu sendiri. Helaian modal
 *                  menghantar akar skrin penuhnya, kerana padding dikenakan di situ.
 */
export function useKeyboardAware(
  scrollRef: RefObject<ScrollView | null>,
  frameRef?: RefObject<Measurable | null>,
) {
  const [inset, setInset] = useState(0);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const target = useRef<Measurable | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((run: () => void, delay = LAYOUT_DELAY_MS) => {
    timers.current.push(setTimeout(run, delay));
  }, []);

  const scrollIntoView = useCallback(async () => {
    const top = keyboardTop.current;
    const scroll = scrollRef.current as unknown as (ScrollView & Measurable) | null;
    if (top === null || !scroll || !target.current) return;

    const [frame, field] = await Promise.all([measure(scroll), measure(target.current)]);
    if (!frame || !field) return;

    const visibleBottom = Math.min(frame.y + frame.height, top);
    const overflow = field.y + field.height + MARGIN - visibleBottom;
    if (overflow > 1) {
      scroll.scrollTo({ y: Math.max(0, offset.current + overflow), animated: true });
    }
  }, [scrollRef]);

  const applyInset = useCallback(async () => {
    const top = keyboardTop.current;
    if (top === null || !target.current) return;
    const frameNode = frameRef?.current ?? (scrollRef.current as unknown as Measurable | null);
    const frame = await measure(frameNode);
    if (!frame) return;
    setInset(Math.max(0, Math.round(frame.y + frame.height - top)));
    later(() => void scrollIntoView());
  }, [frameRef, later, scrollIntoView, scrollRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const show = Keyboard.addListener(SHOW_EVENT, (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      // onFocus medan dan acara papan kekunci tidak dijamin tiba mengikut urutan.
      later(() => void applyInset());
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => {
      keyboardTop.current = null;
      setInset(0);
    });

    const pending = timers.current;
    return () => {
      show.remove();
      hide.remove();
      pending.forEach(clearTimeout);
    };
  }, [applyInset, later]);

  const api = useMemo<KeyboardAwareApi>(
    () => ({
      focus: (node) => {
        if (!node) return;
        const changed = target.current !== node;
        target.current = node;
        if (keyboardTop.current === null) return;
        // Papan kekunci sudah terbuka (bertukar medan, atau multiline membesar).
        if (changed) later(() => void applyInset());
        else void scrollIntoView();
      },
      blur: (node) => {
        if (target.current === node) target.current = null;
      },
    }),
    [applyInset, later, scrollIntoView],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { inset, onScroll, api };
}
