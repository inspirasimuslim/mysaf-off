import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import {
  appointCounselor,
  counselErrorMessage,
  fetchCounselorAdminList,
  removeCounselor,
  searchCounselorCandidates,
  type CounselorAdminRow,
  type CounselorSearchRow,
} from '@/lib/counseling';
import { useDepartmentAccess } from '@/lib/department-access';
import { formatTarikh } from '@/lib/bantuan';
import { useGoBack } from '@/lib/navigation';

const KEBAJIKAN_DEPARTMENT = 'LAJNAH KEBAJIKAN';

/**
 * Kaunselor (migration 153) — LAJNAH KEBAJIKAN melantik / membuang kaunselor dan melihat
 * senarai (aktif + dibuang) dengan BILANGAN ahli yang menghubungi. Identiti ahli TIDAK
 * dipaparkan di sini dan tidak dapat dibaca daripada pangkalan data oleh admin.
 */
export default function KaunselorScreen() {
  const goBack = useGoBack();
  const access = useDepartmentAccess(KEBAJIKAN_DEPARTMENT);

  const [rows, setRows] = useState<CounselorAdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CounselorSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<CounselorAdminRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchCounselorAdminList());
      setError(null);
    } catch (caught) {
      setRows((prev) => prev ?? []);
      setError(counselErrorMessage(caught, 'Gagal memuatkan senarai kaunselor.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (access.loading || !access.canView) return;
      void load();
    }, [access.loading, access.canView, load]),
  );

  if (access.loading || (access.canView && rows === null)) return <LoadingScreen />;

  if (!access.canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kaunselor" onBackPress={goBack} />
        <View className="px-gutter pt-5">
          <Notice tone="negative" message="Anda tidak mempunyai akses ke Lajnah Kebajikan." />
        </View>
      </Screen>
    );
  }

  const list = rows ?? [];
  const aktif = list.filter((row) => row.aktif);
  const dibuang = list.filter((row) => !row.aktif);

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchCounselorCandidates(query));
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal mencari ahli.'));
    } finally {
      setSearching(false);
    }
  };

  const appoint = async (candidate: CounselorSearchRow) => {
    setBusyId(candidate.id);
    setError(null);
    try {
      await appointCounselor(candidate.id);
      setNotice(candidate.full_name + ' dilantik sebagai kaunselor.');
      setResults([]);
      setQuery('');
      await load();
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal melantik kaunselor.'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    if (!toRemove) return;
    setBusyId(toRemove.id);
    setError(null);
    try {
      await removeCounselor(toRemove.id);
      setNotice(toRemove.full_name + ' dibuang daripada senarai kaunselor.');
      setToRemove(null);
      await load();
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal membuang kaunselor.'));
      setToRemove(null);
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (row: CounselorAdminRow) => (
    <Card key={row.id}>
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 text-base font-bold text-ink">
            {row.full_name}
            {row.generasi ? '  ·  ' + row.generasi : ''}
          </Text>
          <Badge label={row.aktif ? 'Aktif' : 'Dibuang'} tone={row.aktif ? 'positive' : 'neutral'} />
        </View>
        <Text className="text-sm text-ink-muted">
          {'Dilantik ' + formatTarikh(row.appointed_at) + (row.removed_at ? ' · Dibuang ' + formatTarikh(row.removed_at) : '')}
        </Text>
        <Text className="text-sm font-semibold text-ink">{row.ahli_menghubungi + ' ahli menghubungi'}</Text>
        {row.aktif && access.canEdit ? (
          <Button
            label="Buang"
            variant="danger"
            size="sm"
            disabled={busyId === row.id}
            onPress={() => setToRemove(row)}
          />
        ) : null}
      </View>
    </Card>
  );

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Lajnah Kebajikan" title="Kaunselor" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        <Notice
          tone="info"
          message="Anda hanya melihat bilangan ahli yang menghubungi setiap kaunselor (ketikan WhatsApp/telefon dan mesej dalam app), bukan siapa mereka. Hanya kaunselor yang dihubungi mengetahui identiti ahli."
        />
        {notice ? <Notice tone="positive" message={notice} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}

        {access.canEdit ? (
          <View className="gap-3">
            <SectionTitle title="Lantik Kaunselor" caption="Cari ahli mengikut nama atau nombor ahli (sekurang-kurangnya 2 aksara)." />
            <TextField label="Cari ahli" value={query} onChangeText={setQuery} placeholder="Nama atau nombor ahli" />
            <Button label="Cari" loading={searching} disabled={searching || query.trim().length < 2} onPress={() => void search()} />
            {results.map((candidate) => (
              <Card key={candidate.id}>
                <View className="gap-2">
                  <Text className="text-base font-bold text-ink">
                    {candidate.full_name}
                    {candidate.generasi ? '  ·  ' + candidate.generasi : ''}
                  </Text>
                  {candidate.nombor_ahli ? <Text className="text-sm text-ink-muted">{candidate.nombor_ahli}</Text> : null}
                  {candidate.sudah_kaunselor ? (
                    <Badge label="Sudah menjadi kaunselor" tone="neutral" />
                  ) : (
                    <Button
                      label="Lantik"
                      size="sm"
                      loading={busyId === candidate.id}
                      disabled={busyId !== null}
                      onPress={() => void appoint(candidate)}
                    />
                  )}
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        <SectionTitle title={'Kaunselor Aktif (' + aktif.length + ')'} />
        {aktif.length === 0 ? (
          <EmptyState icon="heart-outline" title="Tiada kaunselor aktif" description="Lantik ahli sebagai kaunselor menggunakan carian di atas." />
        ) : (
          aktif.map(renderRow)
        )}

        {dibuang.length > 0 ? (
          <>
            <SectionTitle title={'Pernah Dilantik / Dibuang (' + dibuang.length + ')'} />
            {dibuang.map(renderRow)}
          </>
        ) : null}
      </View>

      <ConfirmDialog
        visible={toRemove !== null}
        title="Buang kaunselor?"
        message={
          toRemove
            ? toRemove.full_name +
              ' tidak lagi dipaparkan kepada ahli dan kehilangan akses kepada perbualannya. Sejarah dan bilangan kekal.'
            : ''
        }
        confirmLabel="Buang"
        destructive
        busy={busyId !== null}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setToRemove(null)}
      />
    </Screen>
  );
}
