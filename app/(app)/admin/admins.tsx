import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

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
import { COUNSELOR_LABEL, departmentLabel, sortDepartments } from '@/lib/department-labels';
import { fetchCounselorAdminList, type CounselorAdminRow } from '@/lib/counseling';
import { fetchAssignments, fetchDepartments, fetchProfiles, removeDepartmentAdmin, saveAssignments } from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { profileName, type AdminAssignment, type Department, type Permission, type Profile } from '@/types/database';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Borang tambah/ubah admin bagi SATU department. */
type Editor = {
  department: Department;
  profile: Profile | null; // null = langkah pilih ahli
  permission: Permission;
  existing: boolean;
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
  const colors = useColors();
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-sm text-ink-muted">Lihat data department</Text>
        <Switch
          value={permission.can_view}
          // Mematikan "Lihat" turut mematikan "Edit" — edit tanpa lihat tiada makna.
          onValueChange={(next) => onChange({ can_view: next, can_edit: next ? permission.can_edit : false })}
          disabled={disabled}
          trackColor={{ false: colors.line, true: colors.primaryMid }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.line}
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
          trackColor={{ false: colors.line, true: colors.primaryMid }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.line}
          accessibilityLabel="Kebenaran edit"
        />
      </View>
    </View>
  );
}

