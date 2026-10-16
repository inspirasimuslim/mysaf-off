import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { getBiometricSupport, isBiometricEnabled, type BiometricSupport } from '@/lib/biometrics';
import { getItem, setItem } from '@/lib/secure-storage';
import { useColors } from '@/lib/theme';

const DISMISSED_KEY = 'mysaff.biometricnotice.dismissed';

/**
 * Notis Utama untuk pengguna yang belum menetapkan log masuk biometrik.
 *  - Peranti sokong & sudah daftar biometrik -> ajak aktifkan (ketik -> Tetapan).
 *  - Peranti ada pengimbas tetapi belum daftar -> ajak daftar dalam tetapan peranti.
 *  - Peranti TIADA pengimbas -> lambang pangkah (makluman sahaja).
 * Ditutup sekali -> tidak muncul lagi pada peranti ini (storan tempatan, bukan DB).
 */
export function BiometricNotice() {
  const router = useRouter();
  const colors = useColors();
  const [support, setSupport] = useState<BiometricSupport | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    void (async () => {
      try {
        const [dismissed, enabled] = await Promise.all([getItem(DISMISSED_KEY), isBiometricEnabled()]);
        if (dismissed === '1' || enabled) return;
        const next = await getBiometricSupport();
        if (active) setSupport(next);
      } catch {
        // Notis sekadar tip — abaikan ralat storan/peranti.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!support) return null;

  const unsupported = !support.hasHardware;

  const dismiss = () => {
    setSupport(null);
    void setItem(DISMISSED_KEY, '1').catch(() => undefined);
  };

  const title = unsupported
    ? 'Peranti ini tiada biometrik'
    : 'Tetapkan log masuk ' + support.label;
  const body = unsupported
    ? 'Log masuk biometrik tidak tersedia pada peranti ini. Anda masih boleh log masuk dengan kata laluan.'
    : support.isEnrolled
      ? 'Aktifkan sekarang supaya tidak perlu taip kata laluan setiap kali. Ketik untuk tetapkan.'
      : 'Daftarkan ' + support.label.toLowerCase() + ' dalam tetapan peranti dahulu, kemudian aktifkan di Tetapan.';

  return (
    <Pressable
      accessibilityRole={unsupported ? 'text' : 'button'}
      accessibilityLabel={title}
      disabled={unsupported}
      onPress={() => {
        router.push('/(app)/tetapan');
      }}
      className="rounded-card border border-line bg-surface p-3 active:opacity-70">
      <View className="flex-row items-center gap-3">
        <Ionicons
          name={unsupported ? 'close-circle' : 'finger-print'}
          size={26}
          color={unsupported ? colors.negative : colors.primary}
        />
        <View className="flex-1">
          <Text className="text-sm font-bold text-ink">{title}</Text>
          <Text className="text-xs leading-4 text-ink-muted">{body}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Tutup" hitSlop={10} onPress={dismiss}>
          <Ionicons name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}
