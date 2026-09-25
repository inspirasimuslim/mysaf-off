import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/ui/notice';

/**
 * Popup keputusan tindakan ("berjaya" / "gagal") yang dikongsi semua skrin.
 *
 * Banner di ATAS halaman tidak kelihatan bila skrin sudah ditatal ke bawah —
 * admin menekan Simpan di hujung borang panjang dan menyangka tiada apa-apa
 * berlaku. Toast terapung di bawah skrin, sentiasa kelihatan, hilang sendiri
 * dan boleh ditutup dengan satu ketukan.
 *
 * Skrin tidak perlu memegang keadaan toast: `ToastBanner` menerima `banner`
 * yang sudah sedia ada dan memaparkannya sebagai toast.
 */

export type ToastTone = 'positive' | 'negative' | 'warn' | 'info';

type ToastState = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  show: (tone: ToastTone, message: string) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Ralat mendapat masa lebih lama untuk dibaca; kejayaan cukup sekejap. */
const DURATION: Record<ToastTone, number> = { positive: 4000, info: 4000, warn: 6000, negative: 6000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity]);

  const show = useCallback(
    (tone: ToastTone, message: string) => {
      if (timer.current) clearTimeout(timer.current);
      counter.current += 1;
      setToast({ id: counter.current, tone, message });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
      timer.current = setTimeout(dismiss, DURATION[tone]);
    },
    [dismiss, opacity],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 88, alignItems: 'center', paddingHorizontal: 16 }}>
          <Animated.View
            style={{
              opacity,
              width: '100%',
              maxWidth: 480,
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}>
            <Pressable accessibilityRole="alert" accessibilityLabel={toast.message} onPress={dismiss}>
              <Notice tone={toast.tone} message={toast.message} />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast mesti digunakan di dalam ToastProvider.');
  return api;
}

/**
 * Gantian terus untuk `<Notice ... />` keputusan tindakan: paparkan sebagai
 * toast sekali setiap kali komponen ini dipasang (iaitu setiap kali `banner`
 * bertukar daripada kosong kepada ada) dan tidak melukis apa-apa di halaman.
 */
export function ToastBanner({ tone, message }: { tone: ToastTone; message: string }) {
  const { show } = useToast();

  useEffect(() => {
    show(tone, message);
  }, [show, tone, message]);

  return null;
}
