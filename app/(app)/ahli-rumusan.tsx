import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { DonutStat, GenerationColumns, RankedBars, StatCard, useCountUp } from '@/components/member-stats';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { toMalayError } from '@/lib/errors';
import { fetchMemberStatistics, type MemberStatistics } from '@/lib/member-statistics';
import { useGoBack } from '@/lib/navigation';
import { KAWASAN_USRAH_OPTIONS, generationLabel } from '@/types/database';

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; data: MemberStatistics }
  | { step: 'gagal'; message: string };

/** 'UPT' → 'Usrah Pantai Timur (UPT)'; label lain dipulangkan apa adanya. */
function kawasanLabel(code: string): string {
  const option = KAWASAN_USRAH_OPTIONS.find((row) => row.value === code);
  return option ? option.label + ' (' + code + ')' : code;
}

/** Nama sekolah dari DB dalam huruf besar penuh — dilembutkan untuk dibaca. */
function sekolahLabel(label: string): string {
  if (label.includes('/')) return label;
  return label
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(Smka|Smk|Sma|Tg)\b/g, (word) => word.toUpperCase());
}

/**
 * Rumusan Keseluruhan Ahli — dibuka oleh SEMUA ahli dari tab Ahli.
 *
 * Satu panggilan, satu jawapan agregat. Skrin tidak pernah melihat baris
 * individu: `member_statistics()` hanya memulangkan kiraan.
 *
 * Ahli yang belum melengkapkan profil dikira dalam jumlah tetapi muncul sebagai
 * "Tiada Rekod" dalam setiap carta. Notis di atas menyatakan berapa ramai
 * supaya bahagian kelabu yang besar tidak disangka ralat.
 */
export default function AhliRumusanScreen() {
  const goBack = useGoBack();
  const [state, setState] = useState<State>({ step: 'memuat' });

  const load = useCallback(async () => {
    setState({ step: 'memuat' });
    try {
      setState({ step: 'sedia', data: await fetchMemberStatistics() });
    } catch (caught) {
      setState({ step: 'gagal', message: toMalayError(caught, 'Gagal memuatkan rumusan ahli.') });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Direktori"
        title="Rumusan Ahli"
        subtitle="Statistik agregat — tiada data individu"
        onBackPress={goBack}
      />

      <View className="gap-5 px-gutter pb-8 pt-5">
        {state.step === 'memuat' ? <LoadingCards /> : null}

        {state.step === 'gagal' ? (
          <>
            <Notice tone="negative" message={state.message} />
            <Button label="Cuba Lagi" variant="secondary" onPress={() => void load()} />
          </>
        ) : null}

        {state.step === 'sedia' ? <Summary data={state.data} /> : null}
      </View>
    </Screen>
  );
}

function Summary({ data }: { data: MemberStatistics }) {
  const total = data.total_ahli;
  const withoutProfile = data.ikut_jantina.find((slice) => slice.label === 'Tiada Rekod')?.count ?? 0;
  const generations = data.ikut_generasi.filter((slice) => slice.count > 0 && slice.label !== 'Tiada Rekod').length;
  const states = data.ikut_negeri.filter((slice) => slice.label !== 'Tidak Dapat Dikenal Pasti' && slice.count > 0).length;

  return (
    <>
      <Hero total={total} generations={generations} states={states} profiles={total - withoutProfile} />

      {withoutProfile > 0 ? (
        <Notice
          tone="info"
          message={
            withoutProfile +
            ' ahli belum melengkapkan profil. Mereka dikira dalam jumlah, tetapi dipapar sebagai "Tiada Rekod" (kelabu) dalam carta.'
          }
        />
      ) : null}

      <StatCard title="Jantina">
        <DonutStat slices={data.ikut_jantina} total={total} />
      </StatCard>

      <StatCard title="Generasi" caption={'Ikhwan 01 hingga ' + generationLabel(data.ikut_generasi.at(-1)?.label ?? null)}>
        <GenerationColumns slices={data.ikut_generasi} formatLabel={(code) => generationLabel(code)} />
      </StatCard>

      <StatCard title="Kawasan Usrah">
        <RankedBars slices={data.ikut_kawasan_usrah} total={total} formatLabel={kawasanLabel} />
      </StatCard>

      <StatCard title="Sekolah">
        <RankedBars slices={data.ikut_sekolah} total={total} formatLabel={sekolahLabel} />
      </StatCard>

      <StatCard title="Status Pekerjaan">
        <RankedBars slices={data.ikut_status_pekerjaan} total={total} />
      </StatCard>

      <StatCard title="Status Perkahwinan">
        <DonutStat slices={data.ikut_status_perkahwinan} total={total} />
      </StatCard>

      <StatCard title="Negeri" caption="Anggaran berdasarkan alamat semasa">
        <RankedBars slices={data.ikut_negeri} total={total} />
      </StatCard>

      <Text className="text-center text-xs text-ink-faint">
        {'Dikira pada ' +
          new Date(data.dijana_pada).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }) +
          ' · peratus daripada ' +
          total +
          ' ahli'}
      </Text>
    </>
  );
}

/**
 * Kad pembuka: satu nombor besar dan tiga fakta kecil.
 *
 * Nombor besar dikira naik sekali semasa dibuka — cukup untuk menarik mata ke
 * angka yang skrin ini wujud untuk jawab, tanpa menjadi hiasan yang berulang.
 */
function Hero({
  total,
  generations,
  states,
  profiles,
}: {
  total: number;
  generations: number;
  states: number;
  profiles: number;
}) {
  const shown = useCountUp(total);

  return (
    <View className="overflow-hidden rounded-card bg-primary p-card">
      {/* Bulatan hiasan — lapisan cahaya lembut di penjuru, tidak membawa data. */}
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

      <Text className="text-sm text-white/70">Jumlah Keseluruhan Ahli</Text>
      <Text
        accessibilityLabel={total + ' ahli'}
        className="mt-1 font-bold text-white"
        style={{ fontSize: 56, lineHeight: 62, fontVariant: ['tabular-nums'] }}>
        {shown}
      </Text>

      <View className="mt-4 flex-row flex-wrap gap-2">
        <Fact value={generations} label="generasi" />
        <Fact value={states} label="negeri" />
        <Fact value={profiles} label="profil berekod" />
      </View>
    </View>
  );
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-row items-baseline gap-1 rounded-pill bg-white/15 px-3 py-1.5">
      <Text className="text-sm font-bold text-white">{value}</Text>
      <Text className="text-xs text-white/80">{label}</Text>
    </View>
  );
}

/** Rangka kad semasa memuat — bentuk yang sama dengan kad sebenar, supaya skrin tidak melompat. */
function LoadingCards() {
  return (
    <View accessibilityLabel="Memuatkan rumusan ahli" className="gap-5">
      <View className="h-40 rounded-card bg-primary/80" />
      {[0, 1, 2].map((index) => (
        <View key={index} className="h-48 rounded-card border border-line bg-surface p-card">
          <View className="h-4 w-32 rounded-pill bg-line" />
          <View className="mt-5 h-3 w-full rounded-pill bg-primary-tint" />
          <View className="mt-3 h-3 w-4/5 rounded-pill bg-primary-tint" />
          <View className="mt-3 h-3 w-3/5 rounded-pill bg-primary-tint" />
        </View>
      ))}
    </View>
  );
}
