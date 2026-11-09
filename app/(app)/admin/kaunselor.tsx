import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { CounselorProfileModal } from '@/components/counselor-profile-modal';
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
  deleteCounselor,
  counselErrorMessage,
  counselorImageUrl,
  saveCounselorProfile,
  type CounselorProfileInput,
  fetchCounselorAdminList,
  removeCounselor,
  searchCounselorCandidates,
  type CounselorAdminRow,
  type CounselorSearchRow,
} from '@/lib/counseling';
import { useDepartmentAccess } from '@/lib/department-access';
import { formatTarikh } from '@/lib/bantuan';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';

const KEBAJIKAN_DEPARTMENT = 'LAJNAH KEBAJIKAN';

/**
 * Kaunselor (migration 153) — LAJNAH KEBAJIKAN melantik / membuang kaunselor dan melihat
 * senarai (aktif + tidak lagi bertugas) dengan BILANGAN ahli yang menghubungi. Identiti ahli TIDAK
 * dipaparkan di sini dan tidak dapat dibaca daripada pangkalan data oleh admin.
 */
export default function KaunselorScreen() {
  const goBack = useGoBack();
  const access = useDepartmentAccess(KEBAJIKAN_DEPARTMENT);
  const colors = useColors();

  const [rows, setRows] = useState<CounselorAdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CounselorSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  // Carian semasa menaip: tangguh 300ms; `searchSeq` membuang jawapan lapuk bila teks sudah berubah.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<CounselorAdminRow | null>(null);
  const [toDelete, setToDelete] = useState<CounselorAdminRow | null>(null);
  const [editing, setEditing] = useState<CounselorAdminRow | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

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

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const mySeq = ++searchSeq.current;

    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchCounselorCandidates(value.trim());
          if (mySeq === searchSeq.current) {
            setResults(found);
            setError(null);
          }
        } catch (caught) {
          if (mySeq === searchSeq.current) setError(counselErrorMessage(caught, 'Gagal mencari ahli.'));
        } finally {
          if (mySeq === searchSeq.current) setSearching(false);
        }
      })();
    }, 300);
  };

  const appoint = async (candidate: CounselorSearchRow) => {
    setBusyId(candidate.id);
    setError(null);
    try {
      await appointCounselor(candidate.id);
      setNotice(candidate.full_name + ' dilantik sebagai kaunselor.');
      searchSeq.current += 1;
      setResults([]);
      setQuery('');
      setSearching(false);
      await load();
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal melantik kaunselor.'));
    } finally {
      setBusyId(null);
    }
  };

  const saveProfile = async (input: CounselorProfileInput, photoUri: string | null, removePhoto: boolean) => {
    if (!editing) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      await saveCounselorProfile(editing, input, photoUri, removePhoto);
      setNotice('Profil ' + editing.full_name + ' disimpan.');
      setEditing(null);
      await load();
    } catch (caught) {
      setProfileError(counselErrorMessage(caught, 'Gagal menyimpan profil. Sila cuba lagi.'));
    } finally {
      setProfileBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!toRemove) return;
    setBusyId(toRemove.id);
    setError(null);
    try {
      await removeCounselor(toRemove.id);
      setNotice(toRemove.full_name + ' kini tidak aktif sebagai kaunselor.');
      setToRemove(null);
      await load();
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal menyahaktifkan kaunselor.'));
      setToRemove(null);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    setError(null);
    try {
      await deleteCounselor(toDelete.id);
      setNotice(toDelete.full_name + ' dipadam.');
      setToDelete(null);
      await load();
    } catch (caught) {
      setError(counselErrorMessage(caught, 'Gagal memadam kaunselor.'));
      setToDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (row: CounselorAdminRow) => (
    <Card key={row.id}>
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          {row.gambar_path ? (
            <Image
              source={{ uri: counselorImageUrl(row.gambar_path) }}
              style={{ width: 48, height: 48, borderRadius: 24 }}
              contentFit="cover"
              accessibilityLabel={'Gambar ' + row.full_name}
            />
          ) : (
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-primary-soft">
              <Ionicons name="person-outline" size={22} color={colors.primary} />
            </View>
          )}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-base font-bold text-ink">
              {row.nama_penuh || row.full_name}
              {row.generasi ? '  ·  ' + row.generasi : ''}
            </Text>
            <Text className="text-sm text-ink-muted">{row.ahli_menghubungi + ' ahli menghubungi'}</Text>
          </View>
        </View>
        {access.canEdit ? (
          <Button
            label="Sunting Profil"
            variant="secondary"
            size="sm"
            onPress={() => {
              setProfileError(null);
              setEditing(row);
            }}
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
            <SectionTitle title="Lantik Kaunselor" caption="Taip nama atau nombor ahli (sekurang-kurangnya 2 aksara) — cadangan muncul terus." />
            <TextField
              label="Cari ahli"
              value={query}
              onChangeText={onQueryChange}
              placeholder="Taip sebahagian nama atau nombor ahli"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching ? <Text className="text-sm text-ink-muted">Mencari…</Text> : null}
            {!searching && query.trim().length >= 2 && results.length === 0 ? (
              <Text className="text-sm text-ink-muted">Tiada ahli yang sepadan.</Text>
            ) : null}
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
            <SectionTitle title={'Kaunselor Tidak Aktif (' + dibuang.length + ')'} />
            {dibuang.map(renderRow)}
          </>
        ) : null}
      </View>

      <CounselorProfileModal
        counselor={editing}
        busy={profileBusy}
        error={profileError}
        onClose={() => setEditing(null)}
        onSubmit={(input, photoUri, removePhoto) => void saveProfile(input, photoUri, removePhoto)}
        onDeactivate={() => {
          const row = editing;
          setEditing(null);
          if (row) setToRemove(row);
        }}
        onDelete={() => {
          const row = editing;
          setEditing(null);
          if (row) setToDelete(row);
        }}
      />

      <ConfirmDialog
        visible={toRemove !== null}
        title="Nyahaktifkan kaunselor?"
        message={
          toRemove
            ? toRemove.full_name +
              ' tidak lagi dipaparkan kepada ahli dan kehilangan akses kepada perbualannya. Sejarah dan bilangan kekal.'
            : ''
        }
        confirmLabel="Nyahaktif"
        destructive
        busy={busyId !== null}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setToRemove(null)}
      />

      <ConfirmDialog
        visible={toDelete !== null}
        title="Padam kaunselor?"
        message={
          toDelete
            ? toDelete.full_name +
              ' akan dipadam KEKAL bersama semua perbualan kaunselingnya dengan ahli dan catatan bilangan menghubungi. Tindakan ini tidak boleh dibatalkan. Jika hanya mahu berhenti memaparkannya, pilih Nyahaktif.'
            : ''
        }
        confirmLabel="Padam Kekal"
        destructive
        busy={busyId !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}
