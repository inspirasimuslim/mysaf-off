import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';

/**
 * Barisan poster yang boleh ditatal ke tepi.
 *
 * Dikongsi oleh dua seksyen skrin Utama — acara akan datang dan pengumuman —
 * kerana kedua-duanya menjawab soalan yang sama bentuk: "apa yang patut saya
 * tahu, dalam gambar". Menyalinnya menjadi dua komponen bermakna nisbah poster
 * dan jarak kad boleh menyimpang antara dua seksyen yang duduk bersebelahan.
 *
 * Seksyen ini HILANG sepenuhnya apabila tiada apa-apa untuk dipapar. Tajuk
 * dengan ruang kosong di bawahnya memberitahu pengguna bahawa sesuatu tidak
 * berfungsi, dan itu bukan mesej yang patut menyambutnya di skrin pertama.
 */

/** Nisbah 3:4 — bentuk poster A4 yang paling lazim dimuat naik. */
const CARD_WIDTH = 156;

/** Jarak (px) tetikus mesti bergerak sebelum tekanan dikira seretan, bukan ketukan. */
const DRAG_THRESHOLD = 6;

export type PosterItem = {
  id: string;
  title: string;
  /** Baris kecil di bawah tajuk. Tiada baris langsung bila tidak diberi. */
  caption?: string;
  posterUrl: string | null;
};

type Props = {
  title: string;
  caption?: string;
  items: PosterItem[];
  onPress: (id: string) => void;
  /** Lebar kad poster (lalai 156). Tinggi mengikut nisbah 3:4. */
  cardWidth?: number;
  /**
   * Mod desktop: grid 2 lajur × 2 baris yang kelihatan, dengan tatalan menegak
   * DALAM seksyen bila lebih daripada empat item. Lebar kad mengikut lebar
   * bekas, jadi `cardWidth` tidak dipakai.
   */
  grid?: boolean;
  /** Tatal sendiri ke poster seterusnya (berpatah ke awal di hujung). Berhenti sebentar bila disentuh. */
  autoScroll?: boolean;
};

/** Selang antara dua langkah auto-tatal, dan jeda selepas pengguna menyentuh barisan. */
const AUTO_SCROLL_MS = 4000;
const AUTO_PAUSE_MS = 8000;

/**
 * Tatalan mendatar dengan tetikus di web.
 *
 * Di pelayar, bekas `overflow-x: auto` hanya bergerak dengan sentuhan, trackpad
 * atau Shift+roda. Tetikus biasa tidak boleh menyeret, dan roda menatal halaman
 * ke bawah — jadi carousel kelihatan beku. Di sini roda menegak ditukar kepada
 * tatalan mendatar (dilepaskan semula kepada halaman bila sudah di hujung), dan
 * seretan tetikus menggerakkan barisan.
 *
 * Seretan menelan `click` yang menyusul supaya melepaskan tetikus di atas poster
 * tidak membuka poster itu. Sentuhan tidak disentuh — pelayar sudah
 * mengendalikannya. Native tidak menjalankan apa-apa di sini.
 */
export function useWebMouseScroll(ref: RefObject<ScrollView | null>, enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const scrollView = ref.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null;
    const node = scrollView?.getScrollableNode?.();
    if (!node) return;

    const maxScroll = () => node.scrollWidth - node.clientWidth;

    const onWheel = (event: WheelEvent) => {
      // Gerakan mendatar (trackpad, Shift+roda) sudah ditatal oleh pelayar.
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

      const max = maxScroll();
      if (max <= 0) return;

      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const atStart = node.scrollLeft <= 0;
      const atEnd = node.scrollLeft >= max - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

      event.preventDefault();
      node.scrollLeft = Math.max(0, Math.min(max, node.scrollLeft + delta));
    };

    let pointerId: number | null = null;
    let startX = 0;
    let startLeft = 0;
    let dragged = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || maxScroll() <= 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startLeft = node.scrollLeft;
      dragged = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;

      const dx = event.clientX - startX;
      if (!dragged) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        dragged = true;
        /*
          Tangkapan hanya supaya seretan tidak terputus bila tetikus keluar dari
          barisan. Ia boleh gagal ("No active pointer") untuk penunjuk yang
          diemulasi — dan kegagalan itu tidak boleh menghentikan tatalan.
        */
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
          // Teruskan tanpa tangkapan.
        }
        node.style.cursor = 'grabbing';
        node.style.userSelect = 'none';
      }
      node.scrollLeft = startLeft - dx;
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      node.style.cursor = '';
      node.style.userSelect = '';
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Seretan imej asli pelayar (hantu imej) merampas gerakan tetikus.
    const onDragStart = (event: DragEvent) => event.preventDefault();

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('click', onClickCapture, true);
    node.addEventListener('dragstart', onDragStart);

    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('click', onClickCapture, true);
      node.removeEventListener('dragstart', onDragStart);
    };
  }, [ref, enabled]);
}

