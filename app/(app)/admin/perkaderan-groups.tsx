import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
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
import { BULAN_PENDEK, downloadPantauanBulanan, fetchPantauanBulanan, type PantauanBaris, type SelBulan } from '@/lib/perkaderan-pantauan';
import { downloadPerkaderanReport } from '@/lib/perkaderan-report';
import { generationLabel, MONTH_OPTIONS, type NaqibOverview } from '@/types/database';

type Banner = {
  tone: 'positive' | 'info' | 'negative';
  message: string;
} | null;

const ALL_MONTHS = '0';
const MONTH_FILTER_OPTIONS = [{ value: ALL_MONTHS, label: 'Semua Bulan' }, ...MONTH_OPTIONS];

type GroupRow = {
  groupId: string;
  sekolah: string;
  tingkatan: string;
  no: number;
  people: { id: string; nama: string; gen: string }[];
  bulan: (SelBulan[] | null)[];
};

const W_GRUP = 64;
const W_BLN = 66;
const TABLE_W = W_GRUP + W_BLN * 12 + 16;

/**
 * Pantauan Usrah Sekolah: jadual BULANAN (Jan–Dis) setiap kumpulan — "Tiada" jika tidak berusrah bulan itu,
 * jika ada: kod Fikrah yang dibuat (F1, F2 ...). Ketuk nombor kumpulan -> nama naqib + generasi (ketuk nama -> sejarah sesi).
 */
