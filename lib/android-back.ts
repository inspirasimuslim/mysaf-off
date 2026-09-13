import { useFocusEffect, useNavigationContainerRef, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Butang back Android (fizikal atau gesture) selepas log masuk.
 *
 * Tanpa pengendali ini, back mengikut navigator paling dalam dan akhirnya
 * menutup app dari mana-mana tab — termasuk dari Pembayaran, terus tanpa
 * melalui Utama. Peraturannya:
 *
 *   1. Skrin gate (semakan status, disekat, tempoh tamat, paksa tukar kata
 *      laluan) — back DISEKAT. Gate bukan sesuatu yang boleh dilangkau.
 *   2. Tab akar selain Utama (Pembayaran, Scan, Ahli, Profil) — ke Utama.
 *   3. Skrin dalam (Yuran, Tetapan, skrin admin, ...) — ikut stack dan
 *      sejarah tab biasa, sehingga habis; bila tiada sejarah langsung
 *      (pautan dibuka terus), ke Utama.
 *   4. Utama — dialog sahkan keluar (`useAndroidExitPrompt` di Dashboard).
 *
 * iOS dan web tiada butang back sistem yang sama, jadi kedua-dua hook tidak
 * berbuat apa-apa di sana.
 *
 * Skrin log masuk berada di luar `(app)`, jadi pengendali ini tidak aktif di
 * situ: back mengikut kelakuan lalai Android dan menutup app.
 */

const HOME_TAB = 'dashboard';

/** Tab yang kelihatan dalam bar tab, selain Utama. */
const ROOT_TABS = new Set(['pembayaran', 'usrah-scan', 'ahli', 'profil']);

type RouteLike = { name: string; state?: StateLike };
type StateLike = { index?: number; routes: RouteLike[]; history?: unknown[] };

/** State navigator Tabs di bawah `(app)`, atau `null` bila belum dipasang. */
function appTabs(root: StateLike | undefined): StateLike | null {
  return root?.routes.find((route) => route.name === '(app)')?.state ?? null;
}

/**
 * Dipanggil SEKALI dalam `app/(app)/_layout.tsx`, sebelum mana-mana return awal,
 * supaya ia aktif pada skrin gate juga.
 *
 * Keadaan navigasi dibaca ketika butang ditekan dan bukan dilanggan: melanggan
 * laluan akan merender semula layout — dan seluruh bar tab — pada setiap
 * navigasi, demi satu nilai yang hanya diperlukan ketika back ditekan.
 */
export function useAndroidBackNavigation(blocked: boolean): void {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const blockedRef = useRef(blocked);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (blockedRef.current) return true;

      const root = navigationRef.isReady() ? (navigationRef.getRootState() as unknown as StateLike) : undefined;
      const tabs = appTabs(root);
      const focused = tabs?.routes[tabs.index ?? 0];

      // Belum ada state untuk dibaca — biar kelakuan lalai navigasi.
      if (!tabs || !focused) return false;

      /*
        Utama diserahkan kepada pendengar Dashboard (`useAndroidExitPrompt`).
        `false` dan bukan `true`: BackHandler meneruskan kepada pendengar lain
        sehingga satu mengambilnya, jadi susunan pendaftaran kedua-dua pendengar
        tidak mengubah hasilnya.
      */
      if (focused.name === HOME_TAB) return false;

      if (ROOT_TABS.has(focused.name)) {
        router.navigate('/(app)/dashboard');
        return true;
      }

      // Skrin dalam: stack bersarang (admin) dahulu, kemudian sejarah tab.
      const nestedIndex = focused.state?.index ?? 0;
      const tabHistory = tabs.history?.length ?? 0;
      if (nestedIndex > 0 || tabHistory > 1) return false;

      router.navigate('/(app)/dashboard');
      return true;
    });

    return () => subscription.remove();
  }, [navigationRef, router]);
}

/**
 * Dialog sahkan keluar di Utama.
 *
 * Didaftar pada FOKUS dan bukan semasa dipasang: tab kekal dipasang selepas
 * pengguna beralih ke tab lain, dan pendengar yang kekal akan membuka dialog
 * keluar dari Pembayaran.
 *
 * Bila dialog terbuka, back ditangkap oleh `Modal` (`onRequestClose` →
 * Batal), bukan oleh BackHandler.
 */
export function useAndroidExitPrompt() {
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setVisible(true);
        return true;
      });

      return () => subscription.remove();
    }, []),
  );

  const cancel = useCallback(() => setVisible(false), []);

  const exit = useCallback(() => {
    setVisible(false);
    BackHandler.exitApp();
  }, []);

  return { visible, cancel, exit };
}
