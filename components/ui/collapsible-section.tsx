import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  title: string;
  caption?: string;
  /**
   * Bilangan pada kepala seksyen — medan berisi dalam borang, atau kad yang ada
   * di dalam hub. Memberi sebab untuk membuka tanpa perlu membukanya.
   */
  count?: number;
  defaultOpen?: boolean;
  /**
   * `card` membungkus seksyen dalam kad (borang). `plain` hanya kepala tanpa
   * bingkai, untuk kandungan yang sudah berupa kad sendiri seperti `ActionRow`
   * — kad bertindih kad kelihatan berat.
   */
  variant?: 'card' | 'plain';
  children: ReactNode;
};

/**
 * Seksyen yang boleh ditutup, tertutup secara lalai.
 *
 * Setiap seksyen menyimpan keadaannya sendiri: membuka "Pekerjaan" tidak
 * menutup "Pendidikan", kerana admin selalunya membandingkan dua bahagian
 * serentak.
 *
 * Kandungan dipasang hanya apabila dibuka — borang ahli mempunyai puluhan
 * medan, dan memasang kesemuanya sekali gus melambatkan skrin tanpa sebab.
 */
export function CollapsibleSection({
  title,
  caption,
  count,
  defaultOpen = false,
  variant = 'card',
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const plain = variant === 'plain';

  return (
    <View className={plain ? '' : 'overflow-hidden rounded-card border border-line bg-surface'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className={`flex-row items-center gap-4 active:opacity-70 ${plain ? 'py-2' : 'p-card'}`}>
        <View className="flex-1">
          <Text className={plain ? 'text-lg font-bold text-ink' : 'text-base font-semibold text-ink'}>{title}</Text>
          {caption ? <Text className="mt-0.5 text-sm text-ink-muted">{caption}</Text> : null}
        </View>

        {count ? (
          <View className="rounded-pill bg-primary-soft px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{count}</Text>
          </View>
        ) : null}

        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.inkMuted} />
      </Pressable>

      {open ? (
        <View className={plain ? 'gap-4 pt-3' : 'gap-4 border-t border-line p-card'}>{children}</View>
      ) : null}
    </View>
  );
}
