import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CellText, DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { DetailPlaceholder, SplitPane } from '@/components/ui/split-pane';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { downloadYuranTransactions } from '@/lib/transactions-report';
import { downloadYuranReport } from '@/lib/yuran-report';
import { fetchYuranReport, generateYuranYear, ringgit, type YuranReportRow } from '@/lib/yuran';
import { generationLabel } from '@/types/database';

import { YuranDetailView } from './yuran-detail';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Baris yang dilukis sekaligus — 325 ahli tidak perlu wujud dalam pokok komponen serentak. */
const LIST_LIMIT = 60;

/** Tahun pertama yang boleh dijana; 2025 ialah baki permulaan, bukan caj tahunan. */
const FIRST_GENERATED_YEAR = 2026;

const STATUS_TONE = { Tertunggak: 'negative', Kredit: 'info', Lunas: 'positive' } as const;

/**
 * Senarai yuran semua ahli — modul BENDAHARI.
 *
 * Nombor yang dipapar ialah baki KESELURUHAN dan bukan baki tahun yang dipilih.
 * Tahun hanya menentukan kolum "caj tahun ini" dan fail eksport; soalan yang
 * dibawa bendahari ke skrin ini ialah "siapa berhutang", dan hutang tidak
 * berhenti di sempadan tahun.
 */
