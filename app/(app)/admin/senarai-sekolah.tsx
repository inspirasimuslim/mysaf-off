import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { NoAccessScreen, SUPER_ADMIN_ONLY } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { createSchool, deleteSchool, fetchAllSchools, setSchoolActive, updateSchoolName } from '@/lib/schools';
import { type School } from '@/types/database';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/**
 * Senarai sekolah — dropdown tab Pendidikan borang ahli.
 *
 * Sama corak PERSIS `admin/generasi.tsx`: Super Admin sahaja (`schools`
 * RLS tulis, lihat `20260929000077_pendidikan_rombak.sql`), toggle aktif
 * ganti padam untuk sekolah yang masih dirujuk ahli (`sekolah_id` FK
 * `on delete restrict`). Beza satu: sekolah boleh disunting namanya
 * (generasi tidak, kod ialah kunci rujukan yang stabil).
 */
export default function SenaraiSekolahScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchAllSchools();
      setSchools(rows);
      setBanner(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai sekolah.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Tambah sekolah --------------------------------------------------------
  const [addModal, setAddModal] = useState(false);
  const [nama, setNama] = useState('');
  const [namaError, setNamaError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const openAddModal = useCallback(() => {
    setBanner(null);
    setNama('');
    setNamaError(null);
    setAddBusy(false);
    setAddModal(true);
  }, []);

  const changeNama = useCallback(
    (value: string) => {
      setNama(value);
      if (namaError) setNamaError(null);
    },
    [namaError],
  );

  const submitAdd = useCallback(async () => {
    if (addBusy) return;

    const value = nama.trim();
    if (!value) {
      setNamaError('Sila masukkan nama sekolah.');
      return;
    }
    if (schools.some((row) => row.nama.toLowerCase() === value.toLowerCase())) {
      setNamaError('Sekolah dengan nama ini sudah wujud.');
      return;
    }

    setAddBusy(true);
    try {
      await createSchool(value);
      setAddModal(false);
      setNama('');
      await load();
      setBanner({ tone: 'positive', message: value + ' telah ditambah.' });
    } catch (caught) {
      setNamaError(toMalayError(caught, 'Gagal menambah sekolah.'));
    } finally {
      setAddBusy(false);
    }
  }, [addBusy, load, nama, schools]);

  // --- Edit nama ---------------------------------------------------------------
  const [editing, setEditing] = useState<School | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = useCallback((school: School) => {
    setBanner(null);
    setEditing(school);
    setEditNama(school.nama);
    setEditError(null);
    setEditBusy(false);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editing || editBusy) return;

    const value = editNama.trim();
    if (!value) {
      setEditError('Sila masukkan nama sekolah.');
      return;
    }
    if (schools.some((row) => row.id !== editing.id && row.nama.toLowerCase() === value.toLowerCase())) {
      setEditError('Sekolah dengan nama ini sudah wujud.');
      return;
    }

    setEditBusy(true);
    try {
      await updateSchoolName(editing.id, value);
      setEditing(null);
      await load();
      setBanner({ tone: 'positive', message: 'Nama sekolah telah dikemas kini.' });
    } catch (caught) {
      setEditError(toMalayError(caught, 'Gagal mengemas kini nama sekolah.'));
    } finally {
      setEditBusy(false);
    }
  }, [editBusy, editNama, editing, load, schools]);

  // --- Toggle aktif ---------------------------------------------------------
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActive = useCallback(async (school: School, next: boolean) => {
    setBanner(null);
    setTogglingId(school.id);

    setSchools((rows) => rows.map((row) => (row.id === school.id ? { ...row, aktif: next } : row)));

    try {
      await setSchoolActive(school.id, next);
    } catch (caught) {
      setSchools((rows) => rows.map((row) => (row.id === school.id ? { ...row, aktif: !next } : row)));
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini status sekolah.') });
    } finally {
      setTogglingId(null);
    }
  }, []);

  // --- Padam ----------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<School | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteSchool(pendingDelete.id);
      const removed = pendingDelete.nama;
      setPendingDelete(null);
      await load();
      setBanner({ tone: 'positive', message: removed + ' telah dipadam.' });
    } catch (caught) {
      setPendingDelete(null);
      /*
        `members.sekolah_id` merujuk `schools.id` dengan `on delete restrict`,
        jadi pangkalan data menolak pemadaman sekolah yang masih digunakan.
        Ralat kekangan itu ditukar kepada sebab yang boleh difahami.
      */
      const raw = caught instanceof Error ? caught.message : '';
      const inUse = /foreign key|violates|restrict/i.test(raw);
      setBanner({
        tone: 'negative',
        message: inUse
          ? 'Sekolah ini masih digunakan oleh rekod ahli. Tetapkan sekolah ini sebagai nonaktif sebaliknya.'
          : toMalayError(caught, 'Gagal memadam sekolah.'),
      });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pendingDelete]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const activeCount = schools.filter((row) => row.aktif).length;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Senarai Sekolah"
          subtitle={schools.length + ' sekolah · ' + activeCount + ' aktif'}
          onBackPress={goBack}
        />

        <View className="gap-5 px-gutter pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button label="Tambah Sekolah" onPress={openAddModal} />

          {schools.length === 0 ? (
            <EmptyState
              icon="school-outline"
              title="Tiada sekolah"
              description="Tambah sekolah pertama sebelum ahli boleh memilihnya dalam borang."
            />
          ) : (
            <View>
              <SectionTitle
                title="Senarai Sekolah"
                caption="Sekolah nonaktif kekal pada rekod sedia ada tetapi tidak boleh dipilih untuk ahli baharu."
              />
              <View className="gap-2">
                {schools.map((school) => (
                  <View
                    key={school.id}
                    className="flex-row items-center gap-3 rounded-card border border-line bg-surface py-2 pl-4 pr-2">
                    <View className="flex-1 flex-row items-center gap-2">
                      <Text className="flex-shrink text-base font-semibold text-ink" numberOfLines={1}>
                        {school.nama}
                      </Text>
                      <View>
                        <Badge label={school.aktif ? 'Aktif' : 'Nonaktif'} tone={school.aktif ? 'positive' : 'neutral'} />
                      </View>
                    </View>

                    <Switch
                      value={school.aktif}
                      onValueChange={(next) => void toggleActive(school, next)}
                      disabled={togglingId === school.id}
                      trackColor={{ false: colors.line, true: colors.primaryMid }}
                      thumbColor={colors.white}
                      ios_backgroundColor={colors.line}
                      accessibilityLabel={'Status aktif ' + school.nama}
                    />

                    <IconButton
                      icon="pencil-outline"
                      accessibilityLabel={'Sunting ' + school.nama}
                      onPress={() => openEdit(school)}
                    />

                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      accessibilityLabel={'Padam ' + school.nama}
                      onPress={() => setPendingDelete(school)}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={addModal}
        title="Tambah Sekolah"
        description="Nama mesti unik. Sekolah baharu terus aktif."
        dismissable={!addBusy}
        onClose={() => setAddModal(false)}>
        <TextField
          label="Nama sekolah"
          placeholder="Contoh: SMKA FALAHIAH"
          value={nama}
          onChangeText={changeNama}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          editable={!addBusy}
          error={namaError}
          onSubmitEditing={() => void submitAdd()}
        />

        <Button label="Simpan Sekolah" loading={addBusy} disabled={addBusy} onPress={() => void submitAdd()} />
      </FormModal>

      <FormModal
        visible={editing !== null}
        title="Sunting Nama Sekolah"
        description="Menukar nama tidak menjejaskan ahli yang sudah memilih sekolah ini."
        dismissable={!editBusy}
        onClose={() => setEditing(null)}>
        <TextField
          label="Nama sekolah"
          value={editNama}
          onChangeText={(value) => {
            setEditNama(value);
            if (editError) setEditError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          editable={!editBusy}
          error={editError}
          onSubmitEditing={() => void submitEdit()}
        />

        <Button label="Simpan Perubahan" loading={editBusy} disabled={editBusy} onPress={() => void submitEdit()} />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam sekolah?"
        message={
          'Anda pasti mahu memadam ' +
          (pendingDelete?.nama ?? '') +
          '? Sekolah yang masih digunakan oleh rekod ahli tidak boleh dipadam.'
        }
        confirmLabel="Padam"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
