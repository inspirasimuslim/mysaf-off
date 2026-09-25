import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import { Colors } from '@/constants/theme';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { fetchNaqibOverview } from '@/lib/perkaderan';
import { downloadPerkaderanReport } from '@/lib/perkaderan-report';
import { generationLabel, MONTH_OPTIONS, type NaqibOverview } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const ALL_MONTHS = '0';
const MONTH_FILTER_OPTIONS = [{ value: ALL_MONTHS, label: 'Semua Bulan' }, ...MONTH_OPTIONS];

/**
 * PERINGKAT 1 navigasi admin: senarai NAQIB (bukan senarai kumpulan terus) —
 * naqib boleh pegang >1 kumpulan/sekolah, jadi menyenaraikan mengikut
 * kumpulan akan mengulang nama naqib yang sama berkali-kali. Tap satu naqib
 * -> PERINGKAT 2 (`naqib-session-history.tsx`) -> PERINGKAT 3 (butiran sesi,
 * reuse `usrah-session-form.tsx` sedia ada, kebenaran edit tidak berubah).
 */
export default function PerkaderanGroupsScreen() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const goBack = useGoBack();
  const { loading: accessLoading, canView } = usePerkaderanAccess();

  const [naqibs, setNaqibs] = useState<NaqibOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [yearFilter, setYearFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setNaqibs(await fetchNaqibOverview());
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
        subtitle={naqibs.length + ' naqib aktif'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        <View>
          <SectionTitle title="Senarai Naqib" caption="Ketuk seorang naqib untuk lihat sejarah sesinya." />

          {naqibs.length === 0 ? (
            <EmptyState
              icon="school-outline"
              title="Belum ada naqib"
              description="Naqib yang dilantik akan muncul di sini."
            />
          ) : desktop ? (
            <DataTable
              rows={naqibs}
              keyOf={(n) => n.member_id}
              onRowPress={(n) =>
                router.push({
                  pathname: '/(app)/admin/naqib-session-history',
                  params: { memberId: n.member_id, naqibName: n.full_name },
                })
              }
              columns={[
                { key: 'nama', header: 'Nama', flex: 2, render: (n) => <CellText strong>{n.full_name}</CellText> },
                { key: 'gen', header: 'Generasi', flex: 1, render: (n) => <CellText muted>{n.generasi ? generationLabel(n.generasi) : '—'}</CellText> },
                { key: 'sekolah', header: 'Sekolah', flex: 2, render: (n) => <CellText muted>{n.sekolah_list}</CellText> },
                { key: 'kumpulan', header: 'Kumpulan', width: 100, align: 'right', render: (n) => <CellText>{String(n.group_count)}</CellText> },
                { key: 'sesi', header: 'Jumlah Sesi', width: 110, align: 'right', render: (n) => <CellText>{String(n.session_count)}</CellText> },
              ]}
            />
          ) : (
            <View className="gap-2">
              {naqibs.map((naqib) => (
                <Pressable
                  key={naqib.member_id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/admin/naqib-session-history',
                      params: { memberId: naqib.member_id, naqibName: naqib.full_name },
                    })
                  }
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card active:opacity-70">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{naqib.full_name}</Text>
                    <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
                      {naqib.sekolah_list}
                      {naqib.generasi ? ' · ' + generationLabel(naqib.generasi) : ''}
                    </Text>
                    <Text className="mt-1 text-xs text-ink-faint">
                      {naqib.group_count + ' kumpulan · ' + naqib.session_count + ' sesi jumlah'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

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
