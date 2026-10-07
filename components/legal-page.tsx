import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';

export type LegalSection = { heading: string; body: string[] };

/** Halaman teks awam (tiada log masuk): Dasar Privasi dan Padam Akaun. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  const router = useRouter();

  return (
    <Screen>
      <View className="mx-auto w-full max-w-[720px] gap-5 px-gutter pb-12 pt-6">
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="self-start active:opacity-60">
          <Text className="text-sm font-semibold text-primary">‹ Kembali</Text>
        </Pressable>

        <View>
          <Text className="text-2xl font-bold text-ink">{title}</Text>
          <Text className="mt-1 text-sm text-ink-muted">{'Dikemas kini: ' + updated}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.heading} className="gap-2">
            <Text className="text-lg font-bold text-ink">{section.heading}</Text>
            {section.body.map((line) => (
              <Text key={line} className="text-base leading-6 text-ink">
                {line}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
