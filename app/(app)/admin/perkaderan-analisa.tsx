import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Panel, SummaryStrip, ValueBars } from '@/components/stat-charts';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { SaveShareButtons } from '@/components/save-share-buttons';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { type AnalisaUsrah, downloadAnalisaUsrah, fetchAnalisaUsrah, pct } from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';

const fmt = (v: number | null) => (v == null ? '—' : Math.round(v) + '%');

/**
 * Analisa Usrah — admin Lajnah Perkaderan / Super Admin sahaja.
 * Liputan = bulan yang ada sesi / bulan sepatutnya (sasaran sebulan sekali). Kehadiran = hadir / peluang hadir mad'u aktif.
 */
export default function PerkaderanAnalisaScreen() {
  const goBack = useGoBack();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canView } = usePerkaderanAccess();
  const allowed = isSuperAdmin() || canView;

  const tahun = new Date().getFullYear();
  const [tempoh, setTempoh] = useState<'tahun' | 'lepas'>('tahun');
  const [data, setData] = useState<AnalisaUsrah | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const y = tempoh === 'tahun' ? tahun : tahun - 1;
      setData(await fetchAnalisaUsrah(y + '-01-01', tempoh === 'tahun' ? null : y + '-12-31'));
    } catch (caught) {
      setError(toMalayErrorVerbose(caught, 'Gagal memuatkan analisa.'));
    } finally {
      setLoading(false);
    }
  }, [tahun, tempoh]);

  useEffect(() => {
    if (!permLoading && !accessLoading && allowed) void load();
  }, [accessLoading, allowed, load, permLoading]);

  const exportReport = async (mode: DeliveryMode) => {
    if (!data || exporting) return;
    setNotice(null);
    setExporting(mode);
    try {
      const report = await downloadAnalisaUsrah(data, mode);
      setNotice({
        tone: report.result === 'cancelled' ? 'info' : 'positive',
        message: deliveryMessage(report.result, report.fileName, report.rows + ' kumpulan'),
      });
    } catch (caught) {
      setNotice({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menjana laporan.') });
    } finally {
      setExporting(null);
    }
  };

  if (permLoading || accessLoading) return <LoadingScreen />;
  if (!allowed) return <NoAccessScreen title="Analisa Usrah" description="Hanya untuk admin Lajnah Perkaderan dan Super Admin." />;

  const k = data?.kumpulan ?? [];
  const sum = (f: (x: (typeof k)[number]) => number) => k.reduce((a, x) => a + f(x), 0);
  const liputan = pct(sum((x) => x.bulan_ada), sum((x) => x.bulan_sepatutnya));
  const kehadiran = pct(sum((x) => x.hadir), sum((x) => x.peluang));

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Analisa Usrah" onBackPress={goBack} />
      <View className="gap-4 px-gutter pb-10">
        {error ? <Notice tone="negative" message={error} /> : null}
        {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}
        <Segmented
          label="Tempoh"
          value={tempoh}
          options={[
            { value: 'tahun', label: 'Tahun ' + tahun },
            { value: 'lepas', label: 'Tahun ' + (tahun - 1) },
          ]}
          onChange={setTempoh}
        />
        {loading ? <LoadingScreen /> : null}
        {!loading && k.length === 0 ? (
          <EmptyState icon="stats-chart-outline" title="Belum ada kumpulan" description="Analisa muncul selepas kumpulan usrah sekolah dicipta dan sesi direkod." />
        ) : null}
        {!loading && k.length > 0 ? (
          <>
            <SummaryStrip
              items={[
                { value: String(k.length), label: 'kumpulan aktif' },
                { value: fmt(liputan), label: 'liputan bulan' },
                { value: fmt(kehadiran), label: 'kehadiran mad\'u' },
                { value: String(sum((x) => x.sesi)), label: 'sesi direkod' },
              ]}
            />
            <Text className="text-xs text-ink-muted">
              Liputan = bulan yang ada sesi daripada bulan sepatutnya (sasaran sebulan sekali, dikira dari bulan kumpulan dicipta). Kehadiran = mad'u hadir daripada peluang hadir.
            </Text>

            <SaveShareButtons
              kind="file"
              variant="secondary"
              webLabel="Muat Turun Laporan (Excel)"
              nativeCaption="Analisa Usrah (.xlsx)"
              busy={exporting}
              onPress={(mode) => void exportReport(mode)}
            />

            <Panel title="Kumpulan yang ada sesi setiap bulan" caption="Berapa kumpulan melapor pada bulan itu" full>
              <ValueBars
                format={(v) => Math.round(v) + '%'}
                rows={(data?.bulanan ?? []).map((b) => ({
                  key: b.bulan,
                  label: b.bulan,
                  value: pct(b.kumpulan_ada, b.kumpulan_sepatutnya) ?? 0,
                  fill: (pct(b.kumpulan_ada, b.kumpulan_sepatutnya) ?? 0) / 100,
                  display: b.kumpulan_ada + '/' + b.kumpulan_sepatutnya,
                  note: '',
                }))}
              />
            </Panel>

            <Panel title="Kehadiran mad'u setiap kumpulan" caption="Disusun mengikut sekolah" full>
              <ValueBars
                format={(v) => Math.round(v) + '%'}
                rows={k.map((x) => ({
                  key: x.group_id,
                  label: x.group_name ?? x.sekolah,
                  value: pct(x.hadir, x.peluang) ?? 0,
                  fill: (pct(x.hadir, x.peluang) ?? 0) / 100,
                  display: fmt(pct(x.hadir, x.peluang)),
                  note: x.sesi + ' sesi · ' + x.madu + " mad'u",
                }))}
              />
            </Panel>

            <Panel title="Liputan bulan setiap kumpulan" caption="Bulan tanpa sesi ditunjukkan di bawah nama kumpulan" full>
              <View className="gap-3">
                {k.map((x) => (
                  <View key={x.group_id} className="rounded-card border border-line p-3">
                    <Text className="text-base font-semibold text-ink">{x.group_name ?? x.sekolah}</Text>
                    <Text className="text-xs text-ink-muted">
                      {x.bulan_ada}/{x.bulan_sepatutnya} bulan ({fmt(pct(x.bulan_ada, x.bulan_sepatutnya))}) · Fikrah diliputi {x.unit_silibus} · Bonding {x.sesi_bonding}
                      {x.sesi_terakhir ? ' · sesi terakhir ' + x.sesi_terakhir : ''}
                    </Text>
                    {x.bulan_tiada.length > 0 ? (
                      <Text className="mt-1 text-xs text-ink">Tiada sesi: {x.bulan_tiada.join(', ')}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Panel>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
