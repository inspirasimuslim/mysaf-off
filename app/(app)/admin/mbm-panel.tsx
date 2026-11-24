import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { usePermissions } from '@/lib/permissions';
import { toMalayError } from '@/lib/errors';
import { fetchMbmPanelInbox, mbmStatusLabel, setMbmPanelStatus, type MbmPanelRow, type MbmStatus } from '@/lib/mbm-borang';
import { useGoBack } from '@/lib/navigation';

const PAGE = 100;
type Filter = 'semua' | MbmStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'baharu', label: 'Baharu' },
  { key: 'selesai', label: 'Selesai' },
];

/**
 * Permohonan Majlis Baitul Muslim — admin MAJLIS BAITUL MUSLIM (can_view; tanda selesai = can_edit)
 * dan Super Admin. Kebenaran disemak semula oleh RPC di pelayan.
 */
export default function MbmPanelInboxScreen() {
  const goBack = useGoBack();
  const { loading: permLoading, isMbmPanel } = usePermissions();
  const allowed = isMbmPanel();

  const [rows, setRows] = useState<MbmPanelRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('semua');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [updating, setUpdating] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'info' | 'negative'; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchMbmPanelInbox());
      setError(null);
    } catch (caught) {
      setRows((prev) => prev ?? []);
      setError(toMalayError(caught, 'Gagal memuatkan permohonan MBM.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (permLoading || !allowed) return;
      void load();
    }, [permLoading, allowed, load]),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (filter === 'semua' || row.status === filter) &&
        (!needle ||
          row.nama.toLowerCase().includes(needle) || (row.nombor_ahli ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);

  const baharu = (rows ?? []).filter((row) => row.status === 'baharu').length;

  const changeStatus = useCallback(
    async (row: MbmPanelRow, status: MbmStatus) => {
      if (updating) return;
      setUpdating(row.id);
      setBanner(null);
      try {
        await setMbmPanelStatus(row.id, status);
        await load();
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini status.') });
      } finally {
        setUpdating(null);
      }
    },
    [load, updating],
  );

  if (permLoading || (allowed && rows === null)) return <LoadingScreen />;

  if (!allowed) {
    return (
      <NoAccessScreen
        title="Permohonan MBM"
        description="Halaman ini khusus untuk panel MBM yang dilantik."
      />
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Majlis Baitul Muslim - Panel"
        title="Permohonan untuk anda"
        subtitle={(rows?.length ?? 0) + ' permohonan · ' + baharu + ' baharu'}
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}

        <TextField
          label="Cari"
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
            icon="heart-outline"
            title="Tiada permohonan"
            description="Tiada permohonan sepadan dengan carian atau tapisan ini."
          />
        ) : (
          <View className="gap-2">
            {filtered.slice(0, shown).map((row) => (
              <View key={row.id} className="rounded-field border border-line bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <Text numberOfLines={2} className="flex-1 text-base font-bold text-ink">
                    {row.nama}
                    {row.generasi ? '  ·  ' + row.generasi : ''}
                  </Text>
                  <Badge label={mbmStatusLabel(row.status)} tone={row.status === 'baharu' ? 'warn' : 'positive'} />
                </View>
                <Text selectable className="mt-1 text-sm text-ink">
                  {row.no_telefon}
                </Text>
                <Text className="mt-1 text-xs text-ink-muted">
                  {(row.nombor_ahli ? row.nombor_ahli + ' · ' : '') + new Date(row.created_at).toLocaleString('ms-MY')}
                </Text>
                {allowed ? (
                  <View className="mt-3">
                    <Button
                      label={row.status === 'baharu' ? 'Tandakan Selesai' : 'Buka Semula'}
                      variant="secondary"
                      size="sm"
                      loading={updating === row.id}
                      disabled={updating !== null}
                      onPress={() => void changeStatus(row, row.status === 'baharu' ? 'selesai' : 'baharu')}
                    />
                  </View>
                ) : null}
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
