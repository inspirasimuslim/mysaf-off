import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/** Keluar app lebih lama daripada ini -> bila kembali, paparkan Utama (dashboard). */
export const RETURN_HOME_AFTER_MS = 5 * 60 * 1000;

/**
 * Bila ahli meninggalkan app (latar belakang) lebih daripada 5 minit, kembali
 * ke app memaparkan tab Utama dan bukan skrin terakhir yang dibuka.
 *
 * Cap masa disimpan dalam ingatan sahaja: jika proses dimatikan sistem, app
 * dibuka semula dari awal dan sudah ke Utama dengan sendirinya. Log keluar
 * kerana tidak aktif (`lib/idle-timer.ts`, 2 jam) berasingan dan tidak terjejas.
 *
 * Hanya 'background' dikira meninggalkan app; 'inactive' (iOS: panel notifikasi,
 * pertukaran app) tidak, supaya gangguan sebentar tidak menukar skrin.
 *
 * Pasang sekali di `app/(app)/_layout.tsx`. `active` = ada sesi dan bukan skrin
 * gate (sekatan / tukar kata laluan paksa) — skrin gate tidak patut dilangkau.
 */
export function useReturnToHome(active: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
        return;
      }
      if (state !== 'active' || leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away > RETURN_HOME_AFTER_MS) router.navigate('/(app)/dashboard');
    });

    return () => subscription.remove();
  }, [active, router]);
}
