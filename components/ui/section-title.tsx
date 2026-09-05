import { Text, View } from 'react-native';

export function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <View className="mb-3">
      <Text className="text-base font-bold text-ink">{title}</Text>
      {caption ? <Text className="mt-1 text-sm text-ink-muted">{caption}</Text> : null}
    </View>
  );
}
