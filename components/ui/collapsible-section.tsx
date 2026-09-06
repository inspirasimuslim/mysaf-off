import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  title: string;
  caption?: string;
  /** Bilangan medan berisi — memberi sebab untuk membuka tanpa perlu membukanya. */
  filled?: number;
  children: ReactNode;
};

/**
 * Seksyen borang yang boleh ditutup, tertutup secara lalai.
 *
 * Setiap seksyen menyimpan keadaannya sendiri: membuka "Pekerjaan" tidak
 * menutup "Pendidikan", kerana admin selalunya membandingkan dua bahagian
 * serentak.
 *
 * Kandungan dipasang hanya apabila dibuka — borang ahli mempunyai puluhan
 * medan, dan memasang kesemuanya sekali gus melambatkan skrin tanpa sebab.
 */
export function CollapsibleSection({ title, caption, filled, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center gap-4 p-card active:opacity-70">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{title}</Text>
          {caption ? <Text className="mt-0.5 text-sm text-ink-muted">{caption}</Text> : null}
        </View>

        {filled ? (
          <View className="rounded-pill bg-primary-soft px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{filled}</Text>
          </View>
        ) : null}

        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.inkMuted} />
      </Pressable>

      {open ? <View className="gap-4 border-t border-line p-card">{children}</View> : null}
    </View>
  );
}
