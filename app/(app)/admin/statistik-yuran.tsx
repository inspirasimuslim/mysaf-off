import { View } from 'react-native';

import { StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { Figure, MonthColumns, StatShell, ValueBars, compactRm, formatRm } from '@/components/stat-charts';
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
      eyebrow="Statistik · Yuran"
      title="Statistik Yuran"
      subtitle="Kutipan dan tunggakan yuran keahlian"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}>
      {(stat) => (
        <>
          <View className="flex-row flex-wrap gap-3">
            <Figure value={formatRm(stat.jumlah_kutipan_tahun)} label={'Kutipan berjaya ' + year} />
            <Figure
              value={formatRm(stat.tunggakan.jumlah)}
              label={'Jumlah tunggakan hingga ' + year}
              hint={stat.tunggakan.ahli_tertunggak + ' daripada ' + stat.tunggakan.jumlah_ahli + ' ahli'}
            />
          </View>

          <StatCard title="Kutipan berjaya mengikut bulan" caption={'Jumlah bayaran berjaya, ' + year}>
            <MonthColumns
              key={year}
              values={stat.bulanan.map((row) => row.jumlah)}
              format={formatRm}
              axisFormat={compactRm}
            />
          </StatCard>

          <StatCard title="Tunggakan mengikut generasi" caption={'Termasuk tahun terdahulu hingga ' + year}>
            <ValueBars
              rows={stat.tunggakan_generasi.map((row) => ({
                key: row.generasi,
                label: generationLabel(row.generasi),
                value: row.tunggak,
                note: row.ahli_tertunggak + ' ahli',
              }))}
              format={formatRm}
            />
          </StatCard>
        </>
      )}
    </StatShell>
  );
}
