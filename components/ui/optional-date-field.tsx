import { Pressable, Text, View } from 'react-native';

import { DateTimeField } from '@/components/ui/date-time-field';

/**
 * Medan tarikh yang boleh DIKOSONGKAN.
 *
 * `DateTimeField` sentiasa memegang satu tarikh; ia tiada cara menyatakan
 * "tiada". Untuk tempoh pengumuman, ketiadaan itulah nilai yang paling lazim —
 * kebanyakan pengumuman hidup sehingga dimatikan — jadi ia perlu menjadi
 * keadaan yang boleh dipilih, bukan kesan sampingan medan yang dibiarkan kosong.
 *
 * Bila kosong, tiada pemilih dipapar langsung. Pemilih tarikh yang menunjukkan
 * hari ini sedangkan nilainya "tiada" akan membuatkan admin percaya dia sudah
 * memilih sesuatu.
 */

type Props = {
  label: string;
  /** 'YYYY-MM-DD', atau rentetan kosong untuk "tiada". */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

function today(): string {
  const now = new Date();
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  );
}

export function OptionalDateField({ label, value, onChange, disabled = false }: Props) {
  const isSet = value !== '';

  return (
    <View className="gap-2">
      {isSet ? (
        <DateTimeField label={label} mode="date" value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-medium text-ink-muted">{label}</Text>
          <View className="h-14 flex-row items-center rounded-field border border-line bg-background px-4">
            <Text className="flex-1 text-base text-ink-faint">Tiada</Text>
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={(isSet ? 'Kosongkan ' : 'Tetapkan ') + label}
        disabled={disabled}
        onPress={() => onChange(isSet ? '' : today())}
        className={`self-start py-1 ${disabled ? 'opacity-50' : 'active:opacity-70'}`}>
        <Text className="text-xs font-semibold text-primary">
          {isSet ? 'Kosongkan tarikh' : 'Tetapkan tarikh'}
        </Text>
      </Pressable>
    </View>
  );
}
