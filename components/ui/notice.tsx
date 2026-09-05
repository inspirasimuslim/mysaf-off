import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Tone = 'positive' | 'negative' | 'warn' | 'info';

const BOX: Record<Tone, string> = {
  positive: 'bg-positive-soft',
  negative: 'bg-negative-soft',
  warn: 'bg-warn-soft',
  info: 'bg-info-soft',
};

const TEXT: Record<Tone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  warn: 'text-warn',
  info: 'text-info',
};

const ICON: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  positive: 'checkmark-circle',
  negative: 'alert-circle',
  warn: 'warning',
  info: 'information-circle',
};

const COLOR: Record<Tone, string> = {
  positive: Colors.positive,
  negative: Colors.negative,
  warn: Colors.warn,
  info: Colors.info,
};

export function Notice({ tone = 'info', message }: { tone?: Tone; message: string }) {
  return (
    <View className={`flex-row items-start gap-3 rounded-field p-4 ${BOX[tone]}`}>
      <Ionicons name={ICON[tone]} size={18} color={COLOR[tone]} />
      <Text className={`flex-1 text-sm leading-5 ${TEXT[tone]}`}>{message}</Text>
    </View>
  );
}
