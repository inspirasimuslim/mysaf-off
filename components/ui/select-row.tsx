import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Kandungan tambahan di bawah tajuk — contoh: toggle kebenaran bila dipilih. */
  children?: ReactNode;
};

/** Baris boleh pilih dengan kotak semak di kiri — untuk senarai ahli & department. */
export function SelectRow({ title, subtitle, selected, onPress, disabled = false, children }: Props) {
  return (
    <View
      className={`rounded-field border bg-surface ${selected ? 'border-primary' : 'border-line'} ${
        disabled ? 'opacity-50' : ''
      }`}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        className="flex-row items-center gap-3 p-4 active:opacity-70">
        <View
          className={`h-6 w-6 items-center justify-center rounded-md border ${
            selected ? 'border-primary bg-primary' : 'border-line bg-surface'
          }`}>
          {selected ? <Ionicons name="checkmark" size={15} color={Colors.white} /> : null}
        </View>

        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
        </View>
      </Pressable>

      {children ? <View className="border-t border-line px-4 py-3">{children}</View> : null}
    </View>
  );
}
