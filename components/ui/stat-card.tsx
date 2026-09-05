import { Text, View } from 'react-native';

import { Card } from './card';

type Tone = 'positive' | 'negative' | 'warn' | 'info';

const VALUE_CLASS: Record<Tone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  warn: 'text-warn',
  info: 'text-info',
};

const DOT_CLASS: Record<Tone, string> = {
  positive: 'bg-positive',
  negative: 'bg-negative',
  warn: 'bg-warn',
  info: 'bg-info',
};

type Props = {
  value: string;
  label: string;
  tone?: Tone;
  /** Nilai belum ada — papar kelabu supaya tidak disangka data sebenar. */
  muted?: boolean;
  className?: string;
};

/** Satu statistik sahaja setiap kad: angka besar + label kecil kelabu. */
export function StatCard({ value, label, tone = 'info', muted = false, className = '' }: Props) {
  return (
    <Card className={className}>
      <View className={`mb-3 h-2 w-2 rounded-pill ${DOT_CLASS[tone]}`} />
      <Text className={`text-stat font-bold ${muted ? 'text-ink-faint' : VALUE_CLASS[tone]}`}>{value}</Text>
      <Text className="mt-1 text-sm text-ink-muted">{label}</Text>
    </Card>
  );
}
