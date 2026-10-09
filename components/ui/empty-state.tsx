import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

export function EmptyState({ icon, title, description }: Props) {
  const colors = useColors();
  return (
    <View className="items-center px-gutter py-16">
      <View className="h-20 w-20 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text className="mt-6 text-lg font-bold text-ink">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-ink-muted">{description}</Text>
    </View>
  );
}