export default function PerkaderanGroupsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { height } = useWindowDimensions();
  const { loading: accessLoading, canView } = usePerkaderanAccess();

  const tahun = new Date().getFullYear();
  const bulanSemasa = new Date().getMonth();

  const [naqibs, setNaqibs] = useState<NaqibOverview[]>([]);
  const [slots, setSlots] = useState<{ sekolah: string; slots: PerkaderanSlot[] }[]>([]);
  const [bulanan, setBulanan] = useState<Map<string, (SelBulan[] | null)[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [exportingBulanan, setExportingBulanan] = useState<DeliveryMode | null>(null);
  const [detail, setDetail] = useState<GroupRow | null>(null);

  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [yearFilter, setYearFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [overview, sekolahList, sesi] = await Promise.all([fetchNaqibOverview(), fetchSekolahList(), fetchPantauanBulanan(tahun)]);
      setNaqibs(overview);
      setBulanan(sesi);
      const perSekolah = await Promise.all(
        sekolahList.map(async (x) => ({
          sekolah: x.nama,
          slots: await fetchSlots(x.nama),
        })),
      );
      setSlots(perSekolah.filter((x) => x.slots.length > 0));
    } catch (caught) {
      setBanner({
        tone: 'negative',
        message: toMalayErrorVerbose(caught, 'Gagal memuatkan pantauan usrah.'),
      });
    } finally {
      setLoading(false);
    }
  }, [tahun]);

  // `useFocusEffect` — segar semula selepas kembali dari skrin lain (skrin tab tersembunyi kekal terpasang).
  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  // Sekolah > tingkatan > kumpulan; naqib + generasi hanya dalam helaian butiran.
  const groups = useMemo<GroupRow[]>(() => {
    const byId = new Map(naqibs.map((n) => [n.member_id, n]));
    const person = (id: string, nama: string | null) => {
      const n = byId.get(id);
      return {
        id,
        nama: nama ?? n?.full_name ?? '—',
        gen: n?.generasi ? generationLabel(n.generasi) : '—',
      };
    };
    return slots.flatMap(({ sekolah, slots: list }) =>
      [...list]
        .sort((a, b) => a.tingkatan.localeCompare(b.tingkatan) || a.no_kumpulan - b.no_kumpulan)
        .map((g) => ({
          groupId: g.group_id,
          sekolah,
          tingkatan: g.tingkatan.replace('Tingkatan ', ''),
          no: g.no_kumpulan,
          people: [
            person(g.naqib_id, g.naqib_nama),
            ...(g.partner_id ? [person(g.partner_id, g.partner_nama)] : []),
            ...(g.tambahan_ids ?? []).map((id) => person(id, null)),
          ],
          bulan: bulanan.get(g.group_id) ?? Array.from({ length: 12 }, () => null),
        })),
    );
  }, [naqibs, slots, bulanan]);

  const exportBulanan = useCallback(
    async (mode: DeliveryMode) => {
      if (exportingBulanan) return;
      setBanner(null);
      setExportingBulanan(mode);
      try {
        const baris: PantauanBaris[] = groups.map((g) => ({
          sekolah: g.sekolah,
          tingkatan: g.tingkatan,
          no: g.no,
          naqib: g.people.map((p) => ({ nama: p.nama, gen: p.gen })),
          bulan: g.bulan,
        }));
        const report = await downloadPantauanBulanan(baris, tahun, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' kumpulan'),
        });
      } catch (caught) {
        setBanner({
          tone: 'negative',
          message: toMalayErrorVerbose(caught, 'Gagal menjana fail.'),
        });
      } finally {
        setExportingBulanan(null);
      }
    },
    [exportingBulanan, groups, tahun],
  );

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
        setBanner({
          tone: 'negative',
          message: toMalayErrorVerbose(caught, 'Gagal menjana laporan.'),
        });
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
    <>
      <Screen padTop={false} wide>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Pantauan Usrah Sekolah"
          subtitle={naqibs.length + ' naqib aktif · ' + slots.reduce((n, x) => n + x.slots.length, 0) + ' kumpulan'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {groups.length === 0 ? (
            <EmptyState icon="school-outline" title="Belum ada kumpulan" description="Kumpulan usrah yang dilantik akan muncul di sini." />
          ) : (
            <View>
              <SectionTitle
                title={'Usrah Setiap Bulan ' + tahun}
                caption="Fikrah yang dibuat, atau Tiada. Ketuk nombor kumpulan untuk lihat naqib."
              />
              <View className="overflow-hidden rounded-card border border-line bg-surface">
                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                  <View style={{ width: TABLE_W }}>
                    <View className="flex-row border-b border-line bg-primary-tint px-2 py-1.5">
                      <Text style={{ width: W_GRUP }} className="text-[11px] font-semibold text-ink-muted">
                        Kump.
                      </Text>
                      {BULAN_PENDEK.map((b) => (
                        <Text key={b} style={{ width: W_BLN }} className="text-[11px] font-semibold text-ink-muted">
                          {b}
                        </Text>
                      ))}
                    </View>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: Math.max(320, height - 330) }}>
                      {groups.map((g, i) => (
                        <View key={g.groupId}>
                          {i === 0 || groups[i - 1]!.sekolah !== g.sekolah ? (
                            <Text className="bg-surface-muted px-2 py-1 text-xs font-bold text-ink">{g.sekolah}</Text>
                          ) : null}
                          <View className="flex-row items-center border-t border-line px-2 py-1">
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setDetail(g)}
                              style={{ width: W_GRUP }}
                              className="active:opacity-60"
                            >
                              <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                                {'T' + g.tingkatan + ' K' + g.no}
                              </Text>
                            </Pressable>
                            {BULAN_PENDEK.map((b, m) => {
                              const sel = g.bulan[m];
                              const akan = m > bulanSemasa;
                              return (
                                <Text
                                  key={b}
                                  style={{ width: W_BLN }}
                                  numberOfLines={2}
                                  className={'text-[11px] ' + (sel && sel.length > 0 ? 'font-semibold text-ink' : 'text-ink-faint')}
                                >
                                  {sel && sel.length > 0 ? sel.map((x) => x.kod).join(', ') : akan ? '' : 'Tiada'}
                                </Text>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          <View>
            <SectionTitle
              title="Muat Turun Ringkasan Bulanan"
              caption={'Format sama dengan dokumen Laporan Usrah 2026 (General): jadual setiap tingkatan, bulan di baris, kumpulan di lajur (FF1, NB1, X = tiada usrah).'}
            />
            <Card>
              <SaveShareButtons
                kind="file"
                variant="secondary"
                webLabel="Muat Turun Ringkasan (.xlsx)"
                nativeCaption={'Pantauan Usrah ' + tahun + ' (.xlsx)'}
                busy={exportingBulanan}
                onPress={(mode) => void exportBulanan(mode)}
              />
            </Card>
          </View>

          <View className="pb-8">
            <SectionTitle
              title="Muat Turun Laporan"
              caption="Ringkasan sesi dan kehadiran terperinci, boleh ditapis ikut bulan/tahun (.xlsx)."
            />
            <Card>
              <View className="gap-4">
                <View className="flex-row items-start gap-3">
                  <View className="flex-1">
                    <PickerField
                      label="Bulan"
                      value={monthFilter}
                      options={MONTH_FILTER_OPTIONS}
                      onChange={(v) => setMonthFilter(v ?? ALL_MONTHS)}
                      clearable={false}
                    />
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

      <FormModal
        visible={detail !== null}
        title={detail ? 'T' + detail.tingkatan + ' K' + detail.no + ' · ' + detail.sekolah : ''}
        dismissable
        onClose={() => setDetail(null)}
      >
        <View className="gap-2">
          {(detail?.people ?? []).map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => {
                setDetail(null);
                router.push({
                  pathname: '/(app)/admin/naqib-session-history',
                  params: { memberId: p.id, naqibName: p.nama },
                });
              }}
              className="flex-row items-center justify-between rounded-card border border-line bg-surface px-3 py-2 active:opacity-70"
            >
              <Text className="flex-1 text-sm font-semibold text-ink">{p.nama}</Text>
              <Text className="text-sm text-ink-muted">{p.gen}</Text>
            </Pressable>
          ))}
          <Text className="text-xs text-ink-faint">Ketuk nama untuk lihat sejarah sesi naqib.</Text>
        </View>
      </FormModal>
    </>
  );
}
