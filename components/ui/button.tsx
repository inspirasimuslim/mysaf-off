import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** Ikon dilukis di sebelah kiri label. */
  icon?: React.ReactNode;
  className?: string;
};

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface border border-line',
  ghost: 'bg-primary-soft',
  danger: 'bg-negative-soft',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  ghost: 'text-primary',
  danger: 'text-negative',
};

export const SPINNER_COLOR: Record<Variant, string> = {
  primary: Colors.white,
  secondary: Colors.ink,
  ghost: Colors.primary,
  danger: Colors.negative,
};

export function Button({ label, variant = 'primary', loading = false, icon, className = '', disabled, ...rest }: Props) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      className={`h-14 flex-row items-center justify-center rounded-field px-5 ${CONTAINER[variant]} ${
        inactive ? 'opacity-50' : 'active:opacity-80'
      } ${className}`}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={SPINNER_COLOR[variant]} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className={`text-base font-semibold ${LABEL[variant]}`}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
