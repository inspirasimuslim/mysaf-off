import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Nombor yang dilaraskan dengan [-] dan [+], bukan ditaip.
 *
 * Radius geofence hanya bermakna dalam langkah kasar — beza antara 100m dan
 * 110m tidak pernah menjadi keputusan yang diambil, sedangkan beza antara 100m
 * dan 1000m adalah. Papan kekunci nombor membenarkan kedua-duanya sama mudah,
 * termasuk salah taip yang menjadikan geofence tidak berguna, dan memerlukan
 * pengesahan julat yang hanya kelihatan selepas admin menekan Simpan.
 */

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Ditambah di belakang nombor — contoh: 'm'. */
  suffix?: string;
  disabled?: boolean;
  caption?: string;
};

export function StepperField({
  label,
  value,
  onChange,
  step = 10,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  suffix = '',
  disabled = false,
  caption,
}: Props) {
  // Julat dikuatkuasakan di sini, jadi nilai di luarnya tidak boleh wujud
  // langsung — tiada keadaan "salah" untuk borang menyemaknya kemudian.
  const clamp = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>

      <View className="h-14 flex-row items-center rounded-field border border-line bg-surface px-2">
        <StepButton
          icon="remove"
          label={'Kurangkan ' + label}
          disabled={disabled || atMin}
          onPress={() => clamp(value - step)}
        />

        <Text className="flex-1 text-center text-lg font-bold text-ink">{value + suffix}</Text>

        <StepButton
          icon="add"
          label={'Tambah ' + label}
          disabled={disabled || atMax}
          onPress={() => clamp(value + step)}
        />
      </View>

      {caption ? <Text className="text-xs text-ink-muted">{caption}</Text> : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-10 w-12 items-center justify-center rounded-field bg-primary-soft ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}>
      <Ionicons name={icon} size={20} color={Colors.primary} />
    </Pressable>
  );
}
