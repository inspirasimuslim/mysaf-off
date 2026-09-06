import { Text, View } from 'react-native';

type Tone = 'primary' | 'positive' | 'negative' | 'warn' | 'info' | 'neutral';

const BOX: Record<Tone, string> = {
  primary: 'bg-primary-soft',
  positive: 'bg-positive-soft',
  negative: 'bg-negative-soft',
  warn: 'bg-warn-soft',
  info: 'bg-info-soft',
  neutral: 'bg-background',
};

const LABEL: Record<Tone, string> = {
  primary: 'text-primary',
  positive: 'text-positive',
  negative: 'text-negative',
  warn: 'text-warn',
  info: 'text-info',
  neutral: 'text-ink-muted',
};

/** Label kecil berbentuk pil — status department, peranan, kebenaran. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-pill px-3 py-1 ${BOX[tone]}`}>
      <Text className={`text-xs font-semibold ${LABEL[tone]}`}>{label}</Text>
    </View>
  );
}
