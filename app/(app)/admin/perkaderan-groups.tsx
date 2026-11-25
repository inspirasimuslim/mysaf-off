import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
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
import { fetchAnalisaUsrah, type AnalisaKumpulan } from '@/lib/perkaderan-program';
import { generationLabel } from '@/types/database';
import { fetchNaqibOverview, fetchSekolahList, fetchSlots, type PerkaderanSlot } from '@/lib/perkaderan';
import { downloadPerkaderanReport } from '@/lib/perkaderan-report';
import { MONTH_OPTIONS, type NaqibOverview } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const ALL_MONTHS = '0';
const MONTH_FILTER_OPTIONS = [{ value: ALL_MONTHS, label: 'Semua Bulan' }, ...MONTH_OPTIONS];

type TRow = {
  key: string;
  sekolah: string;
  tingkatan: string;
  no: number;
  madu: number;
  naqibId: string;
  nama: string;
  gen: string;
  sesiNaqib: number;
  first: boolean;
  sesi: number | null;
  liputan: string;
  hadir: string;
  fikrah: number | null;
  terakhir: string;
};
type TRowX = TRow & { firstSekolah: boolean };

// Lajur ringkasan: butiran kumpulan hanya pada baris pertama kumpulan; sekolah hanya pada baris pertama sekolah.
const COLS: { key: string; label: string; w: number; strong?: boolean; cell: (r: TRowX) => string }[] = [
  { key: 'sek', label: 'Sekolah', w: 150, strong: true, cell: (r) => (r.firstSekolah ? r.sekolah : '') },
  { key: 'ting', label: 'Ting.', w: 40, cell: (r) => (r.first ? 'T' + r.tingkatan : '') },
  { key: 'kump', label: 'Kump.', w: 46, cell: (r) => (r.first ? 'K' + r.no : '') },
  { key: 'nama', label: 'Naqib', w: 190, strong: true, cell: (r) => r.nama },
  { key: 'gen', label: 'Gen.', w: 46, cell: (r) => r.gen },
  { key: 'sesiN', label: 'Sesi Naqib', w: 74, cell: (r) => String(r.sesiNaqib) },
  { key: 'madu', label: "Mad'u", w: 50, cell: (r) => (r.first ? String(r.madu) : '') },
  { key: 'sesi', label: 'Sesi Kump.', w: 74, cell: (r) => (r.first && r.sesi !== null ? String(r.sesi) : '') },
  { key: 'lip', label: 'Liputan Bulan', w: 90, cell: (r) => (r.first ? r.liputan : '') },
  { key: 'hdr', label: 'Kehadiran', w: 70, cell: (r) => (r.first ? r.hadir : '') },
  { key: 'fik', label: 'Fikrah', w: 52, cell: (r) => (r.first && r.fikrah !== null ? String(r.fikrah) : '') },
  { key: 'ter', label: 'Sesi Terakhir', w: 92, cell: (r) => (r.first ? r.terakhir : '') },
];
const TABLE_W = COLS.reduce((n, c) => n + c.w, 0) + 16;

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
  const [stats, setStats] = useState<Map<string, AnalisaKumpulan>>(new Map());
  const { height } = useWindowDimensions();
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
      try {
        const a = await fetchAnalisaUsrah(new Date().getFullYear() + '-01-01', null);
        setStats(new Map(a.kumpulan.map((k) => [k.group_id, k])));
      } catch {
        setStats(new Map()); // jadual tetap dipaparkan tanpa lajur statistik
      }
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
      const rows: TRow[] = [];
      for (const g of sorted) {
        const st = stats.get(g.group_id);
        const people: { id: string; nama: string }[] = [{ id: g.naqib_id, nama: g.naqib_nama }];
        if (g.partner_id) people.push({ id: g.partner_id, nama: g.partner_nama ?? byId.get(g.partner_id)?.full_name ?? '—' });
        for (const id of g.tambahan_ids ?? []) people.push({ id, nama: byId.get(id)?.full_name ?? '—' });
        people.forEach((pp, i) =>
          rows.push({
            key: g.group_id + pp.id,
            sekolah: sekolah,
            tingkatan: g.tingkatan.replace('Tingkatan ', ''),
            no: g.no_kumpulan,
            madu: g.madu,
            naqibId: pp.id,
            nama: pp.nama,
            gen: byId.get(pp.id)?.generasi ? generationLabel(byId.get(pp.id)!.generasi!) : '—',
            sesiNaqib: byId.get(pp.id)?.session_count ?? 0,
            first: i === 0,
            sesi: st ? st.sesi : null,
            liputan: st && st.bulan_sepatutnya ? st.bulan_ada + '/' + st.bulan_sepatutnya : '—',
            hadir: st && st.peluang ? Math.round((st.hadir / st.peluang) * 100) + '%' : '—',
            fikrah: st ? st.unit_silibus : null,
            terakhir: st?.sesi_terakhir ?? '—',
          }),
        );
      }
      return { sekolah, groups: sorted.length, rows };
    });
  }, [naqibs, slots, stats]);

  const allRows = useMemo(() => sekolahTables.flatMap((t) => t.rows.map((r, i) => ({ ...r, firstSekolah: i === 0 }))), [sekolahTables]);

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

        {allRows.length === 0 ? (
          <EmptyState icon="school-outline" title="Belum ada kumpulan" description="Kumpulan usrah yang dilantik akan muncul di sini." />
        ) : (
          <View>
            <SectionTitle title="Ringkasan Naqib" caption={'Tahun ' + new Date().getFullYear() + ' · skrol ke bawah/kanan · ketuk baris untuk sejarah sesi'} />
            <View className="overflow-hidden rounded-card border border-line bg-surface">
              <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                <View style={{ width: TABLE_W }}>
                  <View className="flex-row border-b border-line bg-primary-tint px-2 py-1.5">
                    {COLS.map((c) => (
                      <Text key={c.key} style={{ width: c.w }} className="text-[11px] font-semibold text-ink-muted">
                        {c.label}
                      </Text>
                    ))}
                  </View>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: Math.max(320, height - 330) }}>
                    {allRows.map((r) => (
                      <Pressable
                        key={r.key}
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: '/(app)/admin/naqib-session-history',
                            params: { memberId: r.naqibId, naqibName: r.nama },
                          })
                        }
                        className={'flex-row items-center px-2 py-1 active:opacity-70 ' + (r.firstSekolah ? 'border-t-2 border-line' : r.first ? 'border-t border-line' : '')}>
                        {COLS.map((c) => (
                          <Text key={c.key} style={{ width: c.w }} numberOfLines={1} className={'text-xs ' + (c.strong ? 'font-semibold text-ink' : 'text-ink-muted')}>
                            {c.cell(r)}
                          </Text>
                        ))}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          </View>
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
