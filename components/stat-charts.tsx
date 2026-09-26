import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { useGoBack } from '@/lib/navigation';
import { MONTH_NAMES } from '@/types/database';

/**
 * Bahagian carta untuk Dashboard Statistik.
 *
 * Menggunakan semula `react-native-gifted-charts` (perpustakaan Rumusan Ahli —
 * berjalan di native dan web tanpa pecahan `.web.tsx`) dan `StatCard` daripada
 * `member-stats` untuk bingkai kad. Warna: satu hijau untuk magnitud, sama
 * seperti Rumusan; teks sentiasa berwarna dakwat.
 */

const BAR_COLOR = Colors.primaryMid;
const CHART_HEIGHT = 170;
const Y_LABEL_WIDTH = 44;
const SECTIONS = 4;

const SHORT_MONTH = MONTH_NAMES.map((name) => name.slice(0, 3));

/** 'RM1,234' — ringgit penuh. */
export function formatRm(value: number): string {
  return 'RM' + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 'RM1.2k' / 'RM532k' untuk label paksi yang sempit. */
export function compactRm(value: number): string {
  if (value >= 1_000_000) return 'RM' + +(value / 1_000_000).toFixed(1) + 'j';
  if (value >= 1000) return 'RM' + +(value / 1000).toFixed(1) + 'k';
  return 'RM' + Math.round(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : +value.toFixed(1) + '%';
}

/** Had atas paksi = langkah bulat × bilangan bahagian. */
function niceMax(value: number): number {
  const raw = Math.max(1, value) / SECTIONS;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((candidate) => candidate >= raw) ?? raw;
  return step * SECTIONS;
}

// =============================================================================
// Bingkai skrin
// =============================================================================

export function StatShell<T extends { years: number[] }>({
  eyebrow,
  title,
  subtitle,
  year,
  onYear,
  data,
  loading,
  error,
  onRetry,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  year: number;
  onYear: (year: number) => void;
  data: T | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  const goBack = useGoBack();
  const years = data?.years ?? [year];
  const options = (years.includes(year) ? years : [year, ...years]).map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow={eyebrow} title={title} subtitle={subtitle} onBackPress={goBack} />

      <View className="gap-5 px-gutter pb-8 pt-5">
        <PickerField
          label="Tahun"
          value={String(year)}
          options={options}
          clearable={false}
          onChange={(next) => {
            if (next) onYear(Number(next));
          }}
        />

        {error ? (
          <>
            <Notice tone="negative" message={error} />
            <Button label="Cuba Lagi" variant="secondary" onPress={onRetry} />
          </>
        ) : null}

        {!data && loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : null}

        {data ? <View className={`gap-5 ${loading ? 'opacity-50' : ''}`}>{children(data)}</View> : null}
      </View>
    </Screen>
  );
}

/** Nombor ringkasan besar di atas kad. */
export function Figure({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <View className="min-w-[140px] flex-1 rounded-card border border-line bg-surface p-card">
      <Text className="text-2xl font-bold text-ink">{value}</Text>
      <Text className="mt-1 text-sm text-ink-muted">{label}</Text>
      {hint ? <Text className="mt-0.5 text-xs text-ink-faint">{hint}</Text> : null}
    </View>
  );
}

// =============================================================================
// Lajur 12 bulan
// =============================================================================

/**
 * Dua belas lajur Jan–Dis. Ketuk lajur untuk nilai tepat pada baris ringkasan;
 * lalai ialah bulan dengan nilai tertinggi supaya baris itu tidak pernah kosong.
 * `values[i] === null` bermakna tiada rekod bulan itu (dilukis sebagai kosong).
 */
export function MonthColumns({
  values,
  format,
  axisFormat,
  detail,
}: {
  values: (number | null)[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  /** Teks tambahan untuk bulan terpilih, cth. "120 / 324 ahli". */
  detail?: (monthIndex: number) => string | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.min(windowWidth, 560) - 80;

  const largest = useMemo(
    () => values.reduce<number>((best, value, index) => ((value ?? -1) > (values[best] ?? -1) ? index : best), 0),
    [values],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? largest;
  const activeValue = values[active];
  const extra = detail?.(active);

  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 12);
  const barWidth = Math.max(6, Math.floor((plotWidth - 4 * 13) / 12));
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));

  const data = values.map((value, index) => ({
    value: value ?? 0,
    label: SHORT_MONTH[index],
    labelWidth: barWidth + 4,
    frontColor: index === active ? Colors.primaryDark : BAR_COLOR,
    onPress: () => setSelected(index),
  }));

  return (
    <View onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
      <View className="mb-3 rounded-field bg-primary-tint px-3 py-2">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-sm font-semibold text-ink">{MONTH_NAMES[active]}</Text>
          <Text className="flex-1 text-sm text-ink">
            {activeValue === null || activeValue === undefined ? 'Tiada rekod' : format(activeValue)}
          </Text>
          {selected === null ? <Text className="text-[10px] text-ink-faint">tertinggi</Text> : null}
        </View>
        {extra ? <Text className="mt-0.5 text-xs text-ink-muted">{extra}</Text> : null}
      </View>

      {width > 0 ? (
        <BarChart
          data={data}
          width={plotWidth}
          height={CHART_HEIGHT}
          barWidth={barWidth}
          spacing={4}
          initialSpacing={4}
          endSpacing={0}
          maxValue={max}
          noOfSections={SECTIONS}
          formatYLabel={(label: string) => (axisFormat ?? String)(Number(label))}
          barBorderTopLeftRadius={3}
          barBorderTopRightRadius={3}
          yAxisThickness={0}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yAxisTextStyle={{ color: Colors.inkFaint, fontSize: 10 }}
          xAxisThickness={1}
          xAxisColor={Colors.line}
          xAxisLabelTextStyle={{ color: Colors.inkMuted, fontSize: 9, textAlign: 'center' }}
          rulesColor={Colors.line}
          rulesType="solid"
          disableScroll
          isAnimated
          animationDuration={500}
        />
      ) : (
        <View style={{ height: CHART_HEIGHT + 24 }} />
      )}

      <Text className="mt-1 text-center text-[10px] text-ink-faint">Ketuk lajur untuk nilai tepat</Text>
    </View>
  );
}

// =============================================================================
// Bar mendatar bernilai
// =============================================================================

export type BarRow = { key: string; label: string; value: number; note?: string };

/** Satu baris setiap kategori; panjang bar relatif kepada nilai terbesar. */
export function ValueBars({
  rows,
  format,
  sorted = false,
}: {
  rows: BarRow[];
  format: (value: number) => string;
  sorted?: boolean;
}) {
  const ordered = useMemo(() => (sorted ? [...rows].sort((a, b) => b.value - a.value) : rows), [rows, sorted]);
  const max = Math.max(1, ...ordered.map((row) => row.value));

  return (
    <View className="gap-3.5">
      {ordered.map((row) => (
        <View key={row.key} accessible accessibilityLabel={row.label + ': ' + format(row.value)}>
          <View className="flex-row items-baseline gap-2">
            <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
              {row.label}
            </Text>
            <Text className="text-sm font-semibold text-ink">{format(row.value)}</Text>
            {row.note ? <Text className="min-w-10 text-right text-xs text-ink-muted">{row.note}</Text> : null}
          </View>
          <View className="mt-1.5 h-2.5 overflow-hidden rounded-pill" style={{ backgroundColor: Colors.primaryTint }}>
            <View
              style={{ height: '100%', borderRadius: 999, backgroundColor: BAR_COLOR, width: `${(row.value / max) * 100}%` }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Bar bertindan (cth. terkumpul vs baki) dengan legend bernombor. */
export function SplitBar({
  parts,
  format,
}: {
  parts: { label: string; value: number; color: string }[];
  format: (value: number) => string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <View className="gap-3">
      <View className="h-4 flex-row overflow-hidden rounded-pill" style={{ backgroundColor: Colors.line }}>
        {parts.map((part) => (
          <View
            key={part.label}
            style={{ width: `${total > 0 ? (part.value / total) * 100 : 0}%`, backgroundColor: part.color }}
          />
        ))}
      </View>
      {parts.map((part) => (
        <View key={part.label} className="flex-row items-center gap-2.5">
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: part.color }} />
          <Text className="flex-1 text-sm text-ink">{part.label}</Text>
          <Text className="text-sm font-semibold text-ink">{format(part.value)}</Text>
          <Text className="w-12 text-right text-xs text-ink-muted">
            {total > 0 ? Math.round((part.value / total) * 100) + '%' : '0%'}
          </Text>
        </View>
      ))}
    </View>
  );
}
