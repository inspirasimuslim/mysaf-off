import { View } from 'react-native';

import { StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { Figure, MonthColumns, SplitBar, StatShell, ValueBars, compactRm, formatRm } from '@/components/stat-charts';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Colors } from '@/constants/theme';
import { usePipisAccess } from '@/lib/department-access';
import { useStat, type PipisStat } from '@/lib/statistik';
import { generationLabel } from '@/types/database';

/**
 * Statistik PIPIS — sumbangan berjaya (`status = 'success'`) mengikut bulan dan
 * generasi, serta terkumpul vs baki berbanding sasaran seorang. Formula sama
 * seperti `pipis_member_summary()`: baki setiap ahli dilantaikan pada 0.
 * Data daripada `stat_pipis()`.
 */
export default function StatistikPipisScreen() {
  const access = usePipisAccess();
  const { year, setYear, data, loading, error, reload } = useStat<PipisStat>('stat_pipis', access.canView);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Statistik PIPIS" description="Statistik ini khusus untuk admin Lajnah Ekonomi dan Aset." />;
  }

  return (
    <StatShell
      eyebrow="Statistik · PIPIS"
      title="Statistik PIPIS"
      subtitle="Kutipan sumbangan PIPIS ASET"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}>
      {(stat) => {
        const r = stat.ringkasan;
        return (
          <>
            <View className="flex-row flex-wrap gap-3">
              <Figure value={formatRm(r.terkumpul)} label="Terkumpul (keseluruhan)" />
              <Figure value={formatRm(stat.jumlah_tahun)} label={'Kutipan ' + year} />
            </View>

            <StatCard title="Kutipan mengikut bulan" caption={'Jumlah sumbangan berjaya, ' + year}>
              <MonthColumns
                key={year}
                values={stat.bulanan.map((row) => row.jumlah)}
                format={formatRm}
                axisFormat={compactRm}
              />
            </StatCard>

            <StatCard title="Kutipan mengikut generasi" caption="Jumlah terkumpul keseluruhan setiap generasi">
              <ValueBars
                rows={stat.generasi.map((row) => ({
                  key: row.generasi,
                  label: generationLabel(row.generasi),
                  value: row.jumlah,
                  note: row.ahli + ' ahli',
                }))}
                format={formatRm}
              />
            </StatCard>

            <StatCard
              title="Terkumpul vs baki"
              caption={'Sasaran ' + formatRm(r.sasaran_seorang) + ' seorang × ' + r.jumlah_ahli + ' ahli = ' + formatRm(r.sasaran_jumlah)}>
              <SplitBar
                format={formatRm}
                parts={[
                  { label: 'Terkumpul', value: r.terkumpul, color: Colors.primaryMid },
                  { label: 'Baki belum dikutip', value: r.baki, color: '#D97706' },
                ]}
              />
              <View style={{ height: 12 }} />
              <ValueBars
                rows={[{ key: 'cukup', label: 'Ahli telah cukup sasaran', value: r.ahli_cukup, note: 'daripada ' + r.jumlah_ahli }]}
                format={(value) => String(value)}
              />
            </StatCard>

            <StatCard title="Baki mengikut generasi" caption="Jumlah baki setiap ahli hingga sasaran (lebihan tidak menolak baki orang lain)">
              <ValueBars
                rows={stat.generasi.map((row) => ({
                  key: row.generasi,
                  label: generationLabel(row.generasi),
                  value: row.baki,
                }))}
                format={formatRm}
              />
            </StatCard>
          </>
        );
      }}
    </StatShell>
  );
}
