import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { TextField } from '@/components/ui/text-field';
import { dateLabel, parseTime12, timeLabel12 } from '@/types/database';

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
 *
 * Masa DIPAPAR dalam bentuk 12 jam ('8:00 PM') pada ketiga-tiga platform,
 * kerana itu cara ia dibaca dan ditulis di Malaysia. Penukaran itu tinggal
 * sepenuhnya di lapisan paparan: apa yang keluar melalui `onChange` sentiasa
 * 'HH:MM' 24 jam.
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

  /*
    Web menyimpan teks yang SEDANG DITAIP secara berasingan daripada nilai yang
    diluluskan ke atas. '8:0' tidak boleh ditukar kepada masa yang sah, tetapi
    ia keadaan yang mesti dilalui untuk sampai ke '8:00' — jadi taipan disimpan
    apa adanya dan hanya dihantar ke atas apabila ia benar-benar terbaca.
  */
  const [draft, setDraft] = useState(() => (mode === 'time' ? timeLabel12(value) : value));

  // Nilai boleh berubah dari luar (borang dimuatkan, jenis acara ditukar);
  // deraf mengekori nilai itu apabila ia bukan lagi bentuk lain bagi teks sama.
  useEffect(() => {
    if (mode !== 'time') {
      setDraft(value);
      return;
    }
    setDraft((current) => (parseTime12(current) === value ? current : timeLabel12(value)));
  }, [mode, value]);

  if (Platform.OS === 'web') {
    const invalid = mode === 'time' && draft.trim().length > 0 && parseTime12(draft) === null;

    return (
      <TextField
        /*
          Petunjuk format dalam placeholder dan bukan dalam label: label yang
          panjang berbalut dua baris apabila medan diletak separuh lebar, dan
          kotak di sebelahnya tidak lagi sejajar.
        */
        label={label}
        placeholder={mode === 'date' ? 'YYYY-MM-DD' : '8:00 PM'}
        value={mode === 'time' ? draft : value}
        onChangeText={(next) => {
          if (mode !== 'time') {
            onChange(next);
            return;
          }
          setDraft(next);
          const parsed = parseTime12(next);
          if (parsed) onChange(parsed);
        }}
        editable={!disabled}
        autoCapitalize="characters"
        autoCorrect={false}
        error={invalid ? 'Guna 8:00 PM atau 20:00.' : null}
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
          {value ? (mode === 'date' ? dateLabel(value) : timeLabel12(value)) : 'Pilih'}
        </Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          is24Hour={false}
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
