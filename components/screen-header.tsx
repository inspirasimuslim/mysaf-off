import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

/** Ikon tindakan tambahan di kanan kepala skrin. */
export type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Label pembaca skrin — ikon sahaja tidak mencukupi. */
  label: string;
  onPress: () => void;
};

type Props = {
  title: string;
  /** Baris kecil di atas tajuk — contoh: "Assalamualaikum,". */
  eyebrow?: string;
  subtitle?: string;
  /**
   * Ikon tindakan di kanan. Pemanggil yang menentukan sama ada ia wujud, jadi
   * skrin boleh meninggalkannya SEPENUHNYA daripada pokok komponen apabila
   * pengguna tiada kebenaran — bukan sekadar menyembunyikannya.
   */
  action?: HeaderAction;
  /** Papar anak panah kembali di kiri bila diberi — untuk skrin dalam (bukan tab). */
  onBackPress?: () => void;
};

/** Kepala skrin hijau forest dengan sudut bawah membulat. */
export function ScreenHeader({ title, eyebrow, subtitle, action, onBackPress }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="rounded-b-[28px] bg-primary px-gutter pb-7" style={{ paddingTop: insets.top + 18 }}>
      <View className="flex-row items-center gap-4">
        {onBackPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            hitSlop={10}
            onPress={onBackPress}
            className="h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70">
            <Ionicons name="chevron-back" size={20} color={Colors.white} />
          </Pressable>
        ) : null}

        <View className="flex-1">
          {eyebrow ? <Text className="text-sm text-white/70">{eyebrow}</Text> : null}
          <Text className="mt-0.5 text-2xl font-bold text-white" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text className="mt-1 text-sm text-white/70">{subtitle}</Text> : null}
        </View>

        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={10}
            onPress={action.onPress}
            className="h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70">
            <Ionicons name={action.icon} size={20} color={Colors.white} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
