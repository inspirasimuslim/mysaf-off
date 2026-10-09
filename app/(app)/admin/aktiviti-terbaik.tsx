import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { GenerationColumns, StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import {
  downloadGenerationRanking,
  downloadInactiveMembers,
  fetchActivityRanking,
  fetchInactiveMembers,
  maxPossibleScore,
  ringgit,
  type ActivityRanking,
  type GenerationActivity,
  type InactiveList,
  type MemberActivity,
} from '@/lib/activity-ranking';
import { useGenerasiAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { dateRangeLabel, generationLabel, generationOrder, type Option } from '@/types/database';
import { useColors } from '@/lib/theme';

type Tab = 'aktif' | 'generasi' | 'tidak-aktif';

/** Label pendek — tiga pilihan penuh tidak muat sebaris pada telefon; tajuk penuh ada dalam kad setiap tab. */
const TAB_OPTIONS: Option<Tab>[] = [
  { value: 'aktif', label: 'Paling Aktif' },
  { value: 'generasi', label: 'Generasi' },
  { value: 'tidak-aktif', label: 'Tidak Aktif' },
];

/** Desktop: generasi ada lajur sendiri di kanan, jadi togol kiri hanya dua pilihan. */
const DESKTOP_TAB_OPTIONS: Option<Tab>[] = [
  { value: 'aktif', label: 'Ahli Paling Aktif' },
  { value: 'tidak-aktif', label: 'Ahli Tidak Aktif' },
];

/** Ahli dipapar berperingkat — 325 baris sekali gus melambatkan skrin. */
const PAGE = 30;

/** Emas, perak, gangsa — tanda kedudukan #1–#3 sahaja. */
const MEDALS = [
  { color: '#B8860B', soft: '#FBF3DC', label: 'Emas' },
  { color: '#6B7280', soft: '#EEF0F3', label: 'Perak' },
  { color: '#A0522D', soft: '#F7EBE2', label: 'Gangsa' },
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isoDate(date: Date): string {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function generasiName(code: string | null): string {
  return code ? generationLabel(code) : 'Tanpa generasi';
}

/**
 * Penarafan Ahli dan Generasi.
 *
 * Admin LAJNAH PEMBANGUNAN GENERASI sahaja (dan Super Admin); tiada pautan dari
 * mana-mana skrin ahli. RPC menyemak kebenaran yang sama — skrin ini hanya
 * mengelak pintu yang pasti menolak.
 *
 * Satu tempoh di atas dikongsi oleh ketiga-tiga tab. Penarafan penuh (Paling
 * Aktif + Generasi) dijana sekali secara automatik, kemudian hanya melalui
 * "Jana Penarafan". Senarai Tidak Aktif mempunyai butang dan markah maksimumnya
 * sendiri, dan tidak dijana sehingga diminta.
 */
export default function PenarafanScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const access = useGenerasiAccess();
  const desktop = useIsDesktop();

  const [startDate, setStartDate] = useState(() => new Date().getFullYear() + '-01-01');
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [tab, setTab] = useState<Tab>('aktif');

  const [result, setResult] = useState<ActivityRanking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeValid = DATE_PATTERN.test(startDate) && DATE_PATTERN.test(endDate) && endDate >= startDate;
  const maxScore = rangeValid ? maxPossibleScore(startDate, endDate) : 4;

  const generate = useCallback(async () => {
    if (busy || !rangeValid) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await fetchActivityRanking(startDate, endDate));
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menjana penarafan.'));
    } finally {
      setBusy(false);
    }
  }, [busy, endDate, rangeValid, startDate]);

  // Jana SEKALI bila akses disahkan; selepas itu hanya melalui butang.
  const autoRan = useRef(false);
  useEffect(() => {
    if (access.loading || !access.canView || autoRan.current) return;
    autoRan.current = true;
    void generate();
  }, [access.loading, access.canView, generate]);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return (
      <NoAccessScreen
        title="Penarafan Ahli dan Generasi"
        description="Penarafan aktiviti memerlukan kebenaran melihat pada LAJNAH PEMBANGUNAN GENERASI."
      />
    );
  }

  const stale = result !== null && (result.startDate !== startDate || result.endDate !== endDate);
  // Desktop tiada tab 'generasi' (ia lajur kanan); jatuh ke 'aktif' bila tab itu terpilih di mobile.
  const leftTab: Tab = tab === 'generasi' ? 'aktif' : tab;

  const periodCard = (
    <StatCard title="Tempoh" caption={'Markah maksimum dalam tempoh ini: ' + maxScore}>
      <View className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <DateTimeField label="Tarikh mula" mode="date" value={startDate} onChange={setStartDate} disabled={busy} />
          </View>
          <View className="flex-1">
            <DateTimeField label="Tarikh tamat" mode="date" value={endDate} onChange={setEndDate} disabled={busy} />
          </View>
        </View>

        {!rangeValid ? <Notice tone="negative" message="Tarikh tamat mesti pada atau selepas tarikh mula." /> : null}

        <Button
          label="Jana Penarafan"
          loading={busy}
          disabled={busy || !rangeValid}
          icon={<Ionicons name="trophy-outline" size={18} color={colors.white} />}
          onPress={() => void generate()}
        />

        {stale && !busy ? (
          <Text className="text-center text-xs text-ink-muted">
            Tempoh telah berubah — tekan Jana Penarafan untuk mengira semula.
          </Text>
        ) : null}
      </View>
    </StatCard>
  );

  if (desktop) {
    /*
      Desktop (≥1024px): tempoh + ringkasan sebaris di atas; di bawahnya dua
      lajur — kiri togol Ahli Paling Aktif / Ahli Tidak Aktif, kanan Generasi.
      Telefon kekal tiga tab dalam satu lajur (cabang di bawah).
    */
    return (
      <Screen padTop={false} wide>
        <ScreenHeader
          eyebrow="Pembangunan Generasi"
          title="Penarafan Ahli dan Generasi"
          subtitle={result ? dateRangeLabel(result.startDate, result.endDate) : 'Mengikut tempoh pilihan'}
          onBackPress={goBack}
        />

        <View className="gap-4 px-1 pb-6 pt-4">
          <View className="flex-row items-stretch gap-4">
            <View style={{ flex: 1, minWidth: 0 }}>{periodCard}</View>
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              {result ? <Hero result={result} /> : busy ? <LoadingCards /> : null}
            </View>
          </View>

          {error ? <Notice tone="negative" message={error} /> : null}

          <View className="flex-row items-start gap-4">
            <View className="gap-4" style={{ flex: 1, minWidth: 0 }}>
              <Segmented value={leftTab} options={DESKTOP_TAB_OPTIONS} onChange={setTab} />

              {leftTab === 'aktif' ? (
                result ? <MemberRanking members={result.members} /> : null
              ) : (
                <InactiveSection startDate={startDate} endDate={endDate} rangeValid={rangeValid} />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>{result ? <GenerationRanking result={result} /> : null}</View>
          </View>

          <ScoringGuide />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Pembangunan Generasi"
        title="Penarafan Ahli dan Generasi"
        subtitle={result ? dateRangeLabel(result.startDate, result.endDate) : 'Mengikut tempoh pilihan'}
        onBackPress={goBack}
      />

      <View className="gap-5 px-gutter pb-8 pt-5">
        {/* --- Tempoh (dikongsi semua tab) ----------------------------------- */}
        {periodCard}

        {error ? <Notice tone="negative" message={error} /> : null}

        {busy && !result ? <LoadingCards /> : null}

        {result ? <Hero result={result} /> : null}

        <Segmented value={tab} options={TAB_OPTIONS} onChange={setTab} />

        {tab === 'aktif' ? (
          result ? <MemberRanking members={result.members} /> : null
        ) : tab === 'generasi' ? (
          result ? <GenerationRanking result={result} /> : null
        ) : (
          <InactiveSection startDate={startDate} endDate={endDate} rangeValid={rangeValid} />
        )}

        <ScoringGuide />
      </View>
    </Screen>
  );
}

// =============================================================================
// Ringkasan
// =============================================================================

function Hero({ result }: { result: ActivityRanking }) {
  const count = result.members.length;
  const average = count ? result.members.reduce((sum, row) => sum + row.total_score, 0) / count : 0;
  const zero = result.members.filter((row) => row.total_score === 0).length;
  const top = result.members[0];
  const best = result.generations.find((row) => row.generasi);
  const max = maxPossibleScore(result.startDate, result.endDate);

  return (
    <View className="overflow-hidden rounded-card bg-primary p-card">
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90 }}
        className="bg-white/10"
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: 140, height: 140, borderRadius: 70, right: 40, bottom: -80 }}
        className="bg-white/5"
      />

      <Text className="text-sm text-white/70">{'Purata markah · ' + count + ' ahli'}</Text>
      <View className="mt-1 flex-row items-baseline gap-2">
        <Text
          accessibilityLabel={'Purata ' + average.toFixed(1) + ' markah'}
          className="font-bold text-white"
          style={{ fontSize: 56, lineHeight: 62, fontVariant: ['tabular-nums'] }}>
          {average.toFixed(1)}
        </Text>
        <Text className="text-base text-white/70">{'/ ' + max}</Text>
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {top ? <Fact value={String(top.total_score)} label="markah tertinggi" /> : null}
        {best ? <Fact value={best.generasi ?? '—'} label="generasi terbaik" /> : null}
        <Fact value={String(zero)} label="ahli markah 0" />
      </View>
    </View>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-row items-baseline gap-1 rounded-pill bg-white/15 px-3 py-1.5">
      <Text className="text-sm font-bold text-white">{value}</Text>
      <Text className="text-xs text-white/80">{label}</Text>
    </View>
  );
}

