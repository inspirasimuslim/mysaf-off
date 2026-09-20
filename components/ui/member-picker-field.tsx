import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { generationLabel, type MemberPickerRow } from '@/types/database';

import { TextField } from './text-field';

const MAX_SHEET_WIDTH = 560;

type Props = {
  label: string;
  value: string | null;
  candidates: MemberPickerRow[];
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
};

/**
 * Dropdown carian ahli — bentuknya sama seperti `PickerField`, tetapi dengan
 * medan carian di atas senarai kerana calonnya boleh mencecah ratusan ahli
 * (`PickerField` sesuai untuk sesuatu senarai tetap seperti generasi/sekolah,
 * bukan carian nama).
 */
export function MemberPickerField({
  label,
  value,
  candidates,
  onChange,
  placeholder = 'Cari & pilih ahli',
  disabled = false,
  error = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();

  const selected = candidates.find((candidate) => candidate.id === value) ?? null;
  const borderClass = error ? 'border-negative' : open ? 'border-primary' : 'border-line';

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const pool = needle ? candidates.filter((c) => c.full_name.toLowerCase().includes(needle)) : candidates;
    return [...pool].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' }));
  }, [candidates, search]);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setSearch('');
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
          {selected ? selected.full_name + (selected.generasi ? ' (' + generationLabel(selected.generasi) + ')' : '') : placeholder}
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
            <View className="mb-4 flex-row items-center gap-4">
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

            <View className="mb-3">
              <TextField
                label="Cari"
                placeholder="Nama ahli"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              <View className="gap-3 pb-1">
                <Row label="Tiada" selected={value === null} onPress={() => choose(null)} muted />

                {filtered.map((candidate) => (
                  <Row
                    key={candidate.id}
                    label={candidate.full_name + (candidate.generasi ? ' · ' + generationLabel(candidate.generasi) : '')}
                    selected={candidate.id === value}
                    onPress={() => choose(candidate.id)}
                  />
                ))}

                {filtered.length === 0 ? (
                  <Text className="px-1 py-4 text-center text-sm text-ink-faint">Tiada ahli sepadan.</Text>
                ) : null}
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
