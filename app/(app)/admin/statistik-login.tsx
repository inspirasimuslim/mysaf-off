import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { formatSelfUpdated } from '@/components/self-update-status';
import { Columns, Panel, StatShell, SummaryStrip } from '@/components/stat-charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GenerationChip } from '@/components/ui/generation-chip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import {
  bucketLabel,
  bucketRange,
  bucketTitle,
  fetchLastSeen,
  fetchLoginSeries,
  fetchLoginSummary,
  fetchPeriodMembers,
  formatClock,
  type LastSeenFilter,
  type LastSeenRow,
  type LoginBucket,
  type LoginPeriod,
  type LoginSummary,
  type PeriodMember,
} from '@/lib/login-stats';
import { MONTH_NAMES } from '@/types/database';

type Metric = 'ahli' | 'log_masuk';

const PERIOD_OPTIONS = [
  { value: 'harian' as const, label: 'Harian' },
  { value: 'mingguan' as const, label: 'Mingguan' },
  { value: 'bulanan' as const, label: 'Bulanan' },
  { value: 'tahunan' as const, label: 'Tahunan' },
];

const METRIC_OPTIONS = [
  { value: 'ahli' as const, label: 'Ahli unik' },
  { value: 'log_masuk' as const, label: 'Jumlah log masuk' },
];

const FILTER_OPTIONS = [
  { value: 'semua' as const, label: 'Semua' },
  { value: 'tidak_aktif_30' as const, label: 'Tiada 30 hari' },
  { value: 'belum' as const, label: 'Belum pernah' },
];

const MONTH_PICKER = MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }));
const PAGE = 50;
const SHOW_STEP = 50;

