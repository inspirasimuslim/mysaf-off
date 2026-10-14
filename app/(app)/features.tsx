import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { CHANGELOG, FEATURE_GROUPS, currentAppVersion } from '@/lib/app-changelog';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';

/** Ciri-ciri MySAFF — catatan versi (terbaru di atas) dan senarai ciri app dalam Bahasa Malaysia. */
export default function FeaturesScreen() {
  const goBack = useGoBack();
  const colors = useColors();
  const version = currentAppVersion();
  const releases = [...CHANGELOG].reverse();

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow={version ? 'Versi ' + version : undefined} title="Ciri-ciri MySAFF" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        <SectionTitle title="Apa yang Baharu" />
        {releases.map((release) => (
          <Card key={release.version}>
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-ink">Versi {release.version}</Text>
                <Text className="text-xs text-ink-muted">{release.date}</Text>
              </View>
              {release.highlights.map((line) => (
                <Text key={line} className="text-sm leading-5 text-ink">
                  • {line}
                </Text>
              ))}
            </View>
          </Card>
        ))}

        <SectionTitle title="Senarai Ciri" />
        {FEATURE_GROUPS.map((group) => (
          <Card key={group.title}>
            <View className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <Ionicons name={group.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
                <Text className="text-base font-bold text-ink">{group.title}</Text>
              </View>
              {group.items.map((line) => (
                <Text key={line} className="text-sm leading-5 text-ink">
                  • {line}
                </Text>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