export default function YuranListScreen() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const goBack = useGoBack();
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();

  // Desktop: ahli yang dipilih dipaparkan di panel kanan. `?id=` (pautan terus) memilihnya terus.
  const [selectedId, setSelectedId] = useState<string | null>(paramId ?? null);
  useEffect(() => {
    if (paramId) setSelectedId(paramId);
  }, [paramId]);
  const { loading: accessLoading, canView, canEdit } = useYuranAccess();

  const [rows, setRows] = useState<YuranReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [exportingTrx, setExportingTrx] = useState<DeliveryMode | null>(null);

  const parsedYear = Number.parseInt(year, 10);
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;

  const load = useCallback(
    async (target: number, silent = false) => {
      // `silent`: muat semula di latar (selepas pelarasan di panel kanan) tanpa skrin memuat.
      if (!silent) setLoading(true);
      try {
        setRows(await fetchYuranReport(target));
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod yuran.') });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView || !yearValid) return;
      void load(parsedYear);
    }, [accessLoading, canView, load, parsedYear, yearValid]),
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
          tertunggak: sum.tertunggak + row.tertunggak,
          kredit: sum.kredit + row.kredit,
          berhutang: sum.berhutang + (row.tertunggak > 0 ? 1 : 0),
        }),
        { tertunggak: 0, kredit: 0, berhutang: 0 },
      ),
    [rows],
  );

  const generate = useCallback(async () => {
    if (busy || !yearValid) return;

    if (parsedYear < FIRST_GENERATED_YEAR) {
      setBanner({
        tone: 'negative',
        message: 'Tahun ' + parsedYear + ' ialah baki permulaan. Gunakan Import Baki Permulaan 2025.',
      });
      return;
    }

    setBanner(null);
    setBusy(true);
    try {
      const created = await generateYuranYear(parsedYear);
      setBanner({
        tone: created > 0 ? 'positive' : 'info',
        message:
          created > 0
            ? 'Yuran ' + parsedYear + ' dijana untuk ' + created + ' ahli.'
            : 'Yuran ' + parsedYear + ' sudah dijana untuk semua ahli — tiada baris baharu.',
      });
      await load(parsedYear);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana yuran.') });
    } finally {
      setBusy(false);
    }
  }, [busy, load, parsedYear, yearValid]);

  const exportReport = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting || !yearValid) return;

      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadYuranReport(parsedYear, mode);
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
    [exporting, parsedYear, yearValid],
  );

  /**
   * Transaksi mentah — SEMUA status, termasuk bayaran gateway yang gagal atau
   * tersangkut pada 'pending'.
   *
   * Laporan agregat di atas mengira bayaran berjaya sahaja, jadi bayaran yang
   * tersangkut tidak muncul di situ langsung. `null` dan bukan `parsedYear`:
   * bayaran tersangkut tidak semestinya berada dalam tahun yang sedang dilihat,
   * dan fail inilah tempat mencarinya.
   */
  const exportTransactions = useCallback(
    async (mode: DeliveryMode) => {
      if (exportingTrx) return;

      setBanner(null);
      setExportingTrx(mode);
      try {
        const report = await downloadYuranTransactions(null, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' transaksi'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana senarai transaksi.') });
      } finally {
        setExportingTrx(null);
      }
    },
    [exportingTrx],
  );

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Yuran" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Modul Yuran memerlukan kebenaran melihat pada department BENDAHARI."
          />
        </View>
      </Screen>
    );
  }

  const header = (
    <ScreenHeader
        eyebrow="Panel Admin"
        title="Yuran"
        subtitle="Baki keseluruhan setiap ahli"
        onBackPress={goBack}
    />
  );

  const body = (
      <View className={desktop ? 'gap-6 px-4 pb-8 pt-4' : 'gap-6 px-gutter pt-6'}>
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        <Card>
          <View className="flex-row justify-between">
            <Stat label="Jumlah tertunggak" value={ringgit(totals.tertunggak)} tone="negative" />
            <Stat label="Ahli berhutang" value={String(totals.berhutang)} />
            <Stat label="Jumlah kredit" value={ringgit(totals.kredit)} />
          </View>
        </Card>

        <View>
          <SectionTitle title="Tahun" caption="Menentukan kolum caj tahunan dan fail eksport." />
          <View className="gap-4">
            <TextField
              label="Tahun"
              value={year}
              onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
              editable={!busy && exporting === null}
              keyboardType="number-pad"
              error={year.length > 0 && !yearValid ? 'Tahun antara 2000 dan 2100.' : null}
            />

            {canEdit ? (
              <Button
                label={'Jana Yuran ' + (yearValid ? parsedYear : '')}
                loading={busy}
                disabled={busy || !yearValid}
                onPress={() => void generate()}
              />
            ) : null}

            {/*
              Eksport ialah bacaan, jadi `can_view` sudah memadai — bendahari
              yang hanya menyemak tidak perlu kebenaran menulis untuk
              mengeluarkan laporan.
            */}
            <SaveShareButtons
              kind="file"
              variant="secondary"
              webLabel="Muat Turun Excel"
              nativeCaption={'Laporan Yuran ' + (yearValid ? parsedYear : '') + ' (.xlsx)'}
              busy={exporting}
              disabled={!yearValid}
              onPress={(mode) => void exportReport(mode)}
            />

            <SaveShareButtons
              kind="file"
              variant="ghost"
              webLabel="Eksport Transaksi (Semua Status)"
              nativeCaption="Transaksi Yuran — semua status (.xlsx)"
              busy={exportingTrx}
              onPress={(mode) => void exportTransactions(mode)}
            />
          </View>
        </View>

        {canEdit ? (
          <Button
            label="Import Baki Permulaan 2025"
            variant="ghost"
            onPress={() => router.push('/(app)/admin/yuran-upload')}
          />
        ) : null}

        <View className="pb-8">
          <SectionTitle title={'Senarai Ahli (' + filtered.length + ')'} />

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
              icon="wallet-outline"
              title="Tiada rekod"
              description="Jana yuran tahunan atau import baki permulaan 2025 untuk bermula."
            />
          ) : desktop ? (
            <DataTable
              fill
              rows={filtered}
              keyOf={(r) => r.member_id}
              selectedKey={selectedId}
              onRowPress={(r) => setSelectedId(r.member_id)}
              columns={[
                { key: 'no', header: 'No.', width: 84, render: (r) => <CellText strong tone="primary">{r.nombor_ahli ?? '—'}</CellText> },
                { key: 'nama', header: 'Nama', flex: 1, render: (r) => <CellText strong>{r.full_name}</CellText> },
                {
                  key: 'tunggak',
                  header: 'Tertunggak',
                  width: 104,
                  align: 'right',
                  render: (r) => <CellText strong tone={r.tertunggak > 0 ? 'negative' : undefined} muted={r.tertunggak <= 0}>{ringgit(r.tertunggak > 0 ? r.tertunggak : 0)}</CellText>,
                },
              ]}
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
                      pathname: '/(app)/admin/yuran-detail',
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
                      className={`text-sm font-bold ${row.tertunggak > 0 ? 'text-negative' : 'text-ink-muted'}`}>
                      {row.tertunggak > 0 ? ringgit(row.tertunggak) : ringgit(0)}
                    </Text>
                    <Badge
                      label={row.status}
                      tone={STATUS_TONE[row.status as keyof typeof STATUS_TONE] ?? 'neutral'}
                    />
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
  );

  if (desktop) {
    const selected = selectedId ? rows.find((r) => r.member_id === selectedId) : undefined;
    return (
      <SplitPane
        header={header}
        left={body}
        right={
          selectedId ? (
            <YuranDetailView
              key={selectedId}
              id={selectedId}
              nama={selected?.full_name}
              nombor={selected?.nombor_ahli ?? undefined}
              onChanged={() => void load(parsedYear, true)}
            />
          ) : (
            <DetailPlaceholder icon="wallet-outline" text="Pilih ahli dari senarai untuk lihat butiran" />
          )
        }
      />
    );
  }

  return (
    <Screen padTop={false} wide>
      {header}
      {body}
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'negative' }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className={`mt-1 text-base font-bold ${tone === 'negative' ? 'text-negative' : 'text-ink'}`}>
        {value}
      </Text>
    </View>
  );
}
