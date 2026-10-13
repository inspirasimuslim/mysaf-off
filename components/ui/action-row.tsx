import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  /** Lencana bilangan (mis. mesej belum dibaca); dipapar bila > 0. */
  badge?: number;
};

export function ActionRow({ icon, title, subtitle, onPress, tone = 'default', badge = 0 }: Props) {
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

      {badge > 0 ? (
        <View
          accessibilityLabel={badge + ' belum dibaca'}
          className="min-w-[22px] items-center rounded-pill bg-negative px-1.5 py-0.5">
          <Text className="text-[11px] font-bold text-white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}
