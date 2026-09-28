import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { SummaryStrip, ValueBars } from '@/components/stat-charts';
import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { ToastBanner } from '@/components/ui/toast';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { fetchMemberCompletenessSummary, type MemberCompletenessSummary } from '@/lib/member-completeness';
import { downloadMemberCompletenessReport } from '@/lib/member-completeness-report';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';

type State =
  | { step: 'memuat' }
  | { step: 'sedia'; data: MemberCompletenessSummary }
  | { step: 'gagal'; message: string };

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Bahagian daripada `total`, dibundarkan — '0%' bila total sifar. */
function pct(count: number, total: number): string {
  return total > 0 ? Math.round((count / total) * 100) + '%' : '0%';
}

/**
 * Statistik Kelengkapan Data — JABATAN DATA & SUMBER MANUSIA.
 *
 * Lima kategori (Data Peribadi, Pendidikan, Pekerjaan, Keluarga, Jawatan),
 * setiap satu "Siap" hanya bila SEMUA medan relevan diisi — medan bersyarat
 * yang tidak relevan pada status semasa ahli itu tidak dikira. Lihat
 * `20260929000072_member_data_completeness.sql` untuk logik penuh dan
 * AGENTS.md untuk rekod keputusan kategori.
 *
 * Urutan kategori dan bucket peratus SENGAJA tetap (bukan disusun ikut
 * kiraan) — admin membaca lima kategori mengikut susunan tab borang ahli, dan
 * bucket mengikut peratus menurun, bukan mengikut bilangan ahli terbesar.
 */
export default function StatistikKelengkapanDataScreen() {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const { loading: accessLoading, canView } = useMemberAccess();

  const [state, setState] = useState<State>({ step: 'memuat' });
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    setState({ step: 'memuat' });
    try {
      setState({ step: 'sedia', data: await fetchMemberCompletenessSummary() });
    } catch (caught) {
      setState({ step: 'gagal', message: toMalayErrorVerbose(caught, 'Gagal memuatkan statistik kelengkapan data.') });
    }
  }, []);

  useEffect(() => {
    if (!accessLoading && canView) void load();
  }, [accessLoading, canView, load]);

  const exportReport = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;
      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadMemberCompletenessReport(mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' ahli'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menjana laporan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting],
  );

  if (accessLoading) return <LoadingScreen />;

  if (!canView) {
    return (
      <NoAccessScreen
        title="Statistik Kelengkapan Data"
        description="Statistik ini khusus untuk admin JABATAN DATA & SUMBER MANUSIA."
      />
    );
  }

  return (
    <Screen padTop={false} wide>
      <ScreenHeader
        eyebrow="Data & Sumber Manusia"
        title="Statistik Kelengkapan Data"
        subtitle="Peratus kelengkapan profil ahli, mengikut kategori"
        onBackPress={goBack}
      />

      <View className={desktop ? 'gap-4 px-1 pb-6 pt-4' : 'gap-5 px-gutter pb-8 pt-5'}>
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        {state.step === 'memuat' ? <LoadingCards /> : null}

        {state.step === 'gagal' ? (
          <>
            <Notice tone="negative" message={state.message} />
            <Button label="Cuba Lagi" variant="secondary" onPress={() => void load()} />
          </>
        ) : null}

        {state.step === 'sedia' ? (
          <Summary data={state.data} exporting={exporting} onExport={(mode) => void exportReport(mode)} />
        ) : null}
      </View>
    </Screen>
  );
}

function Summary({
  data,
  exporting,
  onExport,
}: {
  data: MemberCompletenessSummary;
  exporting: DeliveryMode | null;
  onExport: (mode: DeliveryMode) => void;
}) {
  const total = data.jumlah_ahli;
  const kemaskini = data.kemaskini_terkini
    ? new Date(data.kemaskini_terkini).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Tiada rekod';

  const bucketRows = data.mengikut_bucket.map((bucket) => ({
    key: String(bucket.peratus),
    label: bucket.peratus + '% Lengkap',
    value: bucket.jumlah,
    note: pct(bucket.jumlah, total),
  }));

  const kategori = data.mengikut_kategori;
  const kategoriRows = [
    { key: 'data_peribadi', label: 'Data Peribadi', value: kategori.data_peribadi },
    { key: 'pendidikan', label: 'Pendidikan', value: kategori.pendidikan },
    { key: 'pekerjaan', label: 'Pekerjaan', value: kategori.pekerjaan },
    { key: 'keluarga', label: 'Keluarga', value: kategori.keluarga },
    { key: 'jawatan', label: 'Jawatan', value: kategori.jawatan },
  ].map((row) => ({ ...row, note: pct(row.value, total) }));

  return (
    <>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <SummaryStrip
          items={[
            { value: String(total), label: 'ahli aktif' },
            { value: kemaskini, label: 'kemaskini data terkini' },
          ]}
        />
      </View>

      <SaveShareButtons
        kind="file"
        webLabel="Muat Turun Laporan (.xlsx)"
        nativeCaption="Kelengkapan Data Ahli (.xlsx)"
        busy={exporting}
        onPress={onExport}
      />

      <StatCard title="Kelengkapan Keseluruhan" caption="Bilangan kategori siap ÷ 5, setiap ahli">
        <ValueBars rows={bucketRows} format={(value) => value + ' ahli'} />
      </StatCard>

      <StatCard title="Kelengkapan Mengikut Kategori" caption="Bilangan ahli yang Siap bagi setiap kategori">
        <ValueBars rows={kategoriRows} format={(value) => value + ' ahli'} />
      </StatCard>

      <Text className="text-center text-xs text-ink-faint">
        {'Peratus di sebelah setiap bar daripada ' + total + ' ahli aktif · ahli disekat tidak dikira'}
      </Text>
    </>
  );
}

/** Rangka kad semasa memuat — bentuk yang sama dengan kad sebenar, supaya skrin tidak melompat. */
function LoadingCards() {
  return (
    <View accessibilityLabel="Memuatkan statistik kelengkapan data" className="gap-5">
      {[0, 1].map((index) => (
        <View key={index} className="h-48 rounded-card border border-line bg-surface p-card">
          <View className="h-4 w-40 rounded-pill bg-line" />
          <View className="mt-5 h-3 w-full rounded-pill bg-primary-tint" />
          <View className="mt-3 h-3 w-4/5 rounded-pill bg-primary-tint" />
          <View className="mt-3 h-3 w-3/5 rounded-pill bg-primary-tint" />
        </View>
      ))}
    </View>
  );
}
