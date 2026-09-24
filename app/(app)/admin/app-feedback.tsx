import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { fetchAppFeedback, type AppFeedbackRow } from '@/lib/app-feedback';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';

/** Maklum balas aplikasi — Super Admin sahaja, baca sahaja (tiada edit/padam). */
export default function AppFeedbackScreen() {
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();

  const [rows, setRows] = useState<AppFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await fetchAppFeedback());
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan maklum balas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((row) => row.full_name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Maklum Balas Aplikasi" description={SUPER_ADMIN_ONLY} />;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Super Admin"
        title="Maklum Balas Aplikasi"
        subtitle={rows.length + ' maklum balas'}
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-8 pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {rows.length > 5 ? <TextField label="Cari" placeholder="Nama ahli" value={query} onChangeText={setQuery} /> : null}

        {filtered.length ? (
          filtered.map((row) => (
            <Card key={row.id}>
              <Text className="text-base font-bold text-ink">
                {row.full_name}
                {row.generasi ? '  ·  ' + row.generasi : ''}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">{new Date(row.created_at).toLocaleString('ms-MY')}</Text>
              <Text className="mt-3 text-sm leading-5 text-ink" selectable>
                {row.message}
              </Text>
            </Card>
          ))
        ) : error ? null : (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title={rows.length ? 'Tiada padanan' : 'Belum ada maklum balas'}
            description={rows.length ? 'Cuba nama lain.' : 'Maklum balas yang dihantar ahli akan muncul di sini.'}
          />
        )}
      </View>
    </Screen>
  );
}
