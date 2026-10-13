import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
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
import { ToastBanner } from '@/components/ui/toast';
import { useZakatAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { useGoBack } from '@/lib/navigation';
import { paymentStatusTone, type GatewayStatus } from '@/lib/toyyibpay';
import {
  downloadZakatInfaqExport,
  fetchZakatInfaqAdminRows,
  fetchZakatInfaqAdminSummary,
  infaqStatusLabel,
  ringgitInfaq,
  type ZakatInfaqAdminRow,
  type ZakatInfaqAdminSummary,
} from '@/lib/zakat-infaq';

const PAGE = 100;
type Filter = 'semua' | GatewayStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'success', label: 'Berjaya' },
  { key: 'pending', label: 'Diproses' },
  { key: 'failed', label: 'Gagal' },
];

/**
 * Infaq Tabung Zakat — admin TABUNG ZAKAT (can_view) dan Super Admin: semua rekod infaq ahli,
 * ringkasan dan muat turun Excel. Kebenaran disemak semula oleh RPC di pelayan.
 */
export default function AdminInfaqZakatScreen() {
  const goBack = useGoBack();
  const access = useZakatAccess();

  const [rows, setRows] = useState<ZakatInfaqAdminRow[] | null>(null);
  const [summary, setSummary] = useState<ZakatInfaqAdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('semua');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [exporting, setExporting] = useState<DeliveryMode | null>(null);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (access.loading || !access.canView) return;
      let active = true;
      Promise.all([fetchZakatInfaqAdminRows(), fetchZakatInfaqAdminSummary()])
        .then(([list, totals]) => {
          if (!active) return;
          setRows(list);
          setSummary(totals);
          setError(null);
        })
        .catch((caught) => {
          if (!active) return;
          setRows((prev) => prev ?? []);
          setError(toMalayError(caught, 'Gagal memuatkan rekod infaq.'));
        });
      return () => {
        active = false;
      };
    }, [access.loading, access.canView]),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (filter === 'semua' || row.status === filter) &&
        (!needle || row.full_name.toLowerCase().includes(needle) || (row.nombor_ahli ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);

  const exportAll = useCallback(
    async (mode: DeliveryMode) => {
      if (exporting) return;
      setBanner(null);
      setExporting(mode);
      try {
        const report = await downloadZakatInfaqExport(mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' rekod'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengeksport rekod infaq.') });
      } finally {
        setExporting(null);
      }
    },
    [exporting],
  );

  if (access.loading || (access.canView && rows === null)) return <LoadingScreen />;

  if (!access.canView) {
    return (
      <NoAccessScreen
        title="Infaq Tabung Zakat"
        description="Rekod infaq khusus untuk admin Tabung Zakat dan Super Admin."
      />
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Lajnah Kebajikan — Tabung Zakat"
        title="Infaq Tabung Zakat"
        subtitle="Semua rekod bayaran infaq ahli"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}

        {summary ? (
          <Card tone="surface">
            <Text className="text-sm text-ink-muted">Jumlah infaq diterima</Text>
            <Text className="mt-1 text-stat-lg font-bold text-ink">{ringgitInfaq(summary.jumlah)}</Text>
            <Text className="mt-2 text-sm text-ink-muted">
              {summary.bilangan +
                ' bayaran berjaya · ' +
                summary.penderma +
                ' penderma' +
                (summary.belum_selesai > 0 ? ' · ' + summary.belum_selesai + ' sedang diproses' : '')}
            </Text>
          </Card>
        ) : null}

        <SaveShareButtons
          kind="file"
          variant="secondary"
          webLabel="Muat Turun Excel"
          nativeCaption="Infaq Tabung Zakat (.xlsx)"
          busy={exporting}
          onPress={(mode) => void exportAll(mode)}
        />

        <SectionTitle title="Rekod Bayaran" />
        <TextField
          label="Cari ahli"
          placeholder="Nama atau nombor ahli"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setShown(PAGE);
          }}
        />
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.key }}
              onPress={() => {
                setFilter(item.key);
                setShown(PAGE);
              }}
              className={`rounded-pill border px-3 py-1.5 ${
                filter === item.key ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
              }`}>
              <Text className={`text-sm font-semibold ${filter === item.key ? 'text-primary' : 'text-ink-muted'}`}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="Tiada rekod"
            description="Tiada rekod infaq sepadan dengan carian atau tapisan ini."
          />
        ) : (
          <View className="gap-2">
            {filtered.slice(0, shown).map((row) => (
              <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <Text numberOfLines={1} className="flex-1 text-base font-bold text-ink">
                    {row.full_name}
                    {row.generasi ? '  ·  ' + row.generasi : ''}
                  </Text>
                  <Badge label={infaqStatusLabel(row.status)} tone={paymentStatusTone(row.status)} />
                </View>
                <Text className="mt-1 text-lg font-bold text-ink">
                  {ringgitInfaq(row.status === 'success' ? row.amount : (row.requested_amount ?? 0))}
                </Text>
                <Text className="mt-1 text-xs text-ink-muted">
                  {(row.nombor_ahli ? row.nombor_ahli + ' · ' : '') + new Date(row.created_at).toLocaleString('ms-MY')}
                  {row.note ? ' · ' + row.note : ''}
                </Text>
              </View>
            ))}
            {filtered.length > shown ? (
              <Button
                label={'Papar lagi (' + (filtered.length - shown) + ')'}
                variant="secondary"
                onPress={() => setShown((current) => current + PAGE)}
              />
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
