import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
};

/*
  `collapsable={false}` pada setiap View, dan opacity melalui `style` (bukan
  kelas yang bertukar): Fabric Android (RN 0.86) boleh meratakan/menyahratakan
  View bila `disabled` bertukar semasa simpan, lalu meng-insert anak ke parent
  yang salah — crash "addViewAt: failed to insert view ... already has a parent"
  (logcat 2026-09-25, skrin Cipta Pengumuman/Program, yang ada ToggleRow;
  Usrah tiada ToggleRow dan tidak crash).
*/
export function ToggleRow({ icon, title, subtitle, value, onValueChange, disabled = false, busy = false }: Props) {
  const colors = useColors();
  return (
    <View
      collapsable={false}
      className="flex-row items-center gap-4 rounded-card border border-line bg-surface p-card"
      style={{ opacity: disabled ? 0.6 : 1 }}>
      <View collapsable={false} className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>

      <View collapsable={false} className="flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
      </View>

      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: colors.line, true: colors.primaryMid }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.line}
        />
      )}
    </View>
  );
}
