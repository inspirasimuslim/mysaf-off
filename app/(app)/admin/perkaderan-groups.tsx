import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { fetchNaqibOverview, fetchSekolahList, fetchSlots, type PerkaderanSlot } from '@/lib/perkaderan';
import { downloadPerkaderanReport } from '@/lib/perkaderan-report';
import { MONTH_OPTIONS, type NaqibOverview } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const ALL_MONTHS = '0';
const MONTH_FILTER_OPTIONS = [{ value: ALL_MONTHS, label: 'Semua Bulan' }, ...MONTH_OPTIONS];

/**
 * PERINGKAT 1 navigasi admin: jadual ringkasan naqib mengikut sekolah > tingkatan > kumpulan
 * (satu baris setiap naqib; naqib yang pegang >1 kumpulan muncul di setiap kumpulannya). Tap satu naqib
 * -> PERINGKAT 2 (`naqib-session-history.tsx`) -> PERINGKAT 3 (butiran sesi,
 * reuse `usrah-session-form.tsx` sedia ada, kebenaran edit tidak berubah).
 */
export default function PerkaderanGroupsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView } = usePerkaderanAccess();

  const [naqibs, setNaqibs] = useState<NaqibOverview[]>([]);
  const [slots, setSlots] = useState<{ sekolah: string; slots: PerkaderanSlot[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [yearFilter, setYearFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [overview, sekolahList] = await Promise.all([fetchNaqibOverview(), fetchSekolahList()]);
      setNaqibs(overview);
      const perSekolah = await Promise.all(sekolahList.map(async (x) => ({ sekolah: x.nama, slots: await fetchSlots(x.nama) })));
      setSlots(perSekolah.filter((x) => x.slots.length > 0));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai naqib.') });
    } finally {
      setLoading(false);
    }
  }, []);

  // `useFocusEffect` — senarai perlu segar semula selepas admin kembali dari
  // skrin butiran sesi (edit), bukan sekali sahaja.
  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  // Satu baris setiap naqib; Ting./Kump./Mad'u dipaparkan pada baris pertama kumpulan sahaja.
  const sekolahTables = useMemo(() => {
    const byId = new Map(naqibs.map((n) => [n.member_id, n]));
    return slots.map(({ sekolah, slots: list }) => {
      const sorted = [...list].sort((a, b) => a.tingkatan.localeCompare(b.tingkatan) || a.no_kumpulan - b.no_kumpulan);
      const rows: { key: string; tingkatan: string; no: number; madu: number; naqibId: string; nama: string; sesi: number; first: boolean }[] = [];
      for (const g of sorted) {
        const people: { id: string; nama: string }[] = [{ id: g.naqib_id, nama: g.naqib_nama }];
        if (g.partner_id) people.push({ id: g.partner_id, nama: g.partner_nama ?? byId.get(g.partner_id)?.full_name ?? '—' });
        for (const id of g.tambahan_ids ?? []) people.push({ id, nama: byId.get(id)?.full_name ?? '—' });
        people.forEach((pp, i) =>
          rows.push({
            key: g.group_id + pp.id,
            tingkatan: g.tingkatan.replace('Tingkatan ', ''),
            no: g.no_kumpulan,
            madu: g.madu,
            naqibId: pp.id,
            nama: pp.nama,
            sesi: byId.get(pp.id)?.session_count ?? 0,
            first: i === 0,
          }),
        );
      }
      return { sekolah, groups: sorted.length, rows };
    });
  }, [naqibs, slots]);

  const exportAll = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;

      const month = monthFilter === ALL_MONTHS ? null : Number.parseInt(monthFilter, 10);
      const year = yearFilter.trim() ? Number.parseInt(yearFilter, 10) : null;

      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadPerkaderanReport(null, null, mode, month, year);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' sesi'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menjana laporan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting, monthFilter, yearFilter],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Pantauan Usrah Sekolah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Pantauan usrah sekolah memerlukan kebenaran melihat pada department LAJNAH PERKADERAN."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false} wide>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Pantauan Usrah Sekolah"
        subtitle={naqibs.length + ' naqib aktif · ' + slots.reduce((n, x) => n + x.slots.length, 0) + ' kumpulan'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        {sekolahTables.length === 0 ? (
          <EmptyState icon="school-outline" title="Belum ada kumpulan" description="Kumpulan usrah yang dilantik akan muncul di sini." />
        ) : (
          sekolahTables.map((t) => (
            <View key={t.sekolah} className="gap-2">
              <SectionTitle title={t.sekolah} caption={t.groups + ' kumpulan · ' + t.rows.length + ' naqib · ketuk nama untuk sejarah sesi'} />
              <DataTable
                fill
                rows={t.rows}
                keyOf={(r) => r.key}
                onRowPress={(r) =>
                  router.push({
                    pathname: '/(app)/admin/naqib-session-history',
                    params: { memberId: r.naqibId, naqibName: r.nama },
                  })
                }
                columns={[
                  { key: 'ting', header: 'Ting.', width: 52, render: (r) => <CellText strong>{r.first ? 'T' + r.tingkatan : ''}</CellText> },
                  { key: 'kump', header: 'Kump.', width: 52, render: (r) => <CellText>{r.first ? 'K' + r.no : ''}</CellText> },
                  { key: 'nama', header: 'Naqib', flex: 1, render: (r) => <CellText strong>{r.nama}</CellText> },
                  { key: 'madu', header: "Mad'u", width: 52, align: 'right', render: (r) => <CellText muted>{r.first ? String(r.madu) : ''}</CellText> },
                  { key: 'sesi', header: 'Sesi', width: 48, align: 'right', render: (r) => <CellText muted>{String(r.sesi)}</CellText> },
                ]}
              />
            </View>
          ))
        )}

        <View className="pb-8">
          <SectionTitle title="Muat Turun Laporan" caption="Ringkasan sesi dan kehadiran terperinci, boleh ditapis ikut bulan/tahun (.xlsx)." />
          <Card>
            <View className="gap-4">
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <PickerField label="Bulan" value={monthFilter} options={MONTH_FILTER_OPTIONS} onChange={(v) => setMonthFilter(v ?? ALL_MONTHS)} clearable={false} />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Tahun"
                    placeholder="Semua Tahun"
                    value={yearFilter}
                    onChangeText={(value) => setYearFilter(value.replace(/[^\d]/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <SaveShareButtons
                kind="file"
                variant="secondary"
                webLabel="Muat Turun Laporan (.xlsx)"
                nativeCaption="Laporan Usrah Sekolah (.xlsx)"
                busy={exporting}
                onPress={(mode) => void exportAll(mode)}
              />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
