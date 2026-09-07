import { Pressable, Text, View } from 'react-native';

import type { Option } from '@/types/database';

/**
 * Pemilih dua hingga tiga pilihan yang kesemuanya kelihatan serentak.
 *
 * Berbeza daripada `PickerField`: dropdown menyembunyikan pilihan sehingga
 * diketuk, yang sesuai untuk lapan kawasan usrah tetapi salah untuk pilihan
 * yang MENGUBAH bentuk borang di bawahnya. Admin perlu melihat bahawa dua
 * jenis wujud sebelum memilih, bukan menemuinya.
 */

type Props<T extends string> = {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
};

export function Segmented<T extends string>({ label, value, options, onChange, disabled = false }: Props<T>) {
  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-medium text-ink-muted">{label}</Text> : null}

      <View className="flex-row gap-2 rounded-field border border-line bg-surface p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={option.label}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              className={`h-12 flex-1 items-center justify-center rounded-field ${
                active ? 'bg-primary' : 'bg-transparent'
              } ${disabled ? 'opacity-60' : 'active:opacity-70'}`}>
              <Text className={`text-base font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
