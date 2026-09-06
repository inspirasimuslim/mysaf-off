import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';

import { Colors } from '@/constants/theme';

type Tone = 'default' | 'danger';

const BOX: Record<Tone, string> = {
  default: 'border-line bg-surface',
  danger: 'border-negative-soft bg-negative-soft',
};

const COLOR: Record<Tone, string> = {
  default: Colors.inkMuted,
  danger: Colors.negative,
};

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
};

/** Butang bulat kecil untuk tindakan sekunder dalam baris senarai. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tone = 'default',
  busy = false,
  disabled = false,
}: Props) {
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      hitSlop={6}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-pill border ${BOX[tone]} ${
        inactive ? 'opacity-50' : 'active:opacity-70'
      }`}>
      {busy ? <ActivityIndicator size="small" color={COLOR[tone]} /> : <Ionicons name={icon} size={18} color={COLOR[tone]} />}
    </Pressable>
  );
}