export default function AdminsScreen() {
  const goBack = useGoBack();
  const colors = useColors();
  const router = useRouter();
  const { refresh: refreshPermissions, profile: me, isSuperAdmin } = usePermissions();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [counselors, setCounselors] = useState<CounselorAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextProfiles, nextDepartments, nextAssignments, nextCounselors] = await Promise.all([
        fetchProfiles(),
        fetchDepartments(),
        fetchAssignments(),
        fetchCounselorAdminList().catch(() => [] as CounselorAdminRow[]),
      ]);
      setProfiles(nextProfiles);
      setDepartments(nextDepartments);
      setAssignments(nextAssignments);
      setCounselors(nextCounselors.filter((row) => row.aktif));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan data admin.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileById = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);

  const sections = useMemo(
    () =>
      sortDepartments(departments.filter((row) => row.is_active || assignments.some((a) => a.department_id === row.id))).map(
        (department) => ({
          department,
          rows: assignments
            .filter((row) => row.department_id === department.id)
            .map((row) => ({ row, profile: profileById.get(row.user_id) }))
            .filter((item): item is { row: AdminAssignment; profile: Profile } => item.profile !== undefined)
            .sort((a, b) => profileName(a.profile).localeCompare(profileName(b.profile))),
        }),
      ),
    [departments, assignments, profileById],
  );

  // --- Tambah / ubah ---------------------------------------------------------
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  const openAdd = useCallback((department: Department) => {
    setBanner(null);
    setSearch('');
    setEditorNotice(null);
    setSaveBusy(false);
    setEditor({ department, profile: null, permission: { can_view: true, can_edit: false }, existing: false });
  }, []);

  const openEdit = useCallback((department: Department, profile: Profile, permission: Permission) => {
    setBanner(null);
    setEditorNotice(null);
    setSaveBusy(false);
    setEditor({ department, profile, permission, existing: true });
  }, []);

  const candidates = useMemo(() => {
    if (!editor) return [];
    const term = search.trim().toLowerCase();
    const already = new Set(
      assignments.filter((row) => row.department_id === editor.department.id).map((row) => row.user_id),
    );
    return profiles
      .filter((row) => row.role !== 'super_admin' && row.role !== 'owner' && !already.has(row.id))
      .filter(
        (row) =>
          !term ||
          profileName(row).toLowerCase().includes(term) ||
          (row.email ?? '').toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [profiles, assignments, search, editor]);

  const submitEditor = useCallback(async () => {
    if (!editor?.profile || saveBusy) return;

    const target = editor.profile;
    const selection: Record<string, Permission> = {};
    for (const row of assignments.filter((a) => a.user_id === target.id)) {
      selection[row.department_id] = { can_view: row.can_view, can_edit: row.can_edit };
    }
    selection[editor.department.id] = editor.permission;

    setSaveBusy(true);
    setEditorNotice(null);
    try {
      await saveAssignments(target.id, selection, target.role);
      setEditor(null);
      await load();
      if (target.id === me?.id) await refreshPermissions();
      setBanner({
        tone: 'positive',
        message: profileName(target) + ' kini admin ' + departmentLabel(editor.department.name) + '.',
      });
    } catch (caught) {
      setEditorNotice(toMalayError(caught, 'Gagal menyimpan lantikan.'));
    } finally {
      setSaveBusy(false);
    }
  }, [assignments, editor, load, me?.id, refreshPermissions, saveBusy]);

  // --- Buang (dua pengesahan) -------------------------------------------------
  const [pendingRemove, setPendingRemove] = useState<{ profile: Profile; department: Department } | null>(null);
  const [removeStep, setRemoveStep] = useState<1 | 2>(1);
  const [removeBusy, setRemoveBusy] = useState(false);

  const askRemove = useCallback((profile: Profile, department: Department) => {
    setBanner(null);
    setRemoveStep(1);
    setPendingRemove({ profile, department });
  }, []);

  const confirmRemove = useCallback(async () => {
    if (!pendingRemove || removeBusy) return;
    const { profile, department } = pendingRemove;
    setRemoveBusy(true);
    try {
      await removeDepartmentAdmin(profile.id, department.id, profile.role);
      setPendingRemove(null);
      await load();
      if (profile.id === me?.id) await refreshPermissions();
      setBanner({
        tone: 'positive',
        message: profileName(profile) + ' bukan lagi admin ' + departmentLabel(department.name) + '.',
      });
    } catch (caught) {
      setPendingRemove(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal membuang admin.') });
    } finally {
      setRemoveBusy(false);
    }
  }, [load, me?.id, pendingRemove, refreshPermissions, removeBusy]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const adminCount = new Set(assignments.map((row) => row.user_id)).size;
  const removeName = pendingRemove ? profileName(pendingRemove.profile) : '';
  const removeDept = pendingRemove ? departmentLabel(pendingRemove.department.name) : '';

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Urus Admin"
          subtitle={sections.length + ' department · ' + adminCount + ' admin'}
          onBackPress={goBack}
        />

        <View className="gap-4 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {sections.map(({ department, rows }) => {
            const expanded = open === department.id;
            return (
              <View key={department.id} className="rounded-card border border-line bg-surface">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOpen(expanded ? null : department.id)}
                  className="flex-row items-center gap-3 px-card py-3">
                  <Text className="flex-1 text-sm font-bold text-ink" numberOfLines={1}>
                    {departmentLabel(department.name)}
                  </Text>
                  <Badge label={String(rows.length)} tone={rows.length ? 'primary' : 'neutral'} />
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
                </Pressable>

                {expanded ? (
                  <View className="gap-2 border-t border-line px-card pb-card pt-3">
                    {rows.length === 0 ? (
                      <Text className="text-sm text-ink-faint">Belum ada admin.</Text>
                    ) : (
                      rows.map(({ row, profile }) => (
                        <View key={row.id} className="flex-row items-center gap-2">
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                              {profileName(profile)}
                            </Text>
                            <Text className="text-xs text-ink-muted">
                              {row.can_edit ? 'Lihat & Edit' : row.can_view ? 'Lihat sahaja' : 'Tiada akses'}
                            </Text>
                          </View>
                          <IconButton
                            icon="create-outline"
                            accessibilityLabel={'Ubah kebenaran ' + profileName(profile)}
                            onPress={() => openEdit(department, profile, { can_view: row.can_view, can_edit: row.can_edit })}
                          />
                          <IconButton
                            icon="person-remove-outline"
                            tone="danger"
                            accessibilityLabel={'Buang ' + profileName(profile)}
                            onPress={() => askRemove(profile, department)}
                          />
                        </View>
                      ))
                    )}
                    <View className="mt-2">
                      <Button label="Tambah Admin" variant="secondary" onPress={() => openAdd(department)} />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <View className="rounded-card border border-line bg-surface p-card">
            <View className="flex-row items-center gap-3">
              <Text className="flex-1 text-base font-bold text-ink">{COUNSELOR_LABEL}</Text>
              <Badge label={String(counselors.length)} tone={counselors.length ? 'primary' : 'neutral'} />
            </View>
            <View className="mt-3 gap-2">
              {counselors.length === 0 ? (
                <Text className="text-sm text-ink-faint">Belum ada kaunselor aktif.</Text>
              ) : (
                counselors.map((row) => (
                  <Text key={row.id} className="text-sm font-semibold text-ink" numberOfLines={1}>
                    {row.nama_penuh || row.full_name}
                  </Text>
                ))
              )}
            </View>
            <Text className="mt-3 text-xs text-ink-muted">
              Kaunselor dilantik oleh admin Lajnah Kebajikan dan disimpan berasingan daripada admin department.
            </Text>
            <View className="mt-4">
              <Button
                label="Urus Kaunselor"
                variant="secondary"
                onPress={() => router.push('/(app)/admin/kaunselor')}
              />
            </View>
          </View>
        </View>
      </Screen>

      <FormModal
        visible={editor !== null}
        title={editor?.profile ? profileName(editor.profile) : 'Pilih Ahli'}
        description={editor ? departmentLabel(editor.department.name) : undefined}
        dismissable={!saveBusy}
        onClose={() => setEditor(null)}
        footer={
          editor?.profile ? (
            <Button
              label="Simpan"
              loading={saveBusy}
              disabled={saveBusy}
              onPress={() => void submitEditor()}
            />
          ) : undefined
        }>
        {editorNotice ? <Notice tone="negative" message={editorNotice} /> : null}

        {editor && !editor.profile ? (
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
                    subtitle={candidate.email ?? 'Tiada emel'}
                    selected={false}
                    onPress={() => setEditor({ ...editor, profile: candidate })}
                  />
                ))}
              </View>
            )}
          </>
        ) : editor ? (
          <PermissionToggles
            permission={editor.permission}
            onChange={(next) => setEditor({ ...editor, permission: next })}
            disabled={saveBusy}
          />
        ) : null}
      </FormModal>

      <ConfirmDialog
        visible={pendingRemove !== null && removeStep === 1}
        title="Buang admin?"
        message={removeName + ' akan dibuang daripada ' + removeDept + '.'}
        confirmLabel="Teruskan"
        destructive
        onConfirm={() => setRemoveStep(2)}
        onCancel={() => setPendingRemove(null)}
      />
      <ConfirmDialog
        visible={pendingRemove !== null && removeStep === 2}
        title="Pasti buang?"
        message={
          'Pengesahan terakhir: ' + removeName + ' akan hilang akses ' + removeDept + ' dengan serta-merta.'
        }
        confirmLabel="Ya, Buang Admin"
        destructive
        busy={removeBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
