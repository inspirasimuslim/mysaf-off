import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Switch, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
};

export function ToggleRow({ icon, title, subtitle, value, onValueChange, disabled = false, busy = false }: Props) {
  return (
    <View className={`flex-row items-center gap-4 rounded-card border border-line bg-surface p-card ${disabled ? 'opacity-60' : ''}`}>
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>

      <View className="flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
      </View>

      {busy ? (
        <ActivityIndicator color={Colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: Colors.line, true: Colors.primaryMid }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.line}
        />
      )}
    </View>
  );
}
