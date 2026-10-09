import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { axisLabelProps } from '@/components/stat-charts';
import { isNoRecord, type StatSlice } from '@/lib/member-statistics';
import { useColors } from '@/lib/theme';

/**
 * Blok carta untuk skrin Rumusan Ahli.
 *
 * Bentuk dipilih mengikut kerja data, bukan mengikut rupa:
 *   - bahagian daripada keseluruhan dengan ≤ 4 kepingan → donut
 *   - banyak kategori tanpa urutan → bar mendatar tersusun (label panjang
 *     muat penuh, dan panjang bar dibaca lebih tepat daripada sudut)
 *   - kategori berurutan (generasi i01 → i27) → lajur menegak ikut urutan
 *
 * Warna:
 *   - magnitud (bar, lajur) → satu warna hijau
 *   - identiti (kepingan donut) → palet kategori tetap, disahkan dengan skrip
 *     validator dataviz (kecerahan, kontras, pemisahan buta warna)
 *   - "tiada data" → kelabu neutral, sentiasa di hujung
 *
 * Teks (label, nombor, peratus) sentiasa berwarna dakwat, bukan warna siri;
 * warna hanya dibawa oleh tanda di sebelahnya.
 */

/** Palet kategori — urutan tetap, tidak dikitar. Lulus validator (mod cerah). */
const CATEGORICAL = ['#157347', '#D97706', '#2563EB'] as const;
const NO_RECORD_COLOR = '#D1D5DB';

function percent(count: number, total: number): string {
  if (total <= 0) return '0%';
  const value = (count / total) * 100;
  return (value > 0 && value < 1 ? '<1' : Math.round(value).toString()) + '%';
}

/** Kurangkan animasi bila pengguna meminta sistem berbuat demikian. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return reduce;
}

/** Nombor yang dikira naik dari sifar — ringkas, tanpa perpustakaan animasi. */
export function useCountUp(target: number, duration = 900): number {
  const reduce = useReduceMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduce) {
      setValue(target);
      return undefined;
    }

    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [duration, reduce, target]);

  return value;
}

// =============================================================================
// Kad
// =============================================================================

export function StatCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <View className="rounded-card border border-line bg-surface p-card">
      <Text className="text-base font-bold text-ink">{title}</Text>
      {caption ? <Text className="mt-0.5 text-xs text-ink-muted">{caption}</Text> : null}
      <View className="mt-4">{children}</View>
    </View>
  );
}

// =============================================================================
// Donut
// =============================================================================

const DONUT_RADIUS = 64;
const DONUT_INNER = 44;

/**
 * Donut dengan legend bernombor. Legend ialah jadual data — setiap kepingan
 * mempunyai label, kiraan dan peratus, jadi identiti tidak bergantung pada warna.
 */
