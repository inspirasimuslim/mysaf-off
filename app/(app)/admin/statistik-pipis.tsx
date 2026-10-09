import { View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import {
  Columns,
  MonthColumns,
  Panel,
  SplitBar,
  StatShell,
  SummaryStrip,
  ValueBars,
  compactRm,
  formatRm,
  generationAxisLabel,
} from '@/components/stat-charts';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { usePipisAccess } from '@/lib/department-access';
import { useStat, type PipisStat } from '@/lib/statistik';
import { generationLabel } from '@/types/database';
import { useColors } from '@/lib/theme';

/**
 * Statistik PIPIS — sumbangan berjaya (`status = 'success'`) mengikut bulan dan
 * generasi, serta terkumpul vs baki berbanding sasaran seorang. Formula sama
 * seperti `pipis_member_summary()`: baki setiap ahli dilantaikan pada 0.
 * Data daripada `stat_pipis()`.
 */
export default function StatistikPipisScreen() {
  const colors = useColors();
  const access = usePipisAccess();
  const { year, setYear, data, loading, error, reload } = useStat<PipisStat>('stat_pipis', access.canView);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Statistik PIPIS" description="Statistik ini khusus untuk admin Lajnah Ekonomi dan Aset." />;
  }

  return (
    <StatShell
      eyebrow="Ekonomi & Aset"
      title="Statistik PIPIS"
      subtitle="Kutipan sumbangan PIPIS ASET"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      summary={(stat) => (
        <SummaryStrip
          items={[
            { value: formatRm(stat.ringkasan.terkumpul), label: 'terkumpul' },
            { value: formatRm(stat.jumlah_tahun), label: 'kutipan ' + year },
            { value: stat.ringkasan.ahli_cukup + '/' + stat.ringkasan.jumlah_ahli, label: 'ahli cukup sasaran' },
          ]}
        />
      )}>
      {(stat) => {
        const r = stat.ringkasan;
        return (
          <>
            <Panel title="Kutipan mengikut bulan" caption={'Jumlah sumbangan berjaya, ' + year}>
              <MonthColumns key={year} values={stat.bulanan.map((row) => row.jumlah)} format={formatRm} axisFormat={compactRm} />
            </Panel>

            <Panel
              title="Terkumpul vs baki"
              caption={'Sasaran ' + formatRm(r.sasaran_seorang) + ' × ' + r.jumlah_ahli + ' ahli = ' + formatRm(r.sasaran_jumlah)}>
              <SplitBar
                format={formatRm}
                parts={[
                  { label: 'Terkumpul', value: r.terkumpul, color: colors.primaryMid },
                  { label: 'Baki belum dikutip', value: r.baki, color: '#D97706' },
                ]}
              />
              <View style={{ height: 10 }} />
              <ValueBars
                rows={[{ key: 'cukup', label: 'Ahli telah cukup sasaran', value: r.ahli_cukup, note: 'daripada ' + r.jumlah_ahli }]}
                format={(value) => String(value)}
              />
            </Panel>

            <Panel title="Kutipan mengikut generasi" caption="Terkumpul keseluruhan">
              <Columns
                values={stat.generasi.map((row) => row.jumlah)}
                labels={stat.generasi.map((row) => generationAxisLabel(row.generasi))}
                titles={stat.generasi.map((row) => generationLabel(row.generasi))}
                format={formatRm}
                axisFormat={compactRm}
                detail={(index) => (stat.generasi[index] ? stat.generasi[index].ahli + ' ahli' : null)}
              />
            </Panel>

            <Panel title="Baki mengikut generasi" caption="Baki setiap ahli hingga sasaran (lebihan tidak menolak baki orang lain)">
              <Columns
                values={stat.generasi.map((row) => row.baki)}
                labels={stat.generasi.map((row) => generationAxisLabel(row.generasi))}
                titles={stat.generasi.map((row) => generationLabel(row.generasi))}
                format={formatRm}
                axisFormat={compactRm}
                detail={(index) => (stat.generasi[index] ? stat.generasi[index].ahli + ' ahli' : null)}
              />
            </Panel>
          </>
        );
      }}
    </StatShell>
  );
}
