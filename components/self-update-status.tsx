import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { BIRTHDAY_GOLD } from '@/constants/theme';
import { useColors } from '@/lib/theme';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

/** Tarikh + masa sebenar, contoh "30 Sep 2026, 11:14 AM" (jam 12 jam, waktu peranti). */
export function formatSelfUpdated(iso: string): string {
  const then = new Date(iso);
  const hours = then.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(then.getMinutes()).padStart(2, '0');
  const meridiem = hours < 12 ? 'AM' : 'PM';
  return `${then.getDate()} ${SHORT_MONTHS[then.getMonth()]} ${then.getFullYear()}, ${hour12}:${minutes} ${meridiem}`;
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
  const colors = useColors();
  if (value) {
    return (
      <View className="flex-row items-center justify-center gap-1.5">
        <Ionicons name="time-outline" size={14} color={colors.inkFaint} />
        <Text className="text-xs text-ink-muted">Kemaskini terakhir: {formatSelfUpdated(value)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-pill px-4 py-2.5 active:opacity-70"
      style={{ backgroundColor: colors.warnSoft }}>
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
  const colors = useColors();
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      <Ionicons name="time-outline" size={14} color={colors.inkFaint} />
      <Text className="text-xs text-ink-muted">
        {value ? 'Kemaskini terakhir oleh ahli: ' + formatSelfUpdated(value) : 'Belum pernah dikemaskini oleh ahli'}
      </Text>
    </View>
  );
}