export function DonutStat({
  slices,
  total,
  centerCaption = 'berekod',
}: {
  slices: StatSlice[];
  total: number;
  centerCaption?: string;
}) {
  const colors = useColors();
  const coloured = useMemo(() => {
    let categoryIndex = 0;
    return slices.map((slice) => {
      // Warna mengikut kedudukan kategori dalam senarai tetap, bukan saiznya.
      const color = isNoRecord(slice.label)
        ? NO_RECORD_COLOR
        : (CATEGORICAL[categoryIndex++ % CATEGORICAL.length] as string);
      return { ...slice, color };
    });
  }, [slices]);

  const recorded = coloured.filter((slice) => !isNoRecord(slice.label)).reduce((sum, slice) => sum + slice.count, 0);
  const pieData = coloured.filter((slice) => slice.count > 0).map((slice) => ({ value: slice.count, color: slice.color }));

  return (
    <View className="flex-row flex-wrap items-center gap-5">
      <View
        accessible
        accessibilityLabel={coloured.map((slice) => slice.label + ' ' + slice.count).join(', ')}
        style={{ width: DONUT_RADIUS * 2, height: DONUT_RADIUS * 2 }}>
        {pieData.length ? (
          <PieChart
            data={pieData}
            donut
            radius={DONUT_RADIUS}
            innerRadius={DONUT_INNER}
            innerCircleColor={colors.surface}
            // Jurang 2px berwarna permukaan antara kepingan.
            strokeWidth={2}
            strokeColor={colors.surface}
            centerLabelComponent={() => (
              <View className="items-center">
                <Text className="text-xl font-bold text-ink">{recorded}</Text>
                <Text className="text-[10px] text-ink-muted">{centerCaption}</Text>
              </View>
            )}
          />
        ) : null}
      </View>

      <View className="min-w-[160px] flex-1 gap-2.5">
        {coloured.map((slice) => (
          <View key={slice.label} className="flex-row items-center gap-2.5">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: slice.color }} />
            <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
              {slice.label}
            </Text>
            <Text className="text-sm font-semibold text-ink">{slice.count}</Text>
            <Text className="w-10 text-right text-xs text-ink-muted">{percent(slice.count, total)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// =============================================================================
// Bar mendatar tersusun
// =============================================================================

/**
 * Satu baris setiap kategori: label dan nombor di atas, bar di bawah.
 *
 * Disusun menurun supaya "yang terbesar" dibaca dahulu; kategori tiada data
 * sentiasa di hujung, dalam kelabu. Panjang bar relatif kepada kategori
 * TERBESAR (bukan jumlah), jadi perbezaan antara kategori kecil kelihatan;
 * peratus di sebelah nombor ialah bahagian daripada JUMLAH ahli.
 */
export function RankedBars({
  slices,
  total,
  formatLabel,
}: {
  slices: StatSlice[];
  total: number;
  formatLabel?: (label: string) => string;
}) {
  const reduce = useReduceMotion();
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      grow.setValue(1);
      return;
    }
    Animated.timing(grow, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, reduce]);

  const ordered = useMemo(
    () =>
      [...slices].sort((a, b) => {
        const aEmpty = isNoRecord(a.label);
        const bEmpty = isNoRecord(b.label);
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        return b.count - a.count;
      }),
    [slices],
  );

  const max = Math.max(1, ...ordered.map((slice) => slice.count));
  const colors = useColors();

  return (
    <View className="gap-3.5">
      {ordered.map((slice) => {
        const label = formatLabel ? formatLabel(slice.label) : slice.label;
        const empty = isNoRecord(slice.label);
        const share = (slice.count / max) * 100;

        return (
          <View key={slice.label} accessible accessibilityLabel={label + ': ' + slice.count + ' ahli, ' + percent(slice.count, total)}>
            <View className="flex-row items-baseline gap-2">
              <Text className={`flex-1 text-sm ${empty ? 'text-ink-muted' : 'text-ink'}`} numberOfLines={2}>
                {label}
              </Text>
              <Text className="text-sm font-semibold text-ink">{slice.count}</Text>
              <Text className="w-10 text-right text-xs text-ink-muted">{percent(slice.count, total)}</Text>
            </View>
            <View className="mt-1.5 h-2.5 overflow-hidden rounded-pill" style={{ backgroundColor: colors.primaryTint }}>
              <Animated.View
                style={{
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: empty ? NO_RECORD_COLOR : colors.primaryMid,
                  width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', share + '%'] }),
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// =============================================================================
// Lajur generasi
// =============================================================================

const COLUMN_HEIGHT = 150;
const COLUMN_SPACING = 3;
const Y_LABEL_WIDTH = 26;
const COLUMN_SECTIONS = 4;

/** Langkah paksi yang dibaca dengan mudah. */
const NICE_STEPS = [1, 2, 4, 5, 8, 10, 15, 20, 25, 40, 50, 100, 200, 250, 500] as const;

/**
 * Had atas paksi = langkah bulat × bilangan bahagian, supaya setiap label
 * paksi ialah nombor bulat. Had 30 dengan empat bahagian memberi 7.5 setiap
 * langkah, dan paksi membaca "30, 22, 15, 7"; maksimum 25 di sini menjadi
 * 0 · 8 · 16 · 24 · 32.
 */
function niceMax(value: number): number {
  const raw = Math.max(1, value) / COLUMN_SECTIONS;
  const step = NICE_STEPS.find((candidate) => candidate >= raw) ?? Math.ceil(raw / 1000) * 1000;
  return step * COLUMN_SECTIONS;
}

/**
 * Lajur menegak i01 → i27, dalam urutan generasi (bukan disusun ikut saiz):
 * soalan di sini ialah bentuk keahlian merentasi zaman, dan menyusun semula
 * akan memadam urutan itu.
 *
 * 27 lajur tidak muat label mendatar pada skrin telefon, jadi SEMUA label
 * diputar menegak (`axisLabelProps`) — tiada label digugurkan. Ketuk lajur untuk nilai tepat; generasi
 * terbesar dipilih secara lalai supaya baris ringkasan tidak pernah kosong.
 */
export function GenerationColumns({
  slices,
  formatLabel,
  unit = 'ahli',
}: {
  slices: StatSlice[];
  formatLabel: (code: string) => string;
  /** Unit nilai lajur pada baris ringkasan — lalai 'ahli'. */
  unit?: string;
}) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  /*
    Anggaran lebar sebelum `onLayout` pertama: lebar kandungan `Screen` (maks
    560) tolak gutter dan padding kad, 20 setiap sisi. Tanpa anggaran ini carta
    kosong sehingga susun atur selesai diukur — dan tidak dilukis langsung bila
    pengukuran itu tertangguh.
  */
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.min(windowWidth, 560) - 80;

  const largest = useMemo(
    () => slices.reduce((best, slice, index) => (slice.count > (slices[best]?.count ?? -1) ? index : best), 0),
    [slices],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? largest;
  const activeSlice = slices[active];

  const count = slices.length;
  const plotWidth = Math.max(0, width - Y_LABEL_WIDTH - 12);
  const barWidth = count ? Math.max(4, Math.floor((plotWidth - COLUMN_SPACING * (count + 1)) / count)) : 8;
  const max = niceMax(Math.max(0, ...slices.map((slice) => slice.count)));

  const axis = axisLabelProps(
    slices.map((slice) => slice.label.toLowerCase()),
    barWidth + COLUMN_SPACING * 2,
    active,
    colors,
  );
  const data = slices.map((slice, index) => ({
    value: slice.count,
    labelComponent: axis.labelComponent(index),
    frontColor: index === active ? colors.primaryDark : colors.primaryMid,
    onPress: () => setSelected(index),
  }));

  return (
    <View onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="text"
        className="mb-3 flex-row items-baseline gap-2 rounded-field bg-primary-tint px-3 py-2">
        <Text className="text-sm font-semibold text-ink">
          {activeSlice ? formatLabel(activeSlice.label) : '—'}
        </Text>
        <Text className="flex-1 text-sm text-ink-muted">
          {activeSlice ? activeSlice.count + ' ' + unit : ''}
        </Text>
        {selected === null ? <Text className="text-[10px] text-ink-faint">terbesar</Text> : null}
      </Pressable>

      {width > 0 ? (
        <BarChart
          data={data}
          width={plotWidth}
          height={COLUMN_HEIGHT}
          barWidth={barWidth}
          spacing={COLUMN_SPACING}
          initialSpacing={COLUMN_SPACING}
          endSpacing={0}
          maxValue={max}
          noOfSections={COLUMN_SECTIONS}
          barBorderTopLeftRadius={3}
          barBorderTopRightRadius={3}
          yAxisThickness={0}
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yAxisTextStyle={{ color: colors.inkFaint, fontSize: 10 }}
          xAxisThickness={1}
          xAxisColor={colors.line}
          labelsExtraHeight={axis.extraHeight}
          rulesColor={colors.line}
          rulesType="solid"
          disableScroll
          isAnimated
          animationDuration={600}
        />
      ) : (
        <View style={{ height: COLUMN_HEIGHT + 24 + axis.extraHeight }} />
      )}

      <Text className="mt-1 text-center text-[10px] text-ink-faint">Kod generasi · ketuk lajur untuk bilangan tepat</Text>
    </View>
  );
}
