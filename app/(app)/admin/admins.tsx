import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { fetchAssignments, fetchDepartments, fetchProfiles, removeAdmin, saveAssignments } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { profileName, type AdminAssignment, type Department, type Permission, type Profile } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Keadaan borang lantikan. `picking` benar semasa langkah pilih ahli. */
type Editor = {
  profile: Profile | null;
  picking: boolean;
  selection: Record<string, Permission>;
};

/** Dua suis kebenaran bagi satu department yang dipilih. */
function PermissionToggles({
  permission,
  onChange,
  disabled,
}: {
  permission: Permission;
  onChange: (next: Permission) => void;
  disabled: boolean;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-sm text-ink-muted">Lihat data department</Text>
        <Switch
          value={permission.can_view}
          // Mematikan "Lihat" turut mematikan "Edit" — edit tanpa lihat tiada makna.
          onValueChange={(next) => onChange({ can_view: next, can_edit: next ? permission.can_edit : false })}
          disabled={disabled}
          trackColor={{ false: Colors.line, true: Colors.primaryMid }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.line}
          accessibilityLabel="Kebenaran lihat"
        />
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-sm text-ink-muted">Edit data department</Text>
        <Switch
          value={permission.can_edit}
          // "Edit" merangkumi "Lihat" secara automatik.
          onValueChange={(next) => onChange({ can_view: next ? true : permission.can_view, can_edit: next })}
          disabled={disabled}
          trackColor={{ false: Colors.line, true: Colors.primaryMid }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.line}
          accessibilityLabel="Kebenaran edit"
        />
      </View>
    </View>
  );
}