// =============================================================================
// Ahli Paling Aktif
// =============================================================================

function MemberRanking({ members }: { members: MemberActivity[] }) {
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    setShown(PAGE);
  }, [members]);

  const podium = members.slice(0, 3);
  const rest = members.slice(3, shown);

  return (
    <View className="gap-3">
      <SectionHeading title="Ahli Paling Aktif" caption="Markah sama disusun mengikut jumlah sumbangan PIPIS dalam tempoh." />

      {podium.map((row, index) => (
        <PodiumCard key={row.member_id} row={row} rank={index + 1} />
      ))}

      {rest.length ? (
        <View className="overflow-hidden rounded-card border border-line bg-surface">
          {rest.map((row, index) => (
            <MemberRow key={row.member_id} row={row} rank={index + 4} last={index === rest.length - 1} />
          ))}
        </View>
      ) : null}

      {shown < members.length ? (
        <Button
          label={'Tunjuk ' + Math.min(PAGE, members.length - shown) + ' lagi'}
          variant="secondary"
          onPress={() => setShown((current) => current + PAGE)}
        />
      ) : null}
    </View>
  );
}

/** #1–#3: kad berbingkai warna pingat, avatar lebih besar, markah menonjol. */
function PodiumCard({ row, rank }: { row: MemberActivity; rank: number }) {
  const medal = MEDALS[rank - 1] ?? MEDALS[2];

  return (
    <View
      accessible
      accessibilityLabel={'Kedudukan ' + rank + ', ' + row.full_name + ', ' + row.total_score + ' markah'}
      className="overflow-hidden rounded-card border-2 p-4"
      style={{ borderColor: medal.color, backgroundColor: medal.soft }}>
      <View className="flex-row items-center gap-3">
        <View>
          <MemberAvatar fullName={row.full_name} avatarUrl={row.avatar_url} size={56} />
          <View
            className="absolute items-center justify-center rounded-pill border-2 border-white"
            style={{ width: 26, height: 26, right: -4, bottom: -4, backgroundColor: medal.color }}>
            <Text className="text-xs font-bold text-white">{rank}</Text>
          </View>
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Ionicons name={rank === 1 ? 'trophy' : 'medal'} size={14} color={medal.color} />
            <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: medal.color }}>
              {'#' + rank + ' · ' + medal.label}
            </Text>
          </View>
          <Text className="mt-0.5 text-base font-bold text-ink" numberOfLines={2}>
            {row.full_name}
          </Text>
          <Text className="text-xs text-ink-muted">{generasiName(row.generasi)}</Text>
        </View>

        <View className="items-center">
          <Text className="font-bold" style={{ fontSize: 34, lineHeight: 38, color: medal.color, fontVariant: ['tabular-nums'] }}>
            {row.total_score}
          </Text>
          <Text className="text-[10px] text-ink-muted">markah</Text>
        </View>
      </View>

      <View className="mt-3">
        <ScoreChips row={row} />
      </View>
    </View>
  );
}

