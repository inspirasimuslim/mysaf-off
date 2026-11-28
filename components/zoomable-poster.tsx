import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions, type DimensionValue } from 'react-native';

import { useColors } from '@/lib/theme';

type Props = {
  uri: string;
  label: string;
  /** Lebar bekas (lalai penuh). Tinggi mengikut nisbah. */
  width?: DimensionValue;
  /** Nisbah lebar/tinggi; lalai 3:4 (poster). */
  ratio?: number;
  onLoadRatio?: (ratio: number) => void;
};

/**
 * Poster dipapar PENUH (contain, tidak dipotong) pada nisbah 3:4; ketik untuk
 * paparan besar dalam modal (ketik di mana-mana untuk tutup).
 */
export function ZoomablePoster({ uri, label, width = '100%', ratio = 3 / 4, onLoadRatio }: Props) {
  const colors = useColors();
  const dims = useWindowDimensions();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={label + ' — ketik untuk besarkan'}
        onPress={() => setOpen(true)}
        style={{ width, aspectRatio: ratio }}
        className="overflow-hidden rounded-card border border-line bg-surface active:opacity-80">
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={150}
          onLoad={(loaded) => {
            const { width: w, height: h } = loaded.source;
            if (w > 0 && h > 0) onLoadRatio?.(w / h);
          }}
        />
        <View className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-pill bg-black/55">
          <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup"
          onPress={() => setOpen(false)}
          className="flex-1 items-center justify-center bg-black/90">
          <Image
            source={{ uri }}
            style={{ width: dims.width, height: dims.height * 0.92 }}
            contentFit="contain"
            accessibilityLabel={label}
          />
          <View className="absolute right-4 top-12 h-10 w-10 items-center justify-center rounded-pill bg-black/60">
            <Ionicons name="close" size={22} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
