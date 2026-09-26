import { NoAccessScreen } from '@/components/no-access';
import {
  Columns,
  MonthColumns,
  Panel,
  StatShell,
  SummaryStrip,
  compactRm,
  formatRm,
  generationAxisLabel,
} from '@/components/stat-charts';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useYuranAccess } from '@/lib/department-access';
import { useStat, type YuranStat } from '@/lib/statistik';
import { generationLabel } from '@/types/database';

/**
 * Statistik Yuran — kutipan berjaya mengikut bulan, dan tunggakan. Tunggakan
 * seorang ahli = caj ledger − bayaran berjaya sehingga tahun dipilih,
 * dilantaikan pada 0 (sama seperti `yuran_year_report()`). Baki permulaan
 * ('import_opening') tidak dikira sebagai kutipan bulan. Data daripada
 * `stat_yuran()`.
 */
export default function StatistikYuranScreen() {
  const access = useYuranAccess();
  const { year, setYear, data, loading, error, reload } = useStat<YuranStat>('stat_yuran', access.canView);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Statistik Yuran" description="Statistik ini khusus untuk admin Bendahari." />;
  }

  return (
    <StatShell
      eyebrow="Bendahari"
      title="Statistik Yuran"
      subtitle="Kutipan dan tunggakan yuran keahlian"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      summary={(stat) => (
        <SummaryStrip
          items={[
            { value: formatRm(stat.jumlah_kutipan_tahun), label: 'kutipan ' + year },
            { value: formatRm(stat.tunggakan.jumlah), label: 'tunggakan hingga ' + year },
            { value: stat.tunggakan.ahli_tertunggak + '/' + stat.tunggakan.jumlah_ahli, label: 'ahli tertunggak' },
          ]}
        />
      )}>
      {(stat) => (
        <>
          <Panel title="Kutipan berjaya mengikut bulan" caption={'Jumlah bayaran berjaya, ' + year}>
            <MonthColumns key={year} values={stat.bulanan.map((row) => row.jumlah)} format={formatRm} axisFormat={compactRm} />
          </Panel>

          <Panel title="Tunggakan mengikut generasi" caption={'Termasuk tahun terdahulu hingga ' + year}>
            <Columns
              key={'gen' + year}
              values={stat.tunggakan_generasi.map((row) => row.tunggak)}
              labels={stat.tunggakan_generasi.map((row) => generationAxisLabel(row.generasi))}
              titles={stat.tunggakan_generasi.map((row) => generationLabel(row.generasi))}
              format={formatRm}
              axisFormat={compactRm}
              detail={(index) => {
                const row = stat.tunggakan_generasi[index];
                return row ? row.ahli_tertunggak + ' ahli tertunggak' : null;
              }}
            />
          </Panel>
        </>
      )}
    </StatShell>
  );
}
