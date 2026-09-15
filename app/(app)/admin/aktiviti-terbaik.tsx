import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { GenerationColumns, StatCard, useCountUp } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { StepperField } from '@/components/ui/stepper-field';
import { Colors } from '@/constants/theme';
import {
  fetchActivityRanking,
  maxPossibleScore,
  ringgit,
  type ActivityRanking,
  type GenerationActivity,
  type MemberActivity,
} from '@/lib/activity-ranking';
import { useGenerasiAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { dateRangeLabel, generationLabel, generationOrder, type Option } from '@/types/database';

type Tab = 'ahli' | 'generasi';

const TAB_OPTIONS: Option<Tab>[] = [
  { value: 'ahli', label: 'Ahli Paling Aktif' },
  { value: 'generasi', label: 'Generasi Terbaik' },
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
 * Aktiviti Terbaik — penarafan ahli paling aktif dan generasi terbaik.
 *
 * Admin LAJNAH PEMBANGUNAN GENERASI sahaja (dan Super Admin); tiada pautan dari
 * mana-mana skrin ahli. RPC menyemak kebenaran yang sama — skrin ini hanya
 * mengelak pintu yang pasti menolak.
 *
 * Penarafan dijana sekali secara automatik dengan tempoh lalai (awal tahun
 * hingga hari ini), kemudian hanya bila admin menekan "Jana Penarafan" —
 * mengubah tarikh tidak mencetuskan panggilan setiap kali pemilih bergerak.
 */
export default function AktivitiTerbaikScreen() {
  const goBack = useGoBack();
  const access = useGenerasiAccess();

  const [startDate, setStartDate] = useState(() => new Date().getFullYear() + '-01-01');
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [minScore, setMinScore] = useState(1);
  const [tab, setTab] = useState<Tab>('ahli');

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
      setResult(await fetchActivityRanking(startDate, endDate, minScore));
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menjana penarafan.'));
    } finally {
      setBusy(false);
    }
  }, [busy, endDate, minScore, rangeValid, startDate]);

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
        title="Aktiviti Terbaik"
        description="Penarafan aktiviti memerlukan kebenaran melihat pada LAJNAH PEMBANGUNAN GENERASI."
      />
    );
  }

  const stale =
    result !== null &&
    (result.startDate !== startDate || result.endDate !== endDate || result.minScore !== minScore);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Pembangunan Generasi"
        title="Aktiviti Terbaik"
        subtitle={result ? dateRangeLabel(result.startDate, result.endDate) : 'Penarafan ahli & generasi'}
        onBackPress={goBack}
      />

      <View className="gap-5 px-gutter pb-8 pt-5">
        {/* --- Tempoh & kriteria --------------------------------------------- */}
        <StatCard title="Tempoh & Kriteria" caption={'Markah maksimum dalam tempoh ini: ' + maxScore}>
          <View className="gap-3">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <DateTimeField label="Tarikh mula" mode="date" value={startDate} onChange={setStartDate} disabled={busy} />
              </View>
              <View className="flex-1">
                <DateTimeField label="Tarikh tamat" mode="date" value={endDate} onChange={setEndDate} disabled={busy} />
              </View>
            </View>

            <StepperField
              label="Markah minimum untuk aktif"
              value={minScore}
              onChange={setMinScore}
              step={1}
              min={1}
              max={maxScore}
              disabled={busy}
              caption="Ahli dengan markah ini ke atas dikira aktif dalam Generasi Terbaik."
            />

            {!rangeValid ? (
              <Notice tone="negative" message="Tarikh tamat mesti pada atau selepas tarikh mula." />
            ) : null}

            <Button
              label="Jana Penarafan"
              loading={busy}
              disabled={busy || !rangeValid}
              icon={<Ionicons name="trophy-outline" size={18} color={Colors.white} />}
              onPress={() => void generate()}
            />

            {stale && !busy ? (
              <Text className="text-center text-xs text-ink-muted">
                Input telah berubah — tekan Jana Penarafan untuk mengira semula.
              </Text>
            ) : null}
          </View>
        </StatCard>

        {error ? <Notice tone="negative" message={error} /> : null}

        {busy && !result ? <LoadingCards /> : null}

        {result ? (
          <>
            <Hero result={result} />

            <Segmented value={tab} options={TAB_OPTIONS} onChange={setTab} />

            {tab === 'ahli' ? <MemberRanking members={result.members} /> : <GenerationRanking result={result} />}

            <ScoringGuide />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

// =============================================================================
// Ringkasan
// =============================================================================

function Hero({ result }: { result: ActivityRanking }) {
  const active = result.members.filter((row) => row.total_score >= result.minScore).length;
  const shown = useCountUp(active);
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

      <Text className="text-sm text-white/70">{'Ahli aktif (markah ≥ ' + result.minScore + ')'}</Text>
      <View className="mt-1 flex-row items-baseline gap-2">
        <Text
          accessibilityLabel={active + ' ahli aktif'}
          className="font-bold text-white"
          style={{ fontSize: 56, lineHeight: 62, fontVariant: ['tabular-nums'] }}>
          {shown}
        </Text>
        <Text className="text-base text-white/70">{'/ ' + result.members.length}</Text>
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {top ? <Fact value={top.total_score + '/' + max} label="markah tertinggi" /> : null}
        {best ? <Fact value={best.generasi ?? '—'} label="generasi terbaik" /> : null}
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
      {podium.map((row, index) => (
        <PodiumCard key={row.member_id} row={row} rank={index + 1} />
      ))}

      {rest.length ? (
        <View className="overflow-hidden rounded-card border border-line bg-surface">
          {rest.map((row, index) => (
            <RankRow key={row.member_id} row={row} rank={index + 4} last={index === rest.length - 1} />
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

      <Text className="text-center text-xs text-ink-faint">
        Markah sama disusun mengikut jumlah sumbangan PIPIS dalam tempoh.
      </Text>
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

function RankRow({ row, rank, last }: { row: MemberActivity; rank: number; last: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={'Kedudukan ' + rank + ', ' + row.full_name + ', ' + row.total_score + ' markah'}
      className={`gap-2 p-3 ${last ? '' : 'border-b border-line'}`}>
      <View className="flex-row items-center gap-3">
        <Text className="w-8 text-center text-sm font-bold text-ink-muted" style={{ fontVariant: ['tabular-nums'] }}>
          {'#' + rank}
        </Text>
        <MemberAvatar fullName={row.full_name} avatarUrl={row.avatar_url} size={36} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {row.full_name}
          </Text>
          <Text className="text-xs text-ink-muted">{generasiName(row.generasi)}</Text>
        </View>
        <Text className="text-2xl font-bold text-primary" style={{ fontVariant: ['tabular-nums'] }}>
          {row.total_score}
        </Text>
      </View>
      <View style={{ paddingLeft: 44 }}>
        <ScoreChips row={row} compact />
      </View>
    </View>
  );
}

/** Pecahan markah: cip hijau bila dicapai, kelabu bila tidak — tidak bergantung pada warna sahaja. */
function ScoreChips({ row, compact = false }: { row: MemberActivity; compact?: boolean }) {
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
            color={chip.earned ? Colors.primary : Colors.inkFaint}
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
  const maxActive = Math.max(1, ...rows.map((row) => row.jumlah_ahli_aktif));

  // Lajur mengikut URUTAN generasi (i01 → i27), bukan kedudukan — bentuk merentas zaman.
  const columns = useMemo(
    () =>
      rows
        .filter((row) => row.generasi)
        .sort((a, b) => generationOrder(a.generasi) - generationOrder(b.generasi))
        .map((row) => ({ label: row.generasi as string, count: row.jumlah_ahli_aktif })),
    [rows],
  );

  return (
    <View className="gap-5">
      <StatCard title="Kedudukan Generasi" caption="Ikut bilangan ahli aktif; seri dipecahkan oleh jumlah PIPIS generasi.">
        <View className="gap-4">
          {rows.map((row, index) => (
            <GenerationRow key={row.generasi ?? 'tiada'} row={row} rank={index + 1} maxActive={maxActive} />
          ))}
        </View>
      </StatCard>

      {columns.length ? (
        <StatCard title="Ahli Aktif Mengikut Generasi" caption={'Markah ≥ ' + result.minScore + ' · urutan generasi'}>
          <GenerationColumns slices={columns} formatLabel={(code) => generationLabel(code)} />
        </StatCard>
      ) : null}
    </View>
  );
}

function GenerationRow({ row, rank, maxActive }: { row: GenerationActivity; rank: number; maxActive: number }) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  const share = (row.jumlah_ahli_aktif / maxActive) * 100;

  return (
    <View
      accessible
      accessibilityLabel={
        'Kedudukan ' + rank + ', ' + generasiName(row.generasi) + ', ' + row.jumlah_ahli_aktif + ' daripada ' +
        row.jumlah_ahli_generasi + ' aktif, ' + row.peratus_aktif + ' peratus'
      }>
      <View className="flex-row items-center gap-3">
        <View
          className="items-center justify-center rounded-pill"
          style={{ width: 28, height: 28, backgroundColor: medal ? medal.color : Colors.primaryTint }}>
          <Text className={`text-xs font-bold ${medal ? 'text-white' : 'text-ink-muted'}`}>{rank}</Text>
        </View>

        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink">
            {generasiName(row.generasi)}
            {row.generasi ? <Text className="text-xs font-normal text-ink-faint">{'  ' + row.generasi}</Text> : null}
          </Text>
          <Text className="text-xs text-ink-muted">{'PIPIS ' + ringgit(row.jumlah_pipis_generasi)}</Text>
        </View>

        <View className="items-end">
          <Text className="text-sm font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
            {row.jumlah_ahli_aktif + '/' + row.jumlah_ahli_generasi + ' aktif'}
          </Text>
          <Text className="text-xs text-ink-muted">{Math.round(row.peratus_aktif) + '%'}</Text>
        </View>
      </View>

      <View className="ml-10 mt-2 h-2.5 overflow-hidden rounded-pill bg-primary-tint">
        <View
          style={{
            width: `${share}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: medal ? medal.color : Colors.primaryMid,
          }}
        />
      </View>
    </View>
  );
}

// =============================================================================
// Panduan & rangka
// =============================================================================

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
      {[0, 1, 2].map((index) => (
        <View key={index} className="h-24 rounded-card border border-line bg-surface p-card">
          <View className="h-4 w-40 rounded-pill bg-line" />
          <View className="mt-4 h-3 w-4/5 rounded-pill bg-primary-tint" />
        </View>
      ))}
    </View>
  );
}
