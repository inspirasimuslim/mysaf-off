import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { usePipisAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { fetchPipisReport, peratusLabel, ringgitPipis, type PipisReportRow } from '@/lib/pipis';
import { downloadPipisReport } from '@/lib/pipis-report';
import { generationLabel } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Baris yang dilukis sekaligus — 325 ahli tidak perlu wujud dalam pokok komponen serentak. */
const LIST_LIMIT = 60;

const STATUS_TONE = {
  'Belum Cukup': 'warn',
  'Cukup RM5000': 'positive',
  'Lebih RM5000': 'primary',
} as const;

/**
 * Senarai sumbangan PIPIS ASET semua ahli — modul LAJNAH EKONOMI DAN ASET.
 *
 * Tiada pemilih tahun, tidak seperti skrin Yuran: PIPIS ialah sumbangan sekali
 * seumur hidup, jadi satu-satunya nombor yang bermakna ialah jumlah
 * keseluruhan seorang ahli.
 */
export default function PipisListScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = usePipisAccess();

  const [rows, setRows] = useState<PipisReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPipisReport());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod sumbangan.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.full_name.toLowerCase().includes(needle) ||
        (row.nombor_ahli ?? '').toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          jumlah: sum.jumlah + row.jumlah,
          penyumbang: sum.penyumbang + (row.jumlah > 0 ? 1 : 0),
          cukup: sum.cukup + (row.status === 'Belum Cukup' ? 0 : 1),
        }),
        { jumlah: 0, penyumbang: 0, cukup: 0 },
      ),
    [rows],
  );

  const exportReport = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;

      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadPipisReport(mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' ahli'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana laporan.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="PIPIS ASET" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul PIPIS ASET memerlukan kebenaran melihat pada department LAJNAH EKONOMI DAN ASET."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="PIPIS ASET"
        subtitle="Sumbangan sekali seumur hidup RM5,000"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <Card>
          <View className="flex-row justify-between">
            <Stat label="Jumlah terkumpul" value={ringgitPipis(totals.jumlah)} />
            <Stat label="Penyumbang" value={String(totals.penyumbang)} />
            <Stat label="Capai RM5,000" value={String(totals.cukup)} />
          </View>
        </Card>

        <View className="gap-4">
          {/*
            Eksport ialah bacaan, jadi `can_view` sudah memadai — admin yang
            hanya menyemak tidak perlu kebenaran menulis untuk mengeluarkan
            laporan.
          */}
          <SaveShareButtons
            kind="file"
            variant="secondary"
            webLabel="Muat Turun Excel"
            nativeCaption="Laporan PIPIS ASET (.xlsx)"
            busy={exporting}
            onPress={(mode) => void exportReport(mode)}
          />

          {canEdit ? (
            <Button
              label="Import Sumbangan dari Excel"
              variant="ghost"
              onPress={() => router.push('/(app)/admin/pipis-upload')}
            />
          ) : null}
        </View>

        <View className="pb-8">
          <SectionTitle title={'Senarai Ahli (' + filtered.length + ')'} caption="Penyumbang terbesar dahulu." />

          <View className="pb-3">
            <TextField
              label="Cari"
              placeholder="Nama atau nombor ahli"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {filtered.length === 0 ? (
            <EmptyState
              icon="business-outline"
              title="Tiada rekod"
              description="Import fail sumbangan untuk bermula."
            />
          ) : (
            <View className="gap-2">
              {filtered.slice(0, LIST_LIMIT).map((row) => (
                <Pressable
                  key={row.member_id}
                  accessibilityRole="button"
                  accessibilityLabel={row.full_name}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/admin/pipis-detail',
                      params: { id: row.member_id, nama: row.full_name, nombor: row.nombor_ahli ?? '' },
                    })
                  }
                  className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-4 active:opacity-70">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                      {row.full_name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-muted">
                      {(row.nombor_ahli ?? 'Tiada nombor') + ' · ' + generationLabel(row.generasi)}
                    </Text>
                  </View>

                  <View className="items-end gap-1">
                    <Text
                      className={`text-sm font-bold ${row.jumlah > 0 ? 'text-ink' : 'text-ink-faint'}`}>
                      {peratusLabel(row.peratus)}
                    </Text>
                    <Badge label={row.status} tone={STATUS_TONE[row.status] ?? 'neutral'} />
                  </View>
                </Pressable>
              ))}

              {filtered.length > LIST_LIMIT ? (
                <Text className="pt-2 text-center text-xs text-ink-muted">
                  {'Memaparkan ' + LIST_LIMIT + ' daripada ' + filtered.length + ' — tapis dengan carian.'}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className="mt-1 text-base font-bold text-ink">{value}</Text>
    </View>
  );
}
