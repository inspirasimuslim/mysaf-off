import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { useColors } from '@/lib/theme';

/** Halaman luar (Canva) untuk Majlis Baitul Muslim. */
const BAITUL_MUSLIM_URL = 'https://senadappda.my.canva.site/mbmikhwan';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Tab Direktori — tiga pintu: Album gambar, Koleksi Dokumen dan Maklum Balas.
 *
 * Label "Koleksi Dokumen" (dan bukan "Arkib") supaya tidak sama dengan nama tab.
 */
export default function ArkibHubScreen() {
  const router = useRouter();

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Simpanan" title="Arkib" />

      <View className="gap-4 px-gutter pb-8 pt-6">
        <HubButton
          icon="images-outline"
          title="Album"
          onPress={() => router.push('/(app)/album')}
        />
        <HubButton
          icon="folder-open-outline"
          title="Koleksi Dokumen"
          onPress={() => router.push('/(app)/document-library')}
        />
        <HubButton
          icon="storefront-outline"
          title="Bisnes Ahli"
          onPress={() => router.push('/(app)/bisnes-ahli')}
        />
        <HubButton
          icon="heart-outline"
          title="Majlis Baitul Muslim"
          onPress={() => void Linking.openURL(BAITUL_MUSLIM_URL).catch(() => undefined)}
        />
        <HubButton
          icon="chatbubble-ellipses-outline"
          title="Maklum Balas"
          onPress={() => router.push('/(app)/maklum-balas')}
        />
      </View>
    </Screen>
  );
}

function HubButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} className="active:opacity-70">
      <Card>
        <View className="flex-row items-center gap-4 py-2">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
            <Ionicons name={icon} size={28} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-ink">{title}</Text>
            {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
        </View>
      </Card>
    </Pressable>
  );
}
