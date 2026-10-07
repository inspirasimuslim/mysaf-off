import { Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';

export type LegalSection = { heading: string; body: string[] };

/** Halaman teks awam (tiada log masuk): Dasar Privasi dan Padam Akaun. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <Screen>
      <View className="mx-auto w-full max-w-[720px] gap-5 px-gutter pb-12 pt-6">
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
