import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { MonthColumns, Panel, StatShell, SummaryStrip, ValueBars } from '@/components/stat-charts';
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
      eyebrow="Perkaderan"
      title="Statistik Perkaderan"
      subtitle="Naqib/naqibah mengikut sekolah dan kekerapan usrah"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      summary={(stat) => (
        <SummaryStrip
          items={[
            { value: String(stat.jumlah_naqib), label: 'naqib/naqibah aktif' },
            { value: String(stat.sekolah.length), label: 'sekolah' },
            { value: String(stat.jumlah_sesi), label: 'sesi ' + year },
          ]}
        />
      )}>
      {(stat) => (
        <>
          <Panel title="Kekerapan usrah mengikut bulan" caption={'Bilangan sesi direkod, ' + year}>
            <MonthColumns key={year} values={stat.sesi_bulanan.map((row) => row.sesi)} format={(value) => value + ' sesi'} />
          </Panel>

          <Panel title="Naqib/naqibah mengikut sekolah" caption="Keadaan semasa (tidak bergantung pada tahun)">
            <ValueBars
              sorted
              rows={stat.sekolah.map((row) => ({
                key: row.sekolah,
                label: sekolahLabel(row.sekolah),
                value: row.bilangan_naqib,
              }))}
              format={(value) => value + ' orang'}
            />
          </Panel>

          <Panel full title="Senarai naqib/naqibah mengikut sekolah">
            <View className="flex-row flex-wrap gap-x-6 gap-y-3">
              {stat.sekolah.map((row) => (
                <View key={row.sekolah} style={{ flexBasis: 240, flexGrow: 1 }}>
                  <Text className="text-sm font-bold text-ink">
                    {sekolahLabel(row.sekolah) + ' (' + row.bilangan_naqib + ')'}
                  </Text>
                  {row.naqib.map((naqib, index) => (
                    <View key={naqib.nama + index} className="mt-1 flex-row items-baseline gap-2">
                      <Text className="flex-1 text-sm text-ink" numberOfLines={2}>
                        {naqib.nama}
                      </Text>
                      {naqib.kumpulan ? <Text className="text-xs text-ink-muted">{naqib.mad_u + ' mad’u'}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Panel>
        </>
      )}
    </StatShell>
  );
}
