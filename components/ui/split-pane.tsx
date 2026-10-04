import { createContext, useContext, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Benar bila skrin butiran dipasang di panel kanan (mod desktop) dan bukan sebagai
 * skrin penuh. `Screen`, `ScreenHeader` dan `LoadingScreen` menyesuaikan diri —
 * kod butiran itu sendiri tidak berubah.
 */
const EmbeddedContext = createContext(false);

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext);
}

type Props = {
  /** Kepala skrin (`ScreenHeader`) di atas kedua-dua panel. */
  header: ReactNode;
  /** Panel kiri — ditatal berasingan. */
  left: ReactNode;
  /** Panel kanan — butiran rekod terpilih, atau keadaan kosong. */
  right: ReactNode;
};

/**
 * Susun atur panel berkembar mod DESKTOP: senarai di kiri, butiran di kanan,
 * masing-masing ditatal sendiri (macam klien e-mel).
 */
export function SplitPane({ header, left, right }: Props) {
  return (
    <View className="flex-1 bg-background">
      <View className="mx-4">{header}</View>
      <View className="mt-4 flex-1 flex-row border-t border-line">
        <View style={{ width: '40%', minWidth: 360 }} className="border-r border-line">
          <ScrollView showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            {left}
          </ScrollView>
        </View>
        <View className="flex-1">
          <EmbeddedContext.Provider value>{right}</EmbeddedContext.Provider>
        </View>
      </View>
    </View>
  );
}

/** Keadaan kosong panel kanan — belum ada rekod dipilih. */
export function DetailPlaceholder({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <Ionicons name={icon} size={40} color={Colors.inkFaint} />
      <Text className="text-center text-base text-ink-muted">{text}</Text>
    </View>
  );
}
