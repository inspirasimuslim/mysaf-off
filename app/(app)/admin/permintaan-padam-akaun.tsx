import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { ToastBanner } from '@/components/ui/toast';
import {
  listAccountDeletionRequests,
  resolveAccountDeletionRequest,
  type AccountDeletionRequest,
} from '@/lib/account-deletion';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/**
 * Permintaan padam akaun daripada ahli — Super Admin sahaja. Memproses sebenar
 * (diputihkan / dianonimkan) dibuat melalui skrin ahli; di sini hanya menanda
 * permintaan selesai atau ditolak.
 */
export default function PermintaanPadamAkaunScreen() {
  const goBack = useGoBack();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const allowed = isSuperAdmin();

  const [rows, setRows] = useState<AccountDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listAccountDeletionRequests());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan permintaan.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !allowed) return;
    void load();
  }, [allowed, load, permLoading]);

  const resolve = async (id: string, status: 'selesai' | 'ditolak') => {
    if (busyId) return;
    setBusyId(id);
    try {
      await resolveAccountDeletionRequest(id, status);
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Tindakan gagal.') });
    } finally {
      setBusyId(null);
    }
  };

  if (permLoading || (allowed && loading)) return <LoadingScreen />;
  if (!allowed) {
    return <NoAccessScreen title="Permintaan Padam Akaun" description="Halaman ini khusus untuk Super Admin." />;
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Permintaan Padam Akaun" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-8 pt-6">
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        {rows.length === 0 ? (
          <EmptyState icon="trash-outline" title="Tiada permintaan" description="Belum ada ahli memohon padam akaun." />
        ) : (
          rows.map((row) => (
            <View key={row.id} className="gap-2 rounded-card border border-line bg-surface p-card">
              <Text className="text-base font-semibold text-ink">
                {row.full_name}
                {row.generasi ? ' · ' + row.generasi : ''}
              </Text>
              <Text className="text-sm text-ink-muted">
                {new Date(row.created_at).toLocaleString('ms-MY') + ' · ' + row.status}
              </Text>
              {row.alasan ? <Text className="text-sm text-ink">{row.alasan}</Text> : null}
              {row.status === 'pending' ? (
                <View className="mt-1 flex-row gap-3">
                  <Button label="Selesai" loading={busyId === row.id} onPress={() => void resolve(row.id, 'selesai')} />
                  <Button
                    label="Tolak"
                    variant="secondary"
                    disabled={busyId === row.id}
                    onPress={() => void resolve(row.id, 'ditolak')}
                  />
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
