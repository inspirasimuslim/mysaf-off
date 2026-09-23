import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { BIRTHDAY_GOLD, Colors } from '@/constants/theme';
import { MONTH_NAMES } from '@/types/database';

/** "hari ini" / "semalam" / "3 hari lalu" dalam seminggu; selepas itu tarikh penuh. */
export function formatSelfUpdated(iso: string): string {
  const then = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86_400_000);

  if (days <= 0) return 'hari ini';
  if (days === 1) return 'semalam';
  if (days < 7) return `${days} hari lalu`;
  return `${then.getDate()} ${MONTH_NAMES[then.getMonth()]} ${then.getFullYear()}`;
}

/*
  Dua bentuk dengan berat visual berbeza. Sudah pernah dikemas kini: satu baris
  kelabu, maklumat sahaja. Belum pernah: jalur emas lembut yang boleh ditekan —
  galakan, bukan ralat, jadi bukan merah. Ia duduk betul-betul di atas tab, jadi
  menekannya cukup dengan membuka tab "Maklumat Diri" di bawahnya.
 *
 * Paparan AHLI SENDIRI (profil.tsx) — lihat `SelfUpdateAdminNote` untuk
 * paparan panel Admin (read-only, tanpa galakan).
 */
export function SelfUpdateStatus({ value, onPress }: { value: string | null; onPress: () => void }) {
  if (value) {
    return (
      <View className="flex-row items-center justify-center gap-1.5">
        <Ionicons name="time-outline" size={14} color={Colors.inkFaint} />
        <Text className="text-xs text-ink-muted">Kemaskini terakhir: {formatSelfUpdated(value)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-pill px-4 py-2.5 active:opacity-70"
      style={{ backgroundColor: Colors.warnSoft }}>
      <Ionicons name="create-outline" size={16} color={BIRTHDAY_GOLD} />
      <Text className="flex-1 text-sm font-semibold text-ink">Sila kemaskini maklumat diri anda</Text>
      <Ionicons name="chevron-forward" size={16} color={BIRTHDAY_GOLD} />
    </Pressable>
  );
}

/**
 * Paparan panel ADMIN (ahli-detail.tsx) — read-only, satu baris kelabu neutral
 * dalam KEDUA-DUA keadaan. Berbeza daripada `SelfUpdateStatus`: bila `null`,
 * ini BUKAN galakan untuk ahli bertindak (admin tidak boleh "kemaskini bagi
 * pihak" ahli) — sekadar maklumat jejak automatik untuk admin.
 */
export function SelfUpdateAdminNote({ value }: { value: string | null }) {
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      <Ionicons name="time-outline" size={14} color={Colors.inkFaint} />
      <Text className="text-xs text-ink-muted">
        {value ? 'Kemaskini terakhir oleh ahli: ' + formatSelfUpdated(value) : 'Belum pernah dikemaskini oleh ahli'}
      </Text>
    </View>
  );
}
