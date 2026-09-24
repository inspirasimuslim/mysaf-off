import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { usePermissions } from '@/lib/permissions';
import { useIsDesktop } from '@/lib/use-desktop';

type Props = {
  title: string;
  /** Baris kecil di atas tajuk — contoh: "Assalamualaikum,". */
  eyebrow?: string;
  /**
   * Baris di bawah tajuk. Teks biasa pada kebanyakan skrin; skrin Utama
   * memberinya elemen (chip kedudukan) di tempat emel pernah berada.
   */
  subtitle?: ReactNode;
  /**
   * Elemen di kiri teks tajuk — contoh: avatar di Dashboard. Skrin yang tidak
   * memberinya tidak mendapat apa-apa di situ.
   */
  leading?: ReactNode;
  /** Papar anak panah kembali di kiri bila diberi — untuk skrin dalam (bukan tab). */
  onBackPress?: () => void;
};

/**
 * Kepala skrin hijau forest dengan sudut bawah membulat.
 *
 * Dua pintu tetap di kanan, pada SETIAP skrin yang memakai kepala ini: Hub Admin
 * (perisai) di kiri dan Tetapan (gear) di kanan. Kedua-duanya tinggal di sini dan
 * bukan dihantar oleh setiap skrin, supaya tiada skrin boleh terlupa — sebelum
 * ini perisai hanya ada di Dashboard dan gear hanya di Profil.
 *
 * `router.navigate` dan bukan `push`: kedua-dua destinasi ialah tab tersembunyi,
 * dan mengetuk perisai dari dalam stack admin patut kembali ke Hub, bukan
 * menimbun salinan Hub kedua di atasnya.
 */
export function ScreenHeader({ title, eyebrow, subtitle, leading, onBackPress }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAdmin, isActiveNaqib } = usePermissions();
  const desktop = useIsDesktop();

  return (
    <View
      className={`bg-primary ${desktop ? 'mt-6 rounded-2xl px-6 pb-5' : 'rounded-b-[28px] px-gutter pb-7'}`}
      style={{ paddingTop: desktop ? 20 : insets.top + 18 }}>
      <View className="flex-row items-center gap-4">
        {onBackPress ? <HeaderIcon icon="chevron-back" label="Kembali" onPress={onBackPress} /> : null}

        {leading ?? null}

        <View className="flex-1">
          {eyebrow ? <Text className="text-sm text-white/70">{eyebrow}</Text> : null}
          <Text className="mt-0.5 text-2xl font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text className="mt-1 text-sm text-white/70">{subtitle}</Text>
          ) : subtitle ? (
            <View className="mt-1.5 flex-row">{subtitle}</View>
          ) : null}
        </View>

        {/* Mod desktop: Admin & Tetapan tinggal di sidebar. */}
        {desktop ? null : (
        <View className="flex-row items-center gap-2">
          {/*
            Perisai tidak wujud langsung dalam pokok komponen untuk ahli biasa —
            bukan sekadar disembunyikan. `isAdmin()` merangkumi Super Admin.
            `isActiveNaqib()` turut dibenarkan: naqib yang bukan admin lain
            masih perlukan pintu ini untuk sampai ke Panel Naqibnya sendiri
            (Hub Admin memaparkan seksyen "Kumpulan Usrah Saya" sahaja
            baginya — lihat `admin/index.tsx`). Ikon perisai sengaja berbeza
            daripada gear supaya dua pintu itu tidak dikelirukan.
          */}
          {isAdmin() || isActiveNaqib() ? (
            <HeaderIcon icon="shield-half-outline" label="Hub Admin" onPress={() => router.navigate('/(app)/admin')} />
          ) : null}
          <HeaderIcon icon="settings-outline" label="Tetapan" onPress={() => router.navigate('/(app)/tetapan')} />
        </View>
        )}
      </View>
    </View>
  );
}

function HeaderIcon({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Label pembaca skrin — ikon sahaja tidak mencukupi. */
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70">
      <Ionicons name={icon} size={20} color={Colors.white} />
    </Pressable>
  );
}