const GRID_GAP = 12;
/** Ruang tajuk (maks. dua baris) dan kapsyen di bawah poster dalam grid. */
const GRID_TEXT_HEIGHT = 56;

function PosterCell({ item, width, onPress }: { item: PosterItem; width: number; onPress: (id: string) => void }) {
  const posterHeight = Math.round((width * 4) / 3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onPress(item.id)}
      style={{ width }}
      className="active:opacity-70"
    >
      {item.posterUrl ? (
        <Image
          source={{ uri: item.posterUrl }}
          style={{ width, height: posterHeight, borderRadius: 16 }}
          contentFit="cover"
          transition={150}
          accessibilityLabel={'Poster ' + item.title}
        />
      ) : (
        <View
          style={{ width, height: posterHeight, borderRadius: 16 }}
          className="items-center justify-center border border-line bg-primary-tint"
        >
          <Ionicons name="image-outline" size={28} color={Colors.inkFaint} />
        </View>
      )}

      <Text className="mt-2 text-sm font-semibold text-ink" numberOfLines={2}>
        {item.title}
      </Text>
      {item.caption ? (
        <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
          {item.caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Grid dua lajur untuk desktop. Tinggi kawasan kelihatan dihadkan kepada dua
 * baris (empat poster); item selebihnya dicapai dengan tatalan menegak di
 * dalam seksyen, jadi tinggi seksyen tidak bergantung pada bilangan program.
 */
function PosterGrid({ title, caption, items, onPress }: Omit<Props, 'grid' | 'cardWidth'>) {
  const [measured, setMeasured] = useState(0);
  const cellWidth = measured > 0 ? Math.floor((measured - GRID_GAP) / 2) : 0;
  const rowHeight = Math.round((cellWidth * 4) / 3) + GRID_TEXT_HEIGHT;
  const visibleHeight = rowHeight * 2 + GRID_GAP;

  return (
    <View onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
      <SectionTitle title={title} caption={caption} />

      {cellWidth > 0 ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={items.length > 4}
          style={{ maxHeight: visibleHeight }}
        >
          <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
            {items.map((item) => (
              <PosterCell key={item.id} item={item} width={cellWidth} onPress={onPress} />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

export function PosterCarousel({
  title,
  caption,
  items,
  onPress,
  cardWidth = CARD_WIDTH,
  grid = false,
  autoScroll = false,
}: Props) {
  const posterHeight = Math.round((cardWidth * 4) / 3);
  const scrollRef = useRef<ScrollView>(null);
  const offsetX = useRef(0);
  const contentWidth = useRef(0);
  const viewWidth = useRef(0);
  const pausedUntil = useRef(0);
  const count = items.length;

  useEffect(() => {
    if (!autoScroll || grid || count < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const max = contentWidth.current - viewWidth.current;
      if (max <= 0) return;
      const next = offsetX.current >= max - 1 ? 0 : Math.min(max, offsetX.current + cardWidth + 12);
      scrollRef.current?.scrollTo({ x: next, animated: true });
    }, AUTO_SCROLL_MS);
    return () => clearInterval(timer);
  }, [autoScroll, grid, count, cardWidth]);

  const pauseAuto = () => {
    pausedUntil.current = Date.now() + AUTO_PAUSE_MS;
  };
  // Bergantung pada ada/tiada item: ScrollView belum wujud semasa senarai kosong.
  useWebMouseScroll(scrollRef, items.length > 0);

  if (items.length === 0) return null;

  if (grid) return <PosterGrid title={title} caption={caption} items={items} onPress={onPress} />;

  return (
    <View>
      <SectionTitle title={title} caption={caption} />

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          offsetX.current = event.nativeEvent.contentOffset.x;
        }}
        onLayout={(event) => {
          viewWidth.current = event.nativeEvent.layout.width;
        }}
        onContentSizeChange={(width) => {
          contentWidth.current = width;
        }}
        onScrollBeginDrag={pauseAuto}
        /*
          Padding dibawa oleh kandungan dan bukan oleh bekas: dengan padding
          pada bekas, kad pertama terpotong ketika ditatal dan bukan meluncur
          keluar di bawah tepi skrin.
        */
        contentContainerStyle={{ gap: 12, paddingRight: 4 }}
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => onPress(item.id)}
            onPressIn={pauseAuto}
            style={{ width: cardWidth }}
            className="active:opacity-70"
          >
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={{ width: cardWidth, height: posterHeight, borderRadius: 16 }}
                contentFit="cover"
                transition={150}
                accessibilityLabel={'Poster ' + item.title}
              />
            ) : (
              // Acara tanpa poster masih perlu muncul — ia tetap berlaku.
              <View
                style={{ width: cardWidth, height: posterHeight, borderRadius: 16 }}
                className="items-center justify-center border border-line bg-primary-tint"
              >
                <Ionicons name="image-outline" size={28} color={Colors.inkFaint} />
              </View>
            )}

            <Text className="mt-2 text-sm font-semibold text-ink" numberOfLines={2}>
              {item.title}
            </Text>
            {item.caption ? (
              <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                {item.caption}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
