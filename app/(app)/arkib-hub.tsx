import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Screen } from '@/components/ui/screen';
import { fetchBantuanPerluTindakan } from '@/lib/bantuan';
import { useColors } from '@/lib/theme';

/** Halaman luar (Canva) untuk Majlis Baitul Muslim. */
const BAITUL_MUSLIM_URL = 'https://senadappda.my.canva.site/mbmikhwan';

type IconName = keyof typeof Ionicons.glyphMap;

const COLUMNS = 3;

/**
 * Tab Direktori — grid jubin 3 lajur (nisbah 3:2) ke Zakat, Album, Dokumen, Bisnes, Baitul Muslim dan Maklum Balas.
 *
 * Label "Koleksi Dokumen" (dan bukan "Arkib") supaya tidak sama dengan nama tab.
 */
export default function ArkibHubScreen() {
  const router = useRouter();
  const [perluTindakan, setPerluTindakan] = useState(0);

  // Lencana ringkas: notifikasi ahli untuk permohonan zakat (keputusan baharu / maklumat tambahan).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchBantuanPerluTindakan()
        .then((count) => active && setPerluTindakan(count))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const tiles: TileProps[] = [
    {
      icon: 'hand-left-outline',
      title: 'Permohonan Bantuan Zakat',
      badge: perluTindakan,
      onPress: () => router.push('/(app)/bantuan'),
    },
    { icon: 'images-outline', title: 'Album', onPress: () => router.push('/(app)/album') },
    { icon: 'folder-open-outline', title: 'Koleksi Dokumen', onPress: () => router.push('/(app)/document-library') },
    { icon: 'storefront-outline', title: 'Bisnes Ahli', onPress: () => router.push('/(app)/bisnes-ahli') },
    {
      icon: 'heart-outline',
      title: 'Majlis Baitul Muslim',
      onPress: () => void Linking.openURL(BAITUL_MUSLIM_URL).catch(() => undefined),
    },
    { icon: 'chatbubble-ellipses-outline', title: 'Maklum Balas', onPress: () => router.push('/(app)/maklum-balas') },
  ];

  // Tiga jubin sebaris; baris terakhir dilapik dengan ruang kosong supaya lebar jubin sama.
  const rows: (TileProps | null)[][] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS) {
    const row: (TileProps | null)[] = tiles.slice(i, i + COLUMNS);
    while (row.length < COLUMNS) row.push(null);
    rows.push(row);
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Simpanan" title="Arkib" />

      <View className="gap-3 px-gutter pb-8 pt-6">
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-3">
            {row.map((tile, colIndex) =>
              tile ? <HubTile key={tile.title} {...tile} /> : <View key={'kosong-' + colIndex} className="flex-1" />,
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}

type TileProps = {
  icon: IconName;
  title: string;
  /** Bilangan notifikasi baharu; lencana dipapar bila > 0. */
  badge?: number;
  onPress: () => void;
};

/** Jubin 3:2 — ikon dalam bulatan lembut, tajuk di bawah, lencana di sudut. */
function HubTile({ icon, title, badge = 0, onPress }: TileProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? title + ', ' + badge + ' notifikasi baharu' : title}
      onPress={onPress}
      className="flex-1 active:opacity-70">
      <View
        className="items-center justify-center gap-2 rounded-card border border-line bg-surface px-2"
        style={{
          aspectRatio: 3 / 2,
          shadowColor: '#0F5132',
          shadowOpacity: 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        }}>
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
        <Text numberOfLines={2} className="text-center text-xs font-bold leading-4 text-ink">
          {title}
        </Text>
        {badge > 0 ? (
          <View className="absolute right-2 top-2 h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1">
            <Text className="text-[11px] font-bold text-white">{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
