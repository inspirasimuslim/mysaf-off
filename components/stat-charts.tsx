import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import type { ThemeColors } from '@/constants/theme';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { MONTH_NAMES } from '@/types/database';
import { useColors } from '@/lib/theme';

/**
 * Bahagian carta untuk Dashboard Statistik.
 *
 * Menggunakan semula `react-native-gifted-charts` (perpustakaan Rumusan Ahli —
 * berjalan di native dan web tanpa pecahan `.web.tsx`). Warna: satu hijau untuk
 * magnitud; teks sentiasa berwarna dakwat.
 *
 * Susun atur: telefon bertindan satu lajur; desktop (≥1024px) grid dua lajur
 * yang padat supaya carta penting muat tanpa tatal. Semua saiz padat dikawal
 * oleh `useIsDesktop()` di sini, bukan di setiap skrin.
 */

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

/** Pilihan tahun padat — cip kecil, bukan dropdown penuh lebar. */
function YearChips({ years, year, onYear }: { years: number[]; year: number; onYear: (year: number) => void }) {
  const list = years.includes(year) ? years : [year, ...years];

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="text-sm font-medium text-ink-muted">Tahun</Text>
      {list.map((y) => {
        const active = y === year;
        return (
          <Pressable
            key={y}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={'Tahun ' + y}
            onPress={() => onYear(y)}
            className={`h-8 min-w-[56px] items-center justify-center rounded-pill border px-3 ${
              active ? 'border-primary bg-primary' : 'border-line bg-surface active:opacity-70'
            }`}>
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{y}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const DesktopContext = createContext(false);

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
  summary,
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
  /** Baris ringkasan padat di sebelah pemilih tahun. */
  summary?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
}) {
  const colors = useColors();
  const goBack = useGoBack();
  const desktop = useIsDesktop();

  return (
    <Screen padTop={false} wide>
      <ScreenHeader eyebrow={eyebrow} title={title} subtitle={subtitle} onBackPress={goBack} />

      <DesktopContext.Provider value={desktop}>
        <View className={desktop ? 'gap-3 px-1 pb-4 pt-3' : 'gap-4 px-gutter pb-8 pt-5'}>
          <View className={desktop ? 'flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2' : 'gap-3'}>
            <YearChips years={data?.years ?? [year]} year={year} onYear={onYear} />
            {data && summary ? summary(data) : null}
          </View>

          {error ? (
            <>
              <Notice tone="negative" message={error} />
              <Button label="Cuba Lagi" variant="secondary" onPress={onRetry} />
            </>
          ) : null}

          {!data && loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {data ? (
            <View className={`flex-row flex-wrap ${desktop ? 'gap-3' : 'gap-4'} ${loading ? 'opacity-50' : ''}`}>
              {children(data)}
            </View>
          ) : null}
        </View>
      </DesktopContext.Provider>
    </Screen>
  );
}

/** Baris ringkasan padat: nombor tebal + label kecil, satu baris (membungkus di telefon). */
export function SummaryStrip({ items }: { items: { value: string; label: string }[] }) {
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-5 gap-y-1">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-baseline gap-1.5">
          <Text className="text-lg font-bold text-ink">{item.value}</Text>
          <Text className="text-xs text-ink-muted">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Panel carta. Desktop: separuh lebar (dua lajur) melainkan `full`; telefon:
 * sentiasa lebar penuh. `controls` (pemilih/toggle) duduk di kepala panel.
 */
export function Panel({
  title,
  caption,
  controls,
  full = false,
  children,
}: {
  title: string;
  caption?: string;
  controls?: ReactNode;
  full?: boolean;
  children: ReactNode;
}) {
  const desktop = useContext(DesktopContext);

  return (
    <View
      className={`rounded-card border border-line bg-surface ${desktop ? 'p-3' : 'p-card'}`}
      style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: desktop && !full ? '48%' : '100%' }}>
      <View className={desktop ? 'flex-row flex-wrap items-center justify-between gap-2' : ''}>
        <View>
          <Text className="text-base font-bold text-ink">{title}</Text>
          {caption ? <Text className="mt-0.5 text-xs text-ink-muted">{caption}</Text> : null}
        </View>
        {controls ? (
          <View className={desktop ? 'flex-row items-center gap-2' : 'mt-3 gap-2'} style={desktop ? { minWidth: 260 } : undefined}>
            {controls}
          </View>
        ) : null}
      </View>
      <View className={desktop ? 'mt-2' : 'mt-4'}>{children}</View>
    </View>
  );
}

// =============================================================================
// Label paksi-X
// =============================================================================

/** Tinggi ruang label menegak (px) dan baris teks 9px di dalamnya. */
const VERTICAL_LABEL_HEIGHT = 24;
const LABEL_LINE_HEIGHT = 12;
const CHAR_WIDTH = 5.6;

/**
 * Label paksi-X yang TIDAK PERNAH digugurkan.
 *
 * Setiap lajur sentiasa mendapat labelnya. Bila lebar satu lajur (`slot` =
 * lebar bar + jarak) tidak cukup untuk label terpanjang secara mendatar, SEMUA
 * label dalam carta itu diputar menegak (-90°) — seluruh carta serupa, bukan
 * sebahagian mendatar dan sebahagian menegak. Corak ini dikongsi oleh semua
 * carta berpaksi bulan atau generasi (dashboard statistik dan Rumusan Ahli).
 */
export function axisLabelProps(labels: string[], slot: number, activeIndex: number, colors: ThemeColors) {
  const longest = Math.max(1, ...labels.map((label) => label.length));
  const vertical = slot < longest * CHAR_WIDTH + 3;

  const labelComponent = (index: number) => () => {
    const active = index === activeIndex;
    const style = { fontSize: 9, lineHeight: LABEL_LINE_HEIGHT, color: active ? colors.ink : colors.inkMuted, fontWeight: active ? ('700' as const) : ('400' as const) };

    if (!vertical) {
      return (
        <View style={{ width: slot, alignItems: 'center' }}>
          <Text numberOfLines={1} style={[style, { textAlign: 'center' }]}>
            {labels[index]}
          </Text>
        </View>
      );
    }

    return (
      <View style={{ width: slot, height: VERTICAL_LABEL_HEIGHT, alignItems: 'center' }}>
        <View
          style={{
            position: 'absolute',
            top: (VERTICAL_LABEL_HEIGHT - LABEL_LINE_HEIGHT) / 2,
            width: VERTICAL_LABEL_HEIGHT,
            height: LABEL_LINE_HEIGHT,
            transform: [{ rotate: '-90deg' }],
          }}>
          <Text numberOfLines={1} style={[style, { textAlign: 'center' }]}>
            {labels[index]}
          </Text>
        </View>
      </View>
    );
  };

  return { vertical, labelComponent, extraHeight: vertical ? VERTICAL_LABEL_HEIGHT - LABEL_LINE_HEIGHT : 0 };
}

// =============================================================================
// Lajur (bulan / generasi)
// =============================================================================

/**
 * Lajur menegak. Ketuk lajur untuk nilai tepat pada baris ringkasan; lalai
 * ialah lajur tertinggi supaya baris itu tidak pernah kosong. `values[i] ===
 * null` bermakna tiada rekod (dilukis kosong). Label paksi tidak pernah
 * digugurkan — lihat `axisLabelProps` (diputar menegak bila sempit).
 */
export function Columns({
  values,
  labels,
  titles,
  format,
  axisFormat,
  detail,
}: {
  values: (number | null)[];
  labels: string[];
  titles: string[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  detail?: (index: number) => string | null;
}) {
  const colors = useColors();
  const desktop = useContext(DesktopContext);
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.min(windowWidth, 560) - 80;
  const height = desktop ? 110 : 170;
  const yLabelWidth = 44;
  const spacing = values.length > 14 ? 3 : 4;

  const largest = useMemo(
    () => values.reduce<number>((best, value, index) => ((value ?? -1) > (values[best] ?? -1) ? index : best), 0),
    [values],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? largest;
  const activeValue = values[active];
  const extra = detail?.(active);

  const plotWidth = Math.max(0, width - yLabelWidth - 12);
  const barWidth = Math.max(4, Math.floor((plotWidth - spacing * (values.length + 1)) / values.length));
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));

  const axis = axisLabelProps(labels, barWidth + spacing, active, colors);
  const data = values.map((value, index) => ({
    value: value ?? 0,
    labelComponent: axis.labelComponent(index),
    frontColor: index === active ? colors.primaryDark : colors.primaryMid,
    onPress: () => setSelected(index),
  }));

  return (
    <View onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
      <View className="mb-2 flex-row flex-wrap items-baseline gap-x-2 rounded-field bg-primary-tint px-3 py-1.5">
        <Text className="text-sm font-semibold text-ink">{titles[active]}</Text>
        <Text className="text-sm text-ink">
          {activeValue === null || activeValue === undefined ? 'Tiada rekod' : format(activeValue)}
        </Text>
        {extra ? <Text className="flex-1 text-xs text-ink-muted">{extra}</Text> : <View className="flex-1" />}
        {selected === null ? <Text className="text-[10px] text-ink-faint">tertinggi</Text> : null}
      </View>

      {width > 0 ? (
        <BarChart
          data={data}
          width={plotWidth}
          height={height}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={spacing}
          endSpacing={0}
          maxValue={max}
          noOfSections={SECTIONS}
          formatYLabel={(label: string) => (axisFormat ?? String)(Number(label))}
          barBorderTopLeftRadius={3}
          barBorderTopRightRadius={3}
          yAxisThickness={0}
          yAxisLabelWidth={yLabelWidth}
          yAxisTextStyle={{ color: colors.inkFaint, fontSize: 10 }}
          xAxisThickness={1}
          xAxisColor={colors.line}
          labelsExtraHeight={axis.extraHeight}
          rulesColor={colors.line}
          rulesType="solid"
          disableScroll
          isAnimated
          animationDuration={500}
        />
      ) : (
        <View style={{ height: height + 24 + axis.extraHeight }} />
      )}
    </View>
  );
}

/** Dua belas lajur Jan–Dis. */
export function MonthColumns({
  values,
  format,
  axisFormat,
  detail,
}: {
  values: (number | null)[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  detail?: (monthIndex: number) => string | null;
}) {
  return (
    <Columns
      values={values}
      labels={SHORT_MONTH}
      titles={[...MONTH_NAMES]}
      format={format}
      axisFormat={axisFormat}
      detail={detail}
    />
  );
}

// =============================================================================
// Bar mendatar bernilai
// =============================================================================

export type BarRow = { key: string; label: string; value: number; note?: string };

/** Satu baris setiap kategori; panjang bar relatif kepada nilai terbesar. `columns` 2 di desktop sahaja. */
export function ValueBars({
  rows,
  format,
  sorted = false,
  columns = 1,
}: {
  rows: BarRow[];
  format: (value: number) => string;
  sorted?: boolean;
  columns?: 1 | 2;
}) {
  const colors = useColors();
  const desktop = useContext(DesktopContext);
  const ordered = useMemo(() => (sorted ? [...rows].sort((a, b) => b.value - a.value) : rows), [rows, sorted]);
  const max = Math.max(1, ...ordered.map((row) => row.value));
  const twoCols = desktop && columns === 2;

  return (
    <View className={`flex-row flex-wrap ${desktop ? 'gap-x-6 gap-y-2' : 'gap-y-3.5'}`}>
      {ordered.map((row) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={row.label + ': ' + format(row.value)}
          style={{ flexBasis: twoCols ? '47%' : '100%', flexGrow: 1 }}>
          <View className="flex-row items-baseline gap-2">
            <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
              {row.label}
            </Text>
            <Text className="text-sm font-semibold text-ink">{format(row.value)}</Text>
            {row.note ? <Text className="min-w-10 text-right text-xs text-ink-muted">{row.note}</Text> : null}
          </View>
          <View
            className={`overflow-hidden rounded-pill ${desktop ? 'mt-1 h-2' : 'mt-1.5 h-2.5'}`}
            style={{ backgroundColor: colors.primaryTint }}>
            <View
              style={{ height: '100%', borderRadius: 999, backgroundColor: colors.primaryMid, width: `${(row.value / max) * 100}%` }}
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
  const colors = useColors();
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <View className="gap-2.5">
      <View className="h-4 flex-row overflow-hidden rounded-pill" style={{ backgroundColor: colors.line }}>
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

/** Label generasi untuk paksi: kod ringkas penuh, cth. 'i05' / 'i25' (tidak pernah digugurkan). */
export function generationAxisLabel(code: string): string {
  return code.toLowerCase();
}