/** Baris ahli padat — dikongsi Paling Aktif (dengan kedudukan) dan Tidak Aktif (tanpa). */
function MemberRow({ row, rank, last, tone = 'primary' }: { row: MemberActivity; rank?: number; last: boolean; tone?: 'primary' | 'muted' }) {
  return (
    <View
      accessible
      accessibilityLabel={(rank ? 'Kedudukan ' + rank + ', ' : '') + row.full_name + ', ' + row.total_score + ' markah'}
      className={`gap-2 p-3 ${last ? '' : 'border-b border-line'}`}>
      <View className="flex-row items-center gap-3">
        {rank ? (
          <Text className="w-8 text-center text-sm font-bold text-ink-muted" style={{ fontVariant: ['tabular-nums'] }}>
            {'#' + rank}
          </Text>
        ) : null}
        <MemberAvatar fullName={row.full_name} avatarUrl={row.avatar_url} size={36} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {row.full_name}
          </Text>
          <Text className="text-xs text-ink-muted">{generasiName(row.generasi)}</Text>
        </View>
        <Text
          className={`text-2xl font-bold ${tone === 'primary' ? 'text-primary' : 'text-ink-muted'}`}
          style={{ fontVariant: ['tabular-nums'] }}>
          {row.total_score}
        </Text>
      </View>
      <View style={{ paddingLeft: rank ? 44 : 0 }}>
        <ScoreChips row={row} compact />
      </View>
    </View>
  );
}

