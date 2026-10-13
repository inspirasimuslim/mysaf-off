import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import {
  KATEGORI_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  bantuanError,
  fetchBantuanAdminList,
  fetchBantuanSummary,
  formatRM,
  formatTarikh,
  type BantuanAdminRow,
  type BantuanKategori,
  type BantuanStatus,
} from '@/lib/bantuan';
import { useZakatAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';

const STATUS_FILTERS: BantuanStatus[] = ['submitted', 'under_review', 'needs_information', 'approved', 'rejected'];

/**
 * Panel semakan Permohonan Bantuan — admin TABUNG ZAKAT (migration 148).
 *
 * Akses dikuatkuasakan RPC `bantuan_admin_list` (dan RLS), bukan oleh skrin ini.
 * Draf tidak kelihatan; permohonan admin sendiri dikecualikan oleh pelayan.
 * Susunan: yang masih menunggu keputusan dahulu, paling lama menunggu di atas.
 */
export default function AdminBantuanScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const access = useZakatAccess();

  const [cari, setCari] = useState('');
  const [kategori, setKategori] = useState<BantuanKategori | null>(null);
  const [status, setStatus] = useState<BantuanStatus | null>(null);
  const [dari, setDari] = useState('');
  const [hingga, setHingga] = useState('');

  const [rows, setRows] = useState<BantuanAdminRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTick((value) => value + 1);
    }, []),
  );

  useEffect(() => {
    if (!access.canView) return;
    let active = true;
    // Debounce ringkas supaya setiap ketukan carian tidak menghantar permintaan.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [list, counts] = await Promise.all([
            fetchBantuanAdminList({ cari, kategori, status, dari: dari || null, hingga: hingga || null }),
            fetchBantuanSummary(),
          ]);
          if (!active) return;
          setRows(list);
          setSummary(counts);
          setError(null);
        } catch (caught) {
          if (active) {
            setRows((prev) => prev ?? []);
            setError(bantuanError(caught, 'Gagal memuatkan senarai permohonan.'));
          }
        }
      })();
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [access.canView, cari, kategori, status, dari, hingga, tick]);

  if (access.loading) return <LoadingScreen />;
  if (!access.canView) {
    return (
      <NoAccessScreen
        title="Permohonan Zakat"
        description="Skrin ini khusus untuk admin jabatan TABUNG ZAKAT dan Super Admin."
      />
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Lajnah Kebajikan" title="Permohonan Zakat" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        <View className="flex-row flex-wrap gap-2">
          {STATUS_FILTERS.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: status === key }}
              accessibilityLabel={STATUS_LABEL[key] + ': ' + (summary[key] ?? 0)}
              onPress={() => setStatus(status === key ? null : key)}
              className={`rounded-field border px-3 py-2 ${status === key ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
              <Text className="text-lg font-bold text-ink">{summary[key] ?? 0}</Text>
              <Text className="text-xs text-ink-muted">{STATUS_LABEL[key]}</Text>
            </Pressable>
          ))}
        </View>

        <TextField label="Cari nama atau nombor rujukan" value={cari} onChangeText={setCari} autoCapitalize="characters" placeholder="cth: BNT-2026-000001" />
        <PickerField
          label="Kategori"
          value={kategori}
          options={(Object.keys(KATEGORI_LABEL) as BantuanKategori[]).map((value) => ({ value, label: KATEGORI_LABEL[value] }))}
          onChange={setKategori}
          clearable
          clearLabel="Semua kategori"
          placeholder="Semua kategori"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <OptionalDateField label="Dihantar dari" value={dari} onChange={setDari} />
          </View>
          <View className="flex-1">
            <OptionalDateField label="Hingga" value={hingga} onChange={setHingga} />
          </View>
        </View>

        {rows === null ? <LoadingScreen /> : null}
        {rows !== null && rows.length === 0 && !error ? (
          <EmptyState icon="hand-left-outline" title="Tiada permohonan" description="Tiada permohonan sepadan dengan penapis semasa." />
        ) : null}

        {rows?.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={'Semak permohonan ' + (row.no_rujukan ?? '')}
            onPress={() => router.push({ pathname: '/(app)/admin/bantuan-detail', params: { id: row.id } })}
            className="active:opacity-70">
            <Card>
              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-base font-bold text-ink">{row.no_rujukan}</Text>
                  <Badge label={STATUS_LABEL[row.status]} tone={STATUS_TONE[row.status]} />
                </View>
                <Text className="text-sm text-ink">{row.nama_pemohon ?? '—'}{row.generasi ? ' (' + row.generasi + ')' : ''}</Text>
                <Text className="text-sm text-ink-muted">{KATEGORI_LABEL[row.kategori]}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {row.dihantar_semula ? <Badge label="Dihantar semula" tone="info" /> : null}
                  {row.pertindihan ? <Badge label="Kemungkinan pertindihan" tone="warn" /> : null}
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-ink-muted">Menunggu sejak {formatTarikh(row.dihantar_at)}</Text>
                  <Text className="text-xs font-semibold text-ink">Pendapatan keluarga {formatRM(row.pendapatan_keluarga)}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
