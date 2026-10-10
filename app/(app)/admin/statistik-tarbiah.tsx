import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import {
  Columns,
  MonthColumns,
  Panel,
  StatShell,
  SummaryStrip,
  ValueBars,
  formatPercent,
  generationAxisLabel,
} from '@/components/stat-charts';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Segmented } from '@/components/ui/segmented';
import { useUsrahKawasanAccess } from '@/lib/department-access';
import { useStat, type AttendanceCell, type TarbiahStat } from '@/lib/statistik';
import { KAWASAN_USRAH_OPTIONS, generationLabel } from '@/types/database';

type Metric = 'jumlah' | 'peratus';

const ALL = '__semua__';

const METRIC_OPTIONS = [
  { value: 'jumlah' as const, label: 'Hadir' },
  { value: 'peratus' as const, label: 'Peratus' },
];

/** Tidak menambah '(kod)' jika label itu sendiri sudah mengandungnya (cth 'UP'). */
function kawasanLabel(code: string): string {
  const option = KAWASAN_USRAH_OPTIONS.find((row) => row.value === code);
  if (!option) return code;
  if (option.label.endsWith('(' + code + ')')) return option.label;
  return option.label + ' (' + code + ')';
}

/** 12 nilai (Jan–Dis) untuk carta, daripada baris yang sudah dikira oleh SQL. */
function series(cells: AttendanceCell[], metric: Metric): (number | null)[] {
  return Array.from({ length: 12 }, (_, index) => {
    const cell = cells.find((row) => row.bulan === index + 1);
    if (!cell || cell.direkod === 0) return null;
    return metric === 'jumlah' ? cell.hadir : cell.peratus;
  });
}

function detailFor(cells: AttendanceCell[]) {
  return (index: number) => {
    const cell = cells.find((row) => row.bulan === index + 1);
    if (!cell || cell.direkod === 0) return null;
    return cell.hadir + '/' + cell.direkod + ' · ' + formatPercent(cell.peratus);
  };
}

/**
 * Statistik Tarbiah — kehadiran usrah bulanan (`usrah_monthly_attendance`) dan
 * taburan ahli. Kiraan datang daripada `stat_tarbiah()`; peratus = hadir ÷
 * ahli yang ADA rekod bulan itu (bulan tanpa rekod tidak dikira sebagai 0%).
 */