/** Pecahan markah: cip hijau bila dicapai, kelabu bila tidak — ikon ✓/✕ supaya tidak bergantung pada warna. */
function ScoreChips({ row, compact = false }: { row: MemberActivity; compact?: boolean }) {
  const colors = useColors();
  const chips = [
    { label: 'Yuran', earned: row.yuran_lunas > 0 },
    { label: 'PIPIS', earned: row.pipis_sumbang > 0 },
    { label: 'Usrah ' + row.usrah_bulan + ' bln', earned: row.usrah_bulan > 0 },
    { label: 'Jawatan', earned: row.ada_jawatan_org > 0 },
    { label: 'PAS', earned: row.ada_jawatan_pas > 0 },
  ];

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {chips.map((chip) => (
        <View
          key={chip.label}
          className={`flex-row items-center gap-1 rounded-pill ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} ${
            chip.earned ? 'bg-primary-soft' : 'bg-background'
          }`}>
          <Ionicons
            name={chip.earned ? 'checkmark' : 'close'}
            size={compact ? 10 : 12}
            color={chip.earned ? colors.primary : colors.inkFaint}
          />
          <Text className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold ${chip.earned ? 'text-primary' : 'text-ink-faint'}`}>
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// =============================================================================
// Generasi Terbaik
// =============================================================================

function GenerationRanking({ result }: { result: ActivityRanking }) {
  const rows = result.generations;
  const maxTotal = Math.max(1, ...rows.map((row) => row.jumlah_markah_generasi));

  const [saving, setSaving] = useState<DeliveryMode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);

  const save = useCallback(
    async (mode: DeliveryMode) => {
      if (saving) return;

      setNotice(null);
      setSaving(mode);
      try {
        const report = await downloadGenerationRanking(result, mode);
        setNotice({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' generasi'),
        });
      } catch (caught) {
        setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat turun penarafan.') });
      } finally {
        setSaving(null);
      }
    },
    [result, saving],
  );

  // Lajur mengikut URUTAN generasi (i01 → i27), bukan kedudukan — bentuk merentas zaman.
  const columns = useMemo(
    () =>
      rows
        .filter((row) => row.generasi)
        .sort((a, b) => generationOrder(a.generasi) - generationOrder(b.generasi))
        .map((row) => ({ label: row.generasi as string, count: row.jumlah_markah_generasi })),
    [rows],
  );

  return (
    <View className="gap-5">
      <StatCard
        title="Generasi Terbaik"
        caption="Jumlah markah semua ahli generasi; seri dipecahkan oleh jumlah PIPIS. Purata memberi gambaran adil bagi generasi kecil.">
        <View className="gap-4">
          {rows.map((row, index) => (
            <GenerationRow key={row.generasi ?? 'tiada'} row={row} rank={index + 1} maxTotal={maxTotal} />
          ))}
        </View>
      </StatCard>

      {columns.length ? (
        <StatCard title="Jumlah Markah Mengikut Generasi" caption="Urutan generasi">
          <GenerationColumns slices={columns} formatLabel={(code) => generationLabel(code)} unit="markah" />
        </StatCard>
      ) : null}

      {notice ? <ToastBanner tone={notice.tone} message={notice.message} /> : null}

      <SaveShareButtons
        kind="file"
        variant="secondary"
        webLabel="Muat Turun (.xlsx)"
        nativeCaption="Penarafan Generasi (.xlsx)"
        busy={saving}
        disabled={rows.length === 0}
        onPress={(mode) => void save(mode)}
      />
    </View>
  );
}

function GenerationRow({ row, rank, maxTotal }: { row: GenerationActivity; rank: number; maxTotal: number }) {
  const colors = useColors();
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  const share = (row.jumlah_markah_generasi / maxTotal) * 100;

  return (
    <View
      accessible
      accessibilityLabel={
        'Kedudukan ' + rank + ', ' + generasiName(row.generasi) + ', ' + row.jumlah_markah_generasi +
        ' markah, purata ' + row.purata_markah.toFixed(1) + ', ' + row.jumlah_ahli_generasi + ' ahli'
      }>
      <View className="flex-row items-center gap-3">
        <View
          className="items-center justify-center rounded-pill"
          style={{ width: 28, height: 28, backgroundColor: medal ? medal.color : colors.primaryTint }}>
          <Text className={`text-xs font-bold ${medal ? 'text-white' : 'text-ink-muted'}`}>{rank}</Text>
        </View>

        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink">
            {generasiName(row.generasi)}
            {row.generasi ? <Text className="text-xs font-normal text-ink-faint">{'  ' + row.generasi}</Text> : null}
          </Text>
          <Text className="text-xs text-ink-muted">
            {'purata ' + row.purata_markah.toFixed(1) + ' · ' + row.jumlah_ahli_generasi + ' ahli · PIPIS ' +
              ringgit(row.jumlah_pipis_generasi)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-lg font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
            {row.jumlah_markah_generasi}
          </Text>
          <Text className="text-[10px] text-ink-muted">markah</Text>
        </View>
      </View>

      <View className="ml-10 mt-2 h-2.5 overflow-hidden rounded-pill bg-primary-tint">
        <View
          style={{
            width: `${share}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: medal ? medal.color : colors.primaryMid,
          }}
        />
      </View>
    </View>
  );
}

