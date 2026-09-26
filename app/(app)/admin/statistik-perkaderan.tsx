import { Text, View } from 'react-native';

import { StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { Figure, MonthColumns, StatShell, ValueBars } from '@/components/stat-charts';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { usePerkaderanAccess } from '@/lib/department-access';
import { useStat, type PerkaderanStat } from '@/lib/statistik';

/** Nama sekolah dalam huruf besar penuh dari DB — dilembutkan untuk dibaca. */
function sekolahLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\b(Smka|Smk|Sma|Tg)\b/g, (word) => word.toUpperCase());
}

/**
 * Statistik Perkaderan — naqib/naqibah aktif dikumpul mengikut sekolah, dan
 * kekerapan sesi usrah sekolah mengikut bulan. Data daripada `stat_perkaderan()`.
 */
export default function StatistikPerkaderanScreen() {
  const access = usePerkaderanAccess();
  const { year, setYear, data, loading, error, reload } = useStat<PerkaderanStat>('stat_perkaderan', access.canView);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Statistik Perkaderan" description="Statistik ini khusus untuk admin Lajnah Perkaderan." />;
  }

  return (
    <StatShell
      eyebrow="Statistik · Perkaderan"
      title="Statistik Perkaderan"
      subtitle="Naqib/naqibah mengikut sekolah dan kekerapan usrah"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}>
      {(stat) => (
        <>
          <View className="flex-row flex-wrap gap-3">
            <Figure value={String(stat.jumlah_naqib)} label="Naqib/naqibah aktif" hint="Keadaan semasa" />
            <Figure value={String(stat.jumlah_sesi)} label={'Sesi usrah ' + year} />
          </View>

          <StatCard title="Kekerapan usrah mengikut bulan" caption={'Bilangan sesi direkod, ' + year}>
            <MonthColumns
              key={year}
              values={stat.sesi_bulanan.map((row) => row.sesi)}
              format={(value) => value + ' sesi'}
            />
          </StatCard>

          <StatCard title="Naqib/naqibah mengikut sekolah" caption="Keadaan semasa (tidak bergantung pada tahun)">
            <ValueBars
              sorted
              rows={stat.sekolah.map((row) => ({
                key: row.sekolah,
                label: sekolahLabel(row.sekolah),
                value: row.bilangan_naqib,
              }))}
              format={(value) => value + ' orang'}
            />
          </StatCard>

          {stat.sekolah.map((row) => (
            <StatCard
              key={row.sekolah}
              title={sekolahLabel(row.sekolah)}
              caption={row.bilangan_naqib + ' naqib/naqibah'}>
              <View className="gap-3">
                {row.naqib.map((naqib, index) => (
                  <View key={naqib.nama + index} className="flex-row items-baseline gap-2">
                    <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
                      {naqib.nama}
                    </Text>
                    {naqib.kumpulan ? <Text className="text-xs text-ink-muted">{naqib.mad_u + ' mad’u'}</Text> : null}
                  </View>
                ))}
              </View>
            </StatCard>
          ))}
        </>
      )}
    </StatShell>
  );
}
