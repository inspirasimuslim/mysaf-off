import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

type Props = {
  title: string;
  /** Baris kecil di atas tajuk — contoh: "Assalamualaikum,". */
  eyebrow?: string;
  subtitle?: string;
  /** Papar ikon loceng notifikasi di kanan bila diberi. */
  onBellPress?: () => void;
  /** Papar anak panah kembali di kiri bila diberi — untuk skrin dalam (bukan tab). */
  onBackPress?: () => void;
};

/** Kepala skrin hijau forest dengan sudut bawah membulat. */
export function ScreenHeader({ title, eyebrow, subtitle, onBellPress, onBackPress }: Props) {
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

        {onBellPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifikasi"
            hitSlop={10}
            onPress={onBellPress}
            className="h-11 w-11 items-center justify-center rounded-pill bg-white/10 active:opacity-70">
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
