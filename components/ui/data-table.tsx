import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';

export type Column<T> = {
  key: string;
  header: string;
  /** Lebar tetap (px). Tanpa ini lajur mengambil baki ruang mengikut `flex`. */
  width?: number;
  flex?: number;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  /** Klik pada baris — sama fungsi dengan ketukan kad di mobile. */
  onRowPress?: (row: T) => void;
  /** Ikon tindakan di hujung kanan baris (padam, dll). Klik tidak membuka baris. */
  actions?: (row: T) => ReactNode;
  actionsWidth?: number;
  /** Bila diberi, klik baris membentangkan/melipat kandungan ini di bawahnya. */
  renderExpanded?: (row: T) => ReactNode;
  /** Tinggi yang ditolak daripada tetingkap untuk menetapkan tinggi tatal jadual. */
  reserve?: number;
};

/**
 * Jadual data untuk mod DESKTOP sahaja — pemanggil memilih antara ini dan kad
 * mobile melalui `useIsDesktop()`. Kepala lajur tinggal di luar kawasan tatal,
 * jadi ia sentiasa kelihatan (sticky) sementara baris ditatal dalam jadual.
 */
export function DataTable<T>({ columns, rows, keyOf, onRowPress, actions, actionsWidth = 72, renderExpanded, reserve = 260 }: Props<T>) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { height } = useWindowDimensions();
  const maxHeight = Math.max(320, height - reserve);

  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface">
      <View className="flex-row items-center border-b border-line bg-primary-tint px-4 py-2.5">
        {columns.map((column) => (
          <View key={column.key} style={cellStyle(column)}>
            <Text
              className={`text-xs font-semibold uppercase tracking-wide text-ink-muted ${
                column.align === 'right' ? 'text-right' : ''
              }`}
              numberOfLines={1}>
              {column.header}
            </Text>
          </View>
        ))}
        {actions ? <View style={{ width: actionsWidth }} /> : null}
      </View>

      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator>
        {rows.map((row, index) => {
          const key = keyOf(row);
          const open = renderExpanded !== undefined && openKey === key;
          const interactive = !!onRowPress || !!renderExpanded;
          return (
            <View key={key} className={index > 0 ? 'border-t border-line' : ''}>
              <Pressable
                accessibilityRole={interactive ? 'button' : undefined}
                accessibilityState={renderExpanded ? { expanded: open } : undefined}
                disabled={!interactive}
                onPress={() => {
                  if (renderExpanded) setOpenKey(open ? null : key);
                  onRowPress?.(row);
                }}
                className={`flex-row items-center px-4 py-2.5 hover:bg-primary-tint active:bg-primary-soft ${
                  open ? 'bg-primary-tint' : ''
                }`}>
                {columns.map((column) => (
                  <View key={column.key} style={cellStyle(column)}>
                    {column.render(row)}
                  </View>
                ))}
                {actions ? (
                  <View style={{ width: actionsWidth }} className="flex-row items-center justify-end gap-1">
                    {actions(row)}
                  </View>
                ) : null}
              </Pressable>
              {open ? <View className="border-t border-line bg-background px-4 py-3">{renderExpanded(row)}</View> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function cellStyle<T>(column: Column<T>) {
  return {
    width: column.width,
    flex: column.width ? undefined : (column.flex ?? 1),
    minWidth: 0,
    paddingRight: 12,
    alignItems: column.align === 'right' ? ('flex-end' as const) : ('flex-start' as const),
  };
}

/** Teks sel piawai: `strong` untuk lajur utama (nama), `muted` untuk sekunder. */
export function CellText({
  children,
  strong,
  muted,
  tone,
}: {
  children: ReactNode;
  strong?: boolean;
  muted?: boolean;
  tone?: 'negative' | 'primary';
}) {
  const color = tone === 'negative' ? 'text-negative' : tone === 'primary' ? 'text-primary' : muted ? 'text-ink-muted' : 'text-ink';
  return (
    <Text className={`text-sm ${strong ? 'font-semibold' : ''} ${color}`} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Ikon tindakan kecil di hujung baris — corak sama seperti ikon padam Album. */
export function RowIconAction({
  icon,
  label,
  onPress,
  destructive,
  busy,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      // @ts-expect-error `title` ialah atribut DOM (tooltip) yang dibawa oleh react-native-web.
      title={label}
      disabled={inactive}
      hitSlop={4}
      onPress={onPress}
      className={`h-8 w-8 items-center justify-center rounded-pill hover:bg-primary-soft ${
        inactive ? 'opacity-40' : 'active:opacity-70'
      }`}>
      {busy ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name={icon} size={16} color={destructive ? Colors.negative : Colors.inkMuted} />
      )}
    </Pressable>
  );
}