/** Hari sejak `iso`, dikira pada tarikh kalendar peranti (bukan 24 jam bergolek). */
function daysAgo(iso: string): number {
  const then = new Date(iso);
  const now = new Date();
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function recencyBadge(iso: string | null) {
  if (!iso) return <Badge label="Belum pernah" tone="neutral" />;
  const days = daysAgo(iso);
  if (days <= 0) return <Badge label="Hari ini" tone="positive" />;
  if (days === 1) return <Badge label="Semalam" tone="positive" />;
  if (days <= 7) return <Badge label={days + ' hari lalu'} tone="primary" />;
  if (days <= 30) return <Badge label={days + ' hari lalu'} tone="info" />;
  return <Badge label={days + ' hari lalu'} tone="warn" />;
}

/**
 * Statistik Log Masuk — JABATAN DATA & SUMBER MANUSIA.
 *
 * Carta harian/mingguan/bulanan/tahunan (ahli unik atau jumlah log masuk); ketik
 * satu lajur untuk melihat SIAPA yang log masuk dalam tempoh itu. Bahagian bawah
 * memaparkan log masuk terakhir setiap ahli (boleh dicari dan ditapis).
 * Semua kiraan di pelayan — lihat `20261019000161_login_events.sql`.
 */
export default function StatistikLoginScreen() {
  const router = useRouter();
  const { loading: accessLoading, canView } = useMemberAccess();

  const today = new Date();
  const [period, setPeriod] = useState<LoginPeriod>('harian');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [metric, setMetric] = useState<Metric>('ahli');

  const [summary, setSummary] = useState<LoginSummary | null>(null);
  const [series, setSeries] = useState<LoginBucket[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seriesRequest = useRef(0);

  const loadSeries = useCallback(async () => {
    const id = ++seriesRequest.current;
    setLoading(true);
    setError(null);
    try {
      const [rows, sum] = await Promise.all([fetchLoginSeries(period, year, month), fetchLoginSummary()]);
      if (id !== seriesRequest.current) return;
      setSeries(rows);
      setSummary(sum);
      setSelectedKey(rows.at(-1)?.kunci ?? null);
    } catch (caught) {
      if (id === seriesRequest.current) setError(toMalayError(caught, 'Gagal memuatkan statistik log masuk.'));
    } finally {
      if (id === seriesRequest.current) setLoading(false);
    }
  }, [period, year, month]);

  useEffect(() => {
    if (!accessLoading && canView) void loadSeries();
  }, [accessLoading, canView, loadSeries]);

  // --- Siapa log masuk dalam bucket terpilih ---------------------------------
  const [people, setPeople] = useState<PeriodMember[] | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [shown, setShown] = useState(SHOW_STEP);
  const peopleRequest = useRef(0);

  useEffect(() => {
    if (!selectedKey || !canView) {
      setPeople(null);
      return;
    }
    const id = ++peopleRequest.current;
    const range = bucketRange(period, selectedKey);
    setPeople(null);
    setPeopleError(null);
    setShown(SHOW_STEP);
    fetchPeriodMembers(range.from, range.to)
      .then((rows) => {
        if (id === peopleRequest.current) setPeople(rows);
      })
      .catch((caught) => {
        if (id === peopleRequest.current) setPeopleError(toMalayError(caught, 'Gagal memuatkan senarai ahli.'));
      });
  }, [selectedKey, period, canView]);

  // --- Log masuk terakhir setiap ahli ---------------------------------------
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LastSeenFilter>('semua');
  const [seen, setSeen] = useState<LastSeenRow[]>([]);
  const [seenTotal, setSeenTotal] = useState(0);
  const [seenLoading, setSeenLoading] = useState(true);
  const [seenError, setSeenError] = useState<string | null>(null);
  const seenRequest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSeen = useCallback(
    async (append: boolean, offset: number) => {
      const id = ++seenRequest.current;
      setSeenLoading(true);
      setSeenError(null);
      try {
        const result = await fetchLastSeen(query, filter, PAGE, offset);
        if (id !== seenRequest.current) return;
        setSeenTotal(result.jumlah);
        setSeen((current) => (append ? [...current, ...result.baris] : result.baris));
      } catch (caught) {
        if (id === seenRequest.current) setSeenError(toMalayError(caught, 'Gagal memuatkan log masuk terakhir.'));
      } finally {
        if (id === seenRequest.current) setSeenLoading(false);
      }
    },
    [query, filter],
  );

  useEffect(() => {
    if (!accessLoading && canView) void loadSeen(false, 0);
  }, [accessLoading, canView, loadSeen]);

  const years = useMemo(() => {
    const first = summary?.tahun_terawal ?? today.getFullYear();
    const out: number[] = [];
    for (let y = first; y <= today.getFullYear(); y++) out.push(y);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.tahun_terawal]);

  const openMember = useCallback(
    (id: string) => router.push({ pathname: '/(app)/admin/ahli-detail', params: { id } }),
    [router],
  );

  if (accessLoading) return <LoadingScreen />;
  if (!canView) {
    return (
      <NoAccessScreen
        title="Statistik Log Masuk"
        description="Statistik ini khusus untuk admin JABATAN DATA & SUMBER MANUSIA."
      />
    );
  }

  const activeIndex = Math.max(0, series.findIndex((bucket) => bucket.kunci === selectedKey));
  const shellData = summary ? { years, summary } : null;
  const metricText = (bucket: LoginBucket, which: Metric) =>
    which === 'ahli' ? bucket.ahli + ' ahli' : bucket.log_masuk + ' log masuk';

  return (
    <StatShell
      eyebrow="Data & Sumber Manusia"
      title="Statistik Log Masuk"
      subtitle="Siapa dan bila ahli log masuk"
      year={year}
      onYear={setYear}
      hideYear={period === 'tahunan'}
      data={shellData}
      loading={loading}
      error={error}
      onRetry={() => void loadSeries()}
      summary={({ summary: s }) => (
        <SummaryStrip
          items={[
            { value: String(s.hari_ini), label: 'log masuk hari ini' },
            { value: String(s.tujuh_hari), label: 'dalam 7 hari' },
            { value: String(s.tiga_puluh_hari), label: 'dalam 30 hari' },
            { value: String(s.belum_pernah), label: 'belum pernah (daripada ' + s.jumlah_ahli + ')' },
          ]}
        />
      )}>
      {() => (
        <>
          <Panel
            full
            title="Ahli log masuk"
            caption="Ketik satu lajur untuk melihat siapa yang log masuk. Sesi tersimpan (buka app tanpa kata laluan) tidak dikira."
            controls={
              <View className="w-full gap-2">
                <Segmented compact value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
                <View className="flex-row gap-2">
                  {period === 'harian' ? (
                    <View className="flex-1">
                      <PickerField
                        compact
                        label="Bulan"
                        value={String(month)}
                        options={MONTH_PICKER}
                        clearable={false}
                        onChange={(next) => next && setMonth(Number(next))}
                      />
                    </View>
                  ) : null}
                  <View className="flex-1">
                    <Segmented compact value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
                  </View>
                </View>
              </View>
            }>
            {series.length === 0 && !loading ? (
              <Text className="py-6 text-center text-sm text-ink-muted">Tiada data untuk tempoh ini.</Text>
            ) : (
              <Columns
                key={period + year + month + metric}
                values={series.map((bucket) => bucket[metric])}
                labels={series.map((bucket) => bucketLabel(period, bucket.kunci))}
                titles={series.map((bucket) => bucketTitle(period, bucket.kunci))}
                format={(value) => (metric === 'ahli' ? value + ' ahli' : value + ' log masuk')}
                detail={(index) => {
                  const bucket = series[index];
                  return bucket ? metricText(bucket, metric === 'ahli' ? 'log_masuk' : 'ahli') : null;
                }}
                activeIndex={activeIndex}
                onSelect={(index) => setSelectedKey(series[index]?.kunci ?? null)}
              />
            )}
          </Panel>

          <Panel
            full
            title={selectedKey ? 'Siapa log masuk · ' + bucketTitle(period, selectedKey) : 'Siapa log masuk'}
            caption={
              people
                ? people.length + ' ahli · disusun mengikut log masuk terakhir'
                : 'Pilih satu lajur pada carta di atas'
            }>
            {peopleError ? <Notice tone="negative" message={peopleError} /> : null}
            {!people && !peopleError && selectedKey ? (
              <ActivityIndicator className="py-6" />
            ) : null}
            {people && people.length === 0 ? (
              <Text className="py-4 text-center text-sm text-ink-muted">Tiada ahli log masuk dalam tempoh ini.</Text>
            ) : null}
            {people && people.length > 0 ? (
              <View>
                {people.slice(0, shown).map((person) => (
                  <Pressable
                    key={person.member_id}
                    accessibilityRole="button"
                    accessibilityLabel={person.full_name}
                    onPress={() => openMember(person.member_id)}
                    className="flex-row items-center gap-3 border-b border-line py-2.5 active:opacity-70">
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                          {person.full_name}
                        </Text>
                        <GenerationChip code={person.generasi} />
                      </View>
                      <Text className="text-xs text-ink-muted">
                        {(person.nombor_ahli ?? '—') +
                          ' · ' +
                          (period === 'harian'
                            ? person.kali > 1
                              ? person.kali + ' kali, terakhir ' + formatClock(person.terakhir)
                              : formatClock(person.terakhir)
                            : person.kali + ' kali, terakhir ' + formatSelfUpdated(person.terakhir))}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {people.length > shown ? (
                  <View className="pt-3">
                    <Button
                      label={'Papar lagi (' + (people.length - shown) + ')'}
                      variant="secondary"
                      size="sm"
                      onPress={() => setShown((current) => current + SHOW_STEP)}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Panel>

          <Panel
            full
            title="Log masuk terakhir setiap ahli"
            caption={seenTotal + ' ahli'}
            controls={
              <View className="w-full gap-2">
                <TextField
                  label="Cari nama atau nombor ahli"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  topAnchored
                />
                <Segmented compact value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
              </View>
            }>
            {seenError ? (
              <>
                <Notice tone="negative" message={seenError} />
                <View className="pt-2">
                  <Button label="Cuba Lagi" variant="secondary" size="sm" onPress={() => void loadSeen(false, 0)} />
                </View>
              </>
            ) : null}
            {!seenLoading && !seenError && seen.length === 0 ? (
              <Text className="py-4 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
            ) : null}
            <View>
              {seen.map((row) => (
                <Pressable
                  key={row.member_id}
                  accessibilityRole="button"
                  accessibilityLabel={row.full_name}
                  onPress={() => openMember(row.member_id)}
                  className="flex-row items-center gap-3 border-b border-line py-2.5 active:opacity-70">
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {row.full_name}
                      </Text>
                      <GenerationChip code={row.generasi} />
                    </View>
                    <Text className="text-xs text-ink-muted">
                      {(row.nombor_ahli ?? '—') +
                        ' · ' +
                        (row.terakhir ? formatSelfUpdated(row.terakhir) : 'Belum pernah log masuk') +
                        (row.kali_30 > 0 ? ' · ' + row.kali_30 + 'x dalam 30 hari' : '')}
                    </Text>
                  </View>
                  {recencyBadge(row.terakhir)}
                </Pressable>
              ))}
            </View>
            {seenLoading ? <ActivityIndicator className="py-4" /> : null}
            {!seenLoading && seen.length < seenTotal ? (
              <View className="pt-3">
                <Button
                  label={'Muat lagi (' + (seenTotal - seen.length) + ')'}
                  variant="secondary"
                  size="sm"
                  onPress={() => void loadSeen(true, seen.length)}
                />
              </View>
            ) : null}
          </Panel>
        </>
      )}
    </StatShell>
  );
}
