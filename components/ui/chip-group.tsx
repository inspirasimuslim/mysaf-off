import { Pressable, Text, View } from 'react-native';

import type { Option } from '@/types/database';

/**
 * Pemilih PELBAGAI (multi-select) yang boleh bertukar baris — beza daripada
 * `Segmented`: itu satu-pilihan dan sengaja tidak boleh bertukar baris (2-3
 * pilihan sahaja muat sebaris). Sub-kategori perniagaan boleh sampai 6
 * pilihan DAN ahli boleh pilih lebih daripada satu (cth. 'Runcit/Kedai' +
 * 'Makanan & Minuman'), jadi kedua-dua sifat itu diperlukan serentak.
 */

type Props<T extends string> = {
  label?: string;
  values: T[];
  options: Option<T>[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
};

export function ChipGroup<T extends string>({ label, values, options, onChange, disabled = false }: Props<T>) {
  const toggle = (value: T) => {
    if (disabled) return;
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-medium text-ink-muted">{label}</Text> : null}

      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled }}
              accessibilityLabel={option.label}
              disabled={disabled}
              onPress={() => toggle(option.value)}
              className={`h-10 items-center justify-center rounded-pill border px-4 ${
                active ? 'border-primary bg-primary' : 'border-line bg-surface'
              } ${disabled ? 'opacity-60' : 'active:opacity-70'}`}>
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
