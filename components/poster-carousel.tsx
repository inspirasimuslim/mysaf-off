import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
const POSTER_HEIGHT = 208;

export type PosterItem = {
  id: string;
  title: string;
  caption: string;
  posterUrl: string | null;
};

type Props = {
  title: string;
  caption?: string;
  items: PosterItem[];
  onPress: (id: string) => void;
};

export function PosterCarousel({ title, caption, items, onPress }: Props) {
  if (items.length === 0) return null;

  return (
    <View>
      <SectionTitle title={title} caption={caption} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        /*
          Padding dibawa oleh kandungan dan bukan oleh bekas: dengan padding
          pada bekas, kad pertama terpotong ketika ditatal dan bukan meluncur
          keluar di bawah tepi skrin.
        */
        contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => onPress(item.id)}
            style={{ width: CARD_WIDTH }}
            className="active:opacity-70">
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={{ width: CARD_WIDTH, height: POSTER_HEIGHT, borderRadius: 16 }}
                contentFit="cover"
                transition={150}
                accessibilityLabel={'Poster ' + item.title}
              />
            ) : (
              // Acara tanpa poster masih perlu muncul — ia tetap berlaku.
              <View
                style={{ width: CARD_WIDTH, height: POSTER_HEIGHT, borderRadius: 16 }}
                className="items-center justify-center border border-line bg-primary-tint">
                <Ionicons name="image-outline" size={28} color={Colors.inkFaint} />
              </View>
            )}

            <Text className="mt-2 text-sm font-semibold text-ink" numberOfLines={2}>
              {item.title}
            </Text>
            <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
              {item.caption}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