// =============================================================================
// Ahli Paling Tidak Aktif
// =============================================================================

function InactiveSection({ startDate, endDate, rangeValid }: { startDate: string; endDate: string; rangeValid: boolean }) {
  const colors = useColors();
  const [maxInput, setMaxInput] = useState('0');
  const [list, setList] = useState<InactiveList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [saving, setSaving] = useState<DeliveryMode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);

  const parsed = Number.parseInt(maxInput, 10);
  const maxValid = maxInput.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  const generate = useCallback(async () => {
    if (busy || !rangeValid || !maxValid) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setList(await fetchInactiveMembers(startDate, endDate, parsed));
      setShown(PAGE);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menjana senarai.'));
    } finally {
      setBusy(false);
    }
  }, [busy, endDate, maxValid, parsed, rangeValid, startDate]);

  const download = useCallback(
    async (mode: DeliveryMode) => {
      if (!list || saving) return;
      setSaving(mode);
      setNotice(null);
      try {
        const report = await downloadInactiveMembers(list, mode);
        setNotice({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' ahli'),
        });
      } catch (caught) {
        setNotice({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana fail Excel.') });
      } finally {
        setSaving(null);
      }
    },
    [list, saving],
  );

  const stale =
    list !== null && (list.startDate !== startDate || list.endDate !== endDate || (maxValid && list.maxScore !== parsed));

  return (
    <View className="gap-3">
      <StatCard title="Ahli Paling Tidak Aktif" caption="Ahli dengan markah sama atau kurang daripada nilai ini, dalam tempoh di atas.">
        <View className="gap-3">
          <TextField
            label="Markah maksimum"
            value={maxInput}
            onChangeText={(value) => setMaxInput(value.replace(/[^\d]/g, '').slice(0, 3))}
            keyboardType="number-pad"
            editable={!busy}
            error={maxInput.trim() !== '' && !maxValid ? 'Masukkan nombor 0 atau lebih.' : null}
          />
          <Button
            label="Jana Senarai"
            variant="secondary"
            loading={busy}
            disabled={busy || !rangeValid || !maxValid}
            icon={<Ionicons name="list-outline" size={18} color={colors.ink} />}
            onPress={() => void generate()}
          />
          {stale && !busy ? (
            <Text className="text-center text-xs text-ink-muted">
              Tempoh atau markah telah berubah — tekan Jana Senarai untuk mengira semula.
            </Text>
          ) : null}
        </View>
      </StatCard>

      {error ? <Notice tone="negative" message={error} /> : null}

      {list ? (
        <>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-base font-bold text-ink">{list.members.length + ' ahli'}</Text>
            <Text className="text-xs text-ink-muted">{'markah ≤ ' + list.maxScore + ' · paling rendah dahulu'}</Text>
          </View>

          {list.members.length ? (
            <>
              <SaveShareButtons
                kind="file"
                variant="secondary"
                webLabel="Muat Turun Senarai (.xlsx)"
                nativeCaption="Muat Turun Senarai (.xlsx)"
                busy={saving}
                onPress={(mode) => void download(mode)}
              />
              {notice ? <ToastBanner tone={notice.tone} message={notice.message} /> : null}

              <View className="overflow-hidden rounded-card border border-line bg-surface">
                {list.members.slice(0, shown).map((row, index, visible) => (
                  <MemberRow key={row.member_id} row={row} last={index === visible.length - 1} tone="muted" />
                ))}
              </View>

              {shown < list.members.length ? (
                <Button
                  label={'Tunjuk ' + Math.min(PAGE, list.members.length - shown) + ' lagi'}
                  variant="secondary"
                  onPress={() => setShown((current) => current + PAGE)}
                />
              ) : null}
            </>
          ) : (
            <Notice tone="info" message={'Tiada ahli dengan markah ' + list.maxScore + ' atau kurang dalam tempoh ini.'} />
          )}
        </>
      ) : null}
    </View>
  );
}

