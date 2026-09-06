import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import type { Option } from '@/types/database';

const MAX_SHEET_WIDTH = 560;

type Props<T extends string> = {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (next: T | null) => void;
  placeholder?: string;
  /** Papar pilihan "Tiada" di puncak senarai supaya nilai boleh dikosongkan. */
  clearable?: boolean;
  disabled?: boolean;
  error?: string | null;
};

/**
 * Dropdown merentas platform.
 *
 * Dibina daripada `Modal` dan bukan `Picker` asli kerana panel ini diuji
 * melalui `expo start --web` — sama seperti `ConfirmDialog`, satu komponen
 * berkelakuan serupa pada ketiga-tiga platform.
 */
export function PickerField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Sila pilih',
  clearable = true,
  disabled = false,
  error = null,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const selected = options.find((option) => option.value === value) ?? null;
  const borderClass = error ? 'border-negative' : open ? 'border-primary' : 'border-line';

  const choose = (next: T | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`h-14 flex-row items-center rounded-field border bg-surface px-4 ${borderClass} ${
          disabled ? 'opacity-50' : 'active:opacity-70'
        }`}>
        <Text className={`flex-1 text-base ${selected ? 'text-ink' : 'text-ink-faint'}`} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.inkMuted} />
      </Pressable>

      {error ? <Text className="text-sm text-negative">{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            className="absolute inset-0"
            onPress={() => setOpen(false)}
          />

          <View
            className="w-full self-center rounded-t-[28px] bg-background px-gutter pt-6"
            style={{ maxWidth: MAX_SHEET_WIDTH, maxHeight: '80%', paddingBottom: insets.bottom + 24 }}>
            <View className="mb-5 flex-row items-center gap-4">
              <Text className="flex-1 text-xl font-bold text-ink">{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                hitSlop={10}
                onPress={() => setOpen(false)}
                className="h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface active:opacity-70">
                <Ionicons name="close" size={18} color={Colors.ink} />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              <View className="gap-3 pb-1">
                {clearable ? (
                  <Row label="Tiada" selected={value === null} onPress={() => choose(null)} muted />
                ) : null}

                {options.map((option) => (
                  <Row
                    key={option.value}
                    label={option.label}
                    selected={option.value === value}
                    onPress={() => choose(option.value)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({
  label,
  selected,
  onPress,
  muted = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-field border bg-surface p-4 active:opacity-70 ${
        selected ? 'border-primary' : 'border-line'
      }`}>
      <Text className={`flex-1 text-base ${muted ? 'text-ink-muted' : 'text-ink'} ${selected ? 'font-semibold' : ''}`}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
    </Pressable>
  );
}
