import { Pressable, ScrollView, Text } from 'react-native';

import type { Option } from '@/types/database';

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (next: T) => void;
};

/**
 * Tab mendatar yang boleh ditatal.
 *
 * Bukan `Segmented`: pemilih itu membahagi lebar sama rata untuk dua hingga
 * tiga pilihan, dan lima label seperti "Maklumat Diri" tidak muat pada skrin
 * telefon tanpa terpotong. Di sini setiap tab selebar labelnya sendiri.
 */
export function TabBar<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className={`h-11 items-center justify-center rounded-pill border px-4 active:opacity-70 ${
              active ? 'border-primary bg-primary' : 'border-line bg-surface'
            }`}>
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
