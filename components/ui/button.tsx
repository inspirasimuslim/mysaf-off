import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  /** `sm` untuk butang berpasangan dalam panel tindakan — lebih rendah dan tulisan lebih kecil. */
  size?: Size;
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

const SIZE: Record<Size, { container: string; label: string }> = {
  md: { container: 'h-14 px-5', label: 'text-base' },
  sm: { container: 'h-11 px-3', label: 'text-sm' },
};

export const SPINNER_COLOR: Record<Variant, string> = {
  primary: Colors.white,
  secondary: Colors.ink,
  ghost: Colors.primary,
  danger: Colors.negative,
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...rest
}: Props) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      className={`flex-row items-center justify-center rounded-field ${SIZE[size].container} ${CONTAINER[variant]} ${
        inactive ? 'opacity-50' : 'active:opacity-80'
      } ${className}`}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={SPINNER_COLOR[variant]} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className={`font-semibold ${SIZE[size].label} ${LABEL[variant]}`} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