export default function AdminsScreen() {
  const goBack = useGoBack();
  const { refresh: refreshPermissions, profile: me, isSuperAdmin } = usePermissions();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const [nextProfiles, nextDepartments, nextAssignments] = await Promise.all([
        fetchProfiles(),
        fetchDepartments(),
        fetchAssignments(),
      ]);
      setProfiles(nextProfiles);
      setDepartments(nextDepartments);
      setAssignments(nextAssignments);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan data admin.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentName = useCallback(
    (id: string) => departments.find((row) => row.id === id)?.name ?? 'Department dipadam',
    [departments],
  );

  const admins = useMemo(() => profiles.filter((row) => row.role === 'admin'), [profiles]);

  const assignmentsOf = useCallback(
    (userId: string) => assignments.filter((row) => row.user_id === userId),
    [assignments],
  );

  // --- Borang lantikan ------------------------------------------------------
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  const openNew = useCallback(() => {
    setBanner(null);
    setSearch('');
    setEditorNotice(null);
    setSaveBusy(false);
    setEditor({ profile: null, picking: true, selection: {} });
  }, []);

  const openEdit = useCallback(
    (profile: Profile) => {
      setBanner(null);
      setEditorNotice(null);
      setSaveBusy(false);

      const selection: Record<string, Permission> = {};
      for (const row of assignmentsOf(profile.id)) {
        selection[row.department_id] = { can_view: row.can_view, can_edit: row.can_edit };
      }

      setEditor({ profile, picking: false, selection });
    },
    [assignmentsOf],
  );

  /** Calon lantikan: semua kecuali Super Admin (mereka sudah ada akses penuh). */
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return profiles
      .filter((row) => row.role !== 'super_admin' && row.role !== 'owner')
      .filter(
        (row) =>
          !term ||
          profileName(row).toLowerCase().includes(term) ||
          (row.email ?? '').toLowerCase().includes(term),
      );
  }, [profiles, search]);

  /**
   * Department yang boleh dipilih: yang aktif, ditambah yang nonaktif tetapi
   * masih dipegang — supaya menyunting seorang admin tidak diam-diam
   * menanggalkan lantikan lamanya.
   */
  const selectableDepartments = useMemo(() => {
    if (!editor) return [];
    return departments.filter((row) => row.is_active || row.id in editor.selection);
  }, [departments, editor]);

  const toggleDepartment = useCallback((departmentId: string) => {
    setEditorNotice(null);
    setEditor((current) => {
      if (!current) return current;

      const selection = { ...current.selection };
      if (departmentId in selection) delete selection[departmentId];
      else selection[departmentId] = { can_view: true, can_edit: false };

      return { ...current, selection };
    });
  }, []);

  const changePermission = useCallback((departmentId: string, next: Permission) => {
    setEditor((current) => {
      if (!current) return current;
      return { ...current, selection: { ...current.selection, [departmentId]: next } };
    });
  }, []);

  const submitEditor = useCallback(async () => {
    if (!editor?.profile || saveBusy) return;

    const target = editor.profile;
    const count = Object.keys(editor.selection).length;

    setSaveBusy(true);
    setEditorNotice(null);
    try {
      await saveAssignments(target.id, editor.selection, target.role);
      setEditor(null);
      await load();
      // Peranan sendiri mungkin berubah — segarkan context supaya UI ikut sama.
      if (target.id === me?.id) await refreshPermissions();

      setBanner({
        tone: 'positive',
        message: count
          ? profileName(target) + ' kini admin bagi ' + count + ' department.'
          : profileName(target) + ' telah ditanggalkan daripada semua department dan kembali menjadi Ahli.',
      });
    } catch (caught) {
      setEditorNotice(toMalayError(caught, 'Gagal menyimpan lantikan.'));
    } finally {
      setSaveBusy(false);
    }
  }, [editor, load, me?.id, refreshPermissions, saveBusy]);

  // --- Buang admin ----------------------------------------------------------
  const [pendingRemove, setPendingRemove] = useState<Profile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const confirmRemove = useCallback(async () => {
    if (!pendingRemove || removeBusy) return;

    const target = pendingRemove;
    setRemoveBusy(true);
    try {
      await removeAdmin(target.id);
      setPendingRemove(null);
      await load();
      if (target.id === me?.id) await refreshPermissions();
      setBanner({ tone: 'positive', message: profileName(target) + ' bukan lagi admin.' });
    } catch (caught) {
      setPendingRemove(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal membuang admin.') });
    } finally {
      setRemoveBusy(false);
    }
  }, [load, me?.id, pendingRemove, refreshPermissions, removeBusy]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const editorTitle = editor?.picking ? 'Pilih Ahli' : editor?.profile ? profileName(editor.profile) : 'Lantik Admin';

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Admin"
          subtitle={admins.length + ' admin dilantik'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button label="Lantik Admin Baru" onPress={openNew} />

          {admins.length === 0 ? (
            <EmptyState
              icon="shield-outline"
              title="Tiada admin lagi"
              description="Lantik ahli sebagai admin dan tetapkan department serta kebenaran mereka."
            />
          ) : (
            <View>
              <SectionTitle title="Senarai Admin" caption="Ketuk ikon pensel untuk mengubah department & kebenaran." />
              <View className="gap-4">
                {admins.map((admin) => {
                  const rows = assignmentsOf(admin.id);

                  return (
                    <View key={admin.id} className="rounded-card border border-line bg-surface p-card">
                      <View className="flex-row items-start gap-3">
                        <View className="flex-1">
                          <Text className="text-base font-semibold text-ink">{profileName(admin)}</Text>
                          {admin.email ? (
                            <Text className="mt-0.5 text-sm text-ink-muted">{admin.email}</Text>
                          ) : null}
                        </View>

                        <IconButton
                          icon="create-outline"
                          accessibilityLabel={'Ubah lantikan ' + profileName(admin)}
                          onPress={() => openEdit(admin)}
                        />
                        <IconButton
                          icon="person-remove-outline"
                          tone="danger"
                          accessibilityLabel={'Buang ' + profileName(admin) + ' daripada semua department'}
                          onPress={() => setPendingRemove(admin)}
                        />
                      </View>

                      <View className="mt-4 gap-2">
                        {rows.length === 0 ? (
                          <Text className="text-sm text-ink-faint">
                            Belum ada department — akses admin ini masih kosong.
                          </Text>
                        ) : (
                          rows.map((row) => (
                            <View key={row.id} className="flex-row items-center gap-3">
                              <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
                                {departmentName(row.department_id)}
                              </Text>
                              <Badge
                                label={row.can_edit ? 'Lihat & Edit' : row.can_view ? 'Lihat' : 'Tiada akses'}
                                tone={row.can_edit ? 'primary' : row.can_view ? 'info' : 'neutral'}
                              />
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={editor !== null}
        title={editorTitle}
        description={
          editor?.picking
            ? 'Pilih seorang ahli untuk dilantik sebagai admin.'
            : 'Pilih department yang dikendalikan dan tetapkan kebenaran setiap satu. Tanpa sebarang department, peranan akan kembali kepada Ahli.'
        }
        dismissable={!saveBusy}
        onClose={() => setEditor(null)}
        /*
          Butang di footer dan bukan di hujung senarai: dengan banyak department
          dan suis kebenaran, hujung senarai boleh jauh di bawah skrin.
        */
        footer={
          editor && !editor.picking ? (
            <Button
              label="Simpan Lantikan"
              loading={saveBusy}
              disabled={saveBusy}
              onPress={() => void submitEditor()}
            />
          ) : undefined
        }>
        {editorNotice ? <Notice tone="negative" message={editorNotice} /> : null}

        {editor?.picking ? (
          <>
            <TextField
              label="Cari ahli"
              placeholder="Nama atau emel"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              topAnchored
            />

            {candidates.length === 0 ? (
              <Text className="py-6 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
            ) : (
              <View className="gap-3">
                {candidates.map((candidate) => (
                  <SelectRow
                    key={candidate.id}
                    title={profileName(candidate)}
                    subtitle={
                      (candidate.email ?? 'Tiada emel') + (candidate.role === 'admin' ? ' · sudah jadi admin' : '')
                    }
                    selected={false}
                    onPress={() => {
                      const selection: Record<string, Permission> = {};
                      for (const row of assignmentsOf(candidate.id)) {
                        selection[row.department_id] = { can_view: row.can_view, can_edit: row.can_edit };
                      }
                      setEditor({ profile: candidate, picking: false, selection });
                    }}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {selectableDepartments.length === 0 ? (
              <Notice
                tone="warn"
                message="Tiada department aktif. Tambah atau aktifkan department dahulu sebelum melantik admin."
              />
            ) : (
              <View className="gap-3">
                {selectableDepartments.map((department) => {
                  const permission = editor ? editor.selection[department.id] : undefined;

                  return (
                    <SelectRow
                      key={department.id}
                      title={department.name}
                      subtitle={department.is_active ? undefined : 'Department nonaktif'}
                      selected={permission !== undefined}
                      onPress={() => toggleDepartment(department.id)}
                      disabled={saveBusy}>
                      {permission ? (
                        <PermissionToggles
                          permission={permission}
                          onChange={(next) => changePermission(department.id, next)}
                          disabled={saveBusy}
                        />
                      ) : null}
                    </SelectRow>
                  );
                })}
              </View>
            )}
          </>
        )}
      </FormModal>

      <ConfirmDialog
        visible={pendingRemove !== null}
        title="Buang admin?"
        message={
          (pendingRemove ? profileName(pendingRemove) : '') +
          ' akan ditanggalkan daripada semua department dan peranannya kembali kepada Ahli.'
        }
        confirmLabel="Buang Admin"
        destructive
        busy={removeBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