export default function StatistikTarbiahScreen() {
  const access = useUsrahKawasanAccess();
  const { year, setYear, data, loading, error, reload } = useStat<TarbiahStat>('stat_tarbiah', access.canView);

  const [kawasan, setKawasan] = useState(ALL);
  const [kawasanMetric, setKawasanMetric] = useState<Metric>('jumlah');
  const [generasi, setGenerasi] = useState(ALL);
  const [generasiMetric, setGenerasiMetric] = useState<Metric>('jumlah');

  const kawasanOptions = useMemo(() => {
    const codes = [...new Set((data?.kawasan_bulanan ?? []).map((row) => row.kawasan))];
    return [{ value: ALL, label: 'Semua kawasan' }, ...codes.map((code) => ({ value: code, label: kawasanLabel(code) }))];
  }, [data]);

  const generasiOptions = useMemo(() => {
    const codes = [...new Set((data?.generasi_bulanan ?? []).map((row) => row.generasi))];
    return [{ value: ALL, label: 'Semua generasi' }, ...codes.map((code) => ({ value: code, label: generationLabel(code) }))];
  }, [data]);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Statistik Tarbiah" description="Statistik ini khusus untuk admin Lajnah Tarbiah." />;
  }

  return (
    <StatShell
      eyebrow="Tarbiah"
      title="Statistik Tarbiah"
      subtitle="Kehadiran usrah bulanan dan taburan ahli"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      summary={(stat) => {
        const attended = stat.semua_bulanan.reduce((sum, row) => sum + row.hadir, 0);
        const recorded = stat.semua_bulanan.reduce((sum, row) => sum + row.direkod, 0);
        return (
          <SummaryStrip
            items={[
              { value: String(stat.jumlah_ahli), label: 'ahli' },
              { value: String(attended), label: 'kali hadir ' + year },
              { value: recorded ? formatPercent(Math.round((attended * 1000) / recorded) / 10) : '—', label: 'kehadiran ' + year },
            ]}
          />
        );
      }}>
      {(stat) => {
        const kawasanCells: AttendanceCell[] =
          kawasan === ALL ? stat.semua_bulanan : stat.kawasan_bulanan.filter((row) => row.kawasan === kawasan);
        const generasiCells: AttendanceCell[] =
          generasi === ALL ? stat.semua_bulanan : stat.generasi_bulanan.filter((row) => row.generasi === generasi);

        return (
          <>
            <Panel
              title="Kehadiran mengikut kawasan usrah"
              caption={'Setiap bulan, ' + year}
              controls={
                <>
                  <View className="flex-1">
                    <PickerField compact label="Kawasan" value={kawasan} options={kawasanOptions} clearable={false} onChange={(next) => next && setKawasan(next)} />
                  </View>
                  <View className="flex-1">
                    <Segmented compact value={kawasanMetric} options={METRIC_OPTIONS} onChange={setKawasanMetric} />
                  </View>
                </>
              }>
              <MonthColumns
                key={kawasan + kawasanMetric + year}
                values={series(kawasanCells, kawasanMetric)}
                format={(value) => (kawasanMetric === 'jumlah' ? value + ' hadir' : formatPercent(value))}
                axisFormat={(value) => (kawasanMetric === 'jumlah' ? String(value) : value + '%')}
                detail={detailFor(kawasanCells)}
              />
            </Panel>

            <Panel
              title="Kehadiran mengikut generasi"
              caption={'Setiap bulan, ' + year}
              controls={
                <>
                  <View className="flex-1">
                    <PickerField compact label="Generasi" value={generasi} options={generasiOptions} clearable={false} onChange={(next) => next && setGenerasi(next)} />
                  </View>
                  <View className="flex-1">
                    <Segmented compact value={generasiMetric} options={METRIC_OPTIONS} onChange={setGenerasiMetric} />
                  </View>
                </>
              }>
              <MonthColumns
                key={generasi + generasiMetric + year}
                values={series(generasiCells, generasiMetric)}
                format={(value) => (generasiMetric === 'jumlah' ? value + ' hadir' : formatPercent(value))}
                axisFormat={(value) => (generasiMetric === 'jumlah' ? String(value) : value + '%')}
                detail={detailFor(generasiCells)}
              />
            </Panel>

            <Panel title="Perbandingan kawasan" caption={'% kehadiran setahun, ' + year}>
              <ValueBars
                sorted
                rows={stat.kawasan_tahunan.map((row) => ({
                  key: row.kawasan,
                  label: kawasanLabel(row.kawasan),
                  value: row.peratus ?? 0,
                  note: row.hadir + '/' + row.direkod,
                }))}
                format={(value) => formatPercent(value)}
              />
            </Panel>

            <Panel title="Perbandingan generasi" caption={'% kehadiran setahun, ' + year}>
              <Columns
                key={'gen' + year}
                values={stat.generasi_tahunan.map((row) => row.peratus)}
                labels={stat.generasi_tahunan.map((row) => generationAxisLabel(row.generasi))}
                titles={stat.generasi_tahunan.map((row) => generationLabel(row.generasi))}
                format={(value) => formatPercent(value)}
                axisFormat={(value) => value + '%'}
                detail={(index) => {
                  const row = stat.generasi_tahunan[index];
                  return row ? row.hadir + '/' + row.direkod : null;
                }}
              />
            </Panel>

            <Panel full title="Ahli mengikut kawasan usrah" caption="Keadaan semasa (tidak bergantung pada tahun)">
              <ValueBars
                columns={2}
                rows={stat.kawasan_ahli.map((row) => ({
                  key: row.label,
                  label: kawasanLabel(row.label),
                  value: row.count,
                  note: Math.round((row.count / Math.max(1, stat.jumlah_ahli)) * 100) + '%',
                }))}
                format={(value) => String(value)}
              />
            </Panel>

            <Panel full title="Liputan Kumpulan Usrah" caption="Jumlah kumpulan & ahli yang sudah berkumpulan mengikut kawasan (keadaan semasa)">
              <ValueBars
                columns={2}
                rows={stat.kumpulan_usrah_liputan.map((row) => ({
                  key: row.kawasan,
                  label: kawasanLabel(row.kawasan),
                  value: row.jumlah_kumpulan,
                  note: row.ahli_berkumpulan + '/' + row.jumlah_ahli + ' ahli berkumpulan',
                }))}
                format={(value) => value + ' kumpulan'}
              />
            </Panel>

            <Panel full title="Senarai Kumpulan Usrah" caption="Setiap kumpulan dengan naqib yang dilantik (keadaan semasa)">
              {stat.kumpulan_usrah.length === 0 ? (
                <Text className="py-4 text-center text-sm text-ink-muted">Belum ada kumpulan usrah direkod.</Text>
              ) : (
                <View className="gap-2">
                  {stat.kumpulan_usrah.map((row) => (
                    <Card key={row.kawasan + '|' + row.nama}>
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-ink">{row.nama}</Text>
                          <Text className="text-xs text-ink-muted">
                            {kawasanLabel(row.kawasan)} · {row.naqib.length === 0 ? 'Tiada naqib' : row.naqib.join(', ')}
                          </Text>
                        </View>
                        <Badge label={row.jumlah_ahli + ' ahli'} tone="neutral" />
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </Panel>
          </>
        );
      }}
    </StatShell>
  );
}
