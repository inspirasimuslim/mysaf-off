import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { TextField } from '@/components/ui/text-field';
import { dateLabel } from '@/types/database';

/**
 * Medan tarikh atau masa.
 *
 * Peranti mendapat pemilih sistem; web mendapat medan teks. `@react-native-
 * community/datetimepicker` tiada pelaksanaan untuk react-native-web, jadi
 * cabang teks itu bukan pilihan gaya — ia satu-satunya cara skrin ini boleh
 * dibuka dalam pelayar langsung.
 *
 * Nilai disimpan sebagai rentetan dalam bentuk yang diterima Postgres —
 * 'YYYY-MM-DD' dan 'HH:MM' — supaya tiada penukaran zon masa berlaku antara
 * borang dan pangkalan data.
 */

type Props = {
  label: string;
  mode: 'date' | 'time';
  /** 'YYYY-MM-DD' untuk tarikh, 'HH:MM' untuk masa. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDate(mode: 'date' | 'time', value: string): Date {
  const now = new Date();
  if (mode === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    if (year && month && day) return new Date(year, month - 1, day);
    return now;
  }

  const [hour, minute] = value.split(':').map(Number);
  const base = new Date();
  base.setHours(Number.isFinite(hour) ? (hour as number) : 20, Number.isFinite(minute) ? (minute as number) : 0, 0, 0);
  return base;
}

function fromDate(mode: 'date' | 'time', date: Date): string {
  return mode === 'date'
    ? date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    : pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function DateTimeField({ label, mode, value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <TextField
        label={label + (mode === 'date' ? ' (YYYY-MM-DD)' : ' (HH:MM)')}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
      />
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`h-14 flex-row items-center rounded-field border border-line bg-surface px-4 ${
          disabled ? 'opacity-60' : 'active:opacity-70'
        }`}>
        <Text className={`flex-1 text-base ${value ? 'text-ink' : 'text-ink-faint'}`}>
          {value ? (mode === 'date' ? dateLabel(value) : value) : 'Pilih'}
        </Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          is24Hour
          onChange={(event, selected) => {
            // Android menutup dialognya sendiri; iOS kekal terbuka sehingga ditutup.
            if (Platform.OS === 'android') setOpen(false);
            if (event.type === 'set' && selected) onChange(fromDate(mode, selected));
          }}
        />
      ) : null}
    </View>
  );
}
