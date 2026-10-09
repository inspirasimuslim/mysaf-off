import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
};

export function ActionRow({ icon, title, subtitle, onPress, tone = 'default' }: Props) {
  const colors = useColors();
  const danger = tone === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-card active:opacity-70">
      <View className={`h-11 w-11 items-center justify-center rounded-pill ${danger ? 'bg-negative-soft' : 'bg-primary-soft'}`}>
        <Ionicons name={icon} size={20} color={danger ? colors.negative : colors.primary} />
      </View>

      <View className="flex-1">
        <Text className={`text-base font-semibold ${danger ? 'text-negative' : 'text-ink'}`}>{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}