// =============================================================================
// Panduan & rangka
// =============================================================================

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <View>
      <Text className="text-base font-bold text-ink">{title}</Text>
      {caption ? <Text className="mt-0.5 text-xs text-ink-muted">{caption}</Text> : null}
    </View>
  );
}

function ScoringGuide() {
  const items: [string, string][] = [
    ['Yuran', '1 markah jika tiada tunggakan sehingga tahun tarikh tamat.'],
    ['PIPIS', '1 markah jika ada sumbangan yang direkod dalam tempoh.'],
    ['Usrah', '1 markah setiap bulan hadir dalam tempoh.'],
    ['Jawatan', '1 markah jika memegang jawatan dalam Carta Organisasi (semasa).'],
    ['PAS', '1 markah jika memegang jawatan PAS (semasa).'],
  ];

  return (
    <StatCard title="Cara Markah Dikira">
      <View className="gap-2">
        {items.map(([label, text]) => (
          <View key={label} className="flex-row gap-2">
            <Text className="w-16 text-xs font-bold text-ink">{label}</Text>
            <Text className="flex-1 text-xs leading-4 text-ink-muted">{text}</Text>
          </View>
        ))}
        <Text className="mt-1 text-[11px] leading-4 text-ink-faint">
          PIPIS dikira ikut tarikh rekod dimasukkan ke sistem — sumbangan yang diimport dikira pada tarikh import.
        </Text>
      </View>
    </StatCard>
  );
}

function LoadingCards() {
  return (
    <View accessibilityLabel="Menjana penarafan" className="gap-5">
      <View className="h-36 rounded-card bg-primary/80" />
      {[0, 1].map((index) => (
        <View key={index} className="h-24 rounded-card border border-line bg-surface p-card">
          <View className="h-4 w-40 rounded-pill bg-line" />
          <View className="mt-4 h-3 w-4/5 rounded-pill bg-primary-tint" />
        </View>
      ))}
    </View>
  );
}
