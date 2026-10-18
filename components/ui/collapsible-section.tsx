import { Ionicons } from '@expo/vector-icons';
import { Children, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useHubSearch } from '@/lib/hub-search';
import { useColors } from '@/lib/theme';

type Props = {
  title: string;
  caption?: string;
  /**
   * Bilangan pada kepala seksyen — medan berisi dalam borang, atau kad yang ada
   * di dalam hub. Memberi sebab untuk membuka tanpa perlu membukanya.
   */
  count?: number;
  /** Lencana merah (mis. maklum balas belum dibaca) supaya kelihatan walaupun seksyen tertutup. */
  alert?: number;
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
  alert = 0,
  defaultOpen = false,
  variant = 'card',
  children,
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);
  const plain = variant === 'plain';

  /*
    Carian Hub Admin (lib/hub-search): bila ada kata carian, seksyen dibuka paksa dan hanya kad
    (`ActionRow` — anak yang mempunyai prop `title`) yang sepadan dengan tajuk/subtitle dipaparkan.
    Seksyen tanpa padanan disembunyikan. Anak yang bukan kad bertajuk (cth. seksyen naqib) dikekalkan.
    Tanpa kata carian (lalai) tiada apa berubah.
  */
  const query = useHubSearch().trim().toLowerCase();
  let shownChildren: ReactNode = children;
  let searching = false;
  if (query) {
    searching = true;
    const titleHit = title.toLowerCase().includes(query);
    if (!titleHit) {
      const kept = Children.toArray(children).filter((child) => {
        if (!isValidElement(child)) return false;
        const props = (child as ReactElement<{ title?: unknown; subtitle?: unknown }>).props;
        if (typeof props.title !== 'string') return true;
        const haystack = (props.title + ' ' + (typeof props.subtitle === 'string' ? props.subtitle : '')).toLowerCase();
        return haystack.includes(query);
      });
      if (kept.length === 0) return null;
      shownChildren = kept;
    }
  }
  const isOpen = open || searching;

  return (
    <View className={plain ? '' : 'overflow-hidden rounded-card border border-line bg-surface'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setOpen((current) => !current)}
        className={`flex-row items-center gap-4 active:opacity-70 ${plain ? 'py-2' : 'p-card'}`}>
        <View className="flex-1">
          <Text className={plain ? 'text-lg font-bold text-ink' : 'text-base font-semibold text-ink'}>{title}</Text>
          {caption ? <Text className="mt-0.5 text-sm text-ink-muted">{caption}</Text> : null}
        </View>

        {alert > 0 ? (
          <View
            accessibilityLabel={alert + ' belum dibaca'}
            className="min-w-[22px] items-center rounded-pill bg-negative px-1.5 py-1">
            <Text className="text-xs font-bold text-white">{alert > 99 ? '99+' : alert}</Text>
          </View>
        ) : null}

        {count ? (
          <View className="rounded-pill bg-primary-soft px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{count}</Text>
          </View>
        ) : null}

        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
      </Pressable>

      {isOpen ? (
        <View className={plain ? 'gap-4 pt-3' : 'gap-4 border-t border-line p-card'}>{shownChildren}</View>
      ) : null}
    </View>
  );
}
