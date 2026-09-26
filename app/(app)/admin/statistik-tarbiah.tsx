import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { RankedBars, StatCard } from '@/components/member-stats';
import { NoAccessScreen } from '@/components/no-access';
import { Figure, MonthColumns, StatShell, ValueBars, formatPercent } from '@/components/stat-charts';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Segmented } from '@/components/ui/segmented';
import { useUsrahAccess } from '@/lib/department-access';
import { useStat, type AttendanceCell, type TarbiahStat } from '@/lib/statistik';
import { KAWASAN_USRAH_OPTIONS, generationLabel } from '@/types/database';

type Metric = 'jumlah' | 'peratus';

const ALL = '__semua__';

const METRIC_OPTIONS = [
  { value: 'jumlah' as const, label: 'Bilangan hadir' },
  { value: 'peratus' as const, label: 'Peratus' },
];

function kawasanLabel(code: string): string {
  const option = KAWASAN_USRAH_OPTIONS.find((row) => row.value === code);
  return option ? option.label + ' (' + code + ')' : code;
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
    return cell.hadir + ' hadir daripada ' + cell.direkod + ' direkod · ' + formatPercent(cell.peratus);
  };
}

/**
 * Statistik Tarbiah — kehadiran usrah bulanan (`usrah_monthly_attendance`) dan
 * taburan ahli. Kiraan datang daripada `stat_tarbiah()`; peratus = hadir ÷
 * ahli yang ADA rekod bulan itu (bulan tanpa rekod tidak dikira sebagai 0%).
 */
export default function StatistikTarbiahScreen() {
  const access = useUsrahAccess();
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
      eyebrow="Statistik · Tarbiah"
      title="Statistik Tarbiah"
      subtitle="Kehadiran usrah bulanan dan taburan ahli"
      year={year}
      onYear={setYear}
      data={data}
      loading={loading}
      error={error}
      onRetry={() => void reload()}>
      {(stat) => {
        const kawasanCells: AttendanceCell[] =
          kawasan === ALL ? stat.semua_bulanan : stat.kawasan_bulanan.filter((row) => row.kawasan === kawasan);
        const generasiCells: AttendanceCell[] =
          generasi === ALL ? stat.semua_bulanan : stat.generasi_bulanan.filter((row) => row.generasi === generasi);
        const totalAttended = stat.semua_bulanan.reduce((sum, row) => sum + row.hadir, 0);

        return (
          <>
            <Figure value={String(stat.jumlah_ahli)} label="Jumlah ahli semasa" hint={'Kehadiran direkod ' + year + ': ' + totalAttended + ' kali hadir'} />

            <StatCard title="Kehadiran mengikut kawasan usrah" caption={'Setiap bulan, ' + year}>
              <PickerField
                label="Kawasan"
                value={kawasan}
                options={kawasanOptions}
                clearable={false}
                onChange={(next) => next && setKawasan(next)}
              />
              <Spacer />
              <Segmented value={kawasanMetric} options={METRIC_OPTIONS} onChange={setKawasanMetric} />
              <Spacer />
              <MonthColumns
                key={kawasan + kawasanMetric + year}
                values={series(kawasanCells, kawasanMetric)}
                format={(value) => (kawasanMetric === 'jumlah' ? value + ' hadir' : formatPercent(value))}
                axisFormat={(value) => (kawasanMetric === 'jumlah' ? String(value) : value + '%')}
                detail={detailFor(kawasanCells)}
              />
            </StatCard>

            <StatCard title="Perbandingan kawasan" caption={'% kehadiran setahun, ' + year}>
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
            </StatCard>

            <StatCard title="Kehadiran mengikut generasi" caption={'Setiap bulan, ' + year}>
              <PickerField
                label="Generasi"
                value={generasi}
                options={generasiOptions}
                clearable={false}
                onChange={(next) => next && setGenerasi(next)}
              />
              <Spacer />
              <Segmented value={generasiMetric} options={METRIC_OPTIONS} onChange={setGenerasiMetric} />
              <Spacer />
              <MonthColumns
                key={generasi + generasiMetric + year}
                values={series(generasiCells, generasiMetric)}
                format={(value) => (generasiMetric === 'jumlah' ? value + ' hadir' : formatPercent(value))}
                axisFormat={(value) => (generasiMetric === 'jumlah' ? String(value) : value + '%')}
                detail={detailFor(generasiCells)}
              />
            </StatCard>

            <StatCard title="Perbandingan generasi" caption={'% kehadiran setahun, ' + year}>
              <ValueBars
                rows={stat.generasi_tahunan.map((row) => ({
                  key: row.generasi,
                  label: generationLabel(row.generasi),
                  value: row.peratus ?? 0,
                  note: row.hadir + '/' + row.direkod,
                }))}
                format={(value) => formatPercent(value)}
              />
            </StatCard>

            <StatCard title="Ahli mengikut kawasan usrah" caption="Keadaan semasa (tidak bergantung pada tahun)">
              <RankedBars slices={stat.kawasan_ahli} total={stat.jumlah_ahli} formatLabel={kawasanLabel} />
            </StatCard>
          </>
        );
      }}
    </StatShell>
  );
}

function Spacer() {
  return <View style={{ height: 12 }} />;
}
