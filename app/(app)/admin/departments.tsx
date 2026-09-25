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
import { Colors } from '@/constants/theme';
import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  setDepartmentActive,
} from '@/lib/admin';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import type { Department } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function DepartmentsScreen() {
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      setDepartments(await fetchDepartments());
      setBanner(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai department.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Tambah department ----------------------------------------------------
  const [addModal, setAddModal] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const openAddModal = useCallback(() => {
    setBanner(null);
    setName('');
    setNameError(null);
    setAddBusy(false);
    setAddModal(true);
  }, []);

  const changeName = useCallback(
    (value: string) => {
      setName(value);
      if (nameError) setNameError(null);
    },
    [nameError],
  );

  const submitAdd = useCallback(async () => {
    if (addBusy) return;

    const value = name.trim();
    if (!value) {
      setNameError('Sila masukkan nama department.');
      return;
    }
    // Nama unik di peringkat pangkalan data — semak awal supaya mesejnya jelas.
    if (departments.some((row) => row.name.toLowerCase() === value.toLowerCase())) {
      setNameError('Department dengan nama ini sudah wujud.');
      return;
    }

    setAddBusy(true);
    try {
      await createDepartment(value);
      setAddModal(false);
      setName('');
      await load();
      setBanner({ tone: 'positive', message: value + ' telah ditambah.' });
    } catch (caught) {
      setNameError(toMalayError(caught, 'Gagal menambah department.'));
    } finally {
      setAddBusy(false);
    }
  }, [addBusy, departments, load, name]);

  // --- Toggle aktif ---------------------------------------------------------
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActive = useCallback(
    async (department: Department, next: boolean) => {
      setBanner(null);
      setTogglingId(department.id);

      // Kemas kini optimistik supaya suis tidak tersekat menunggu rangkaian.
      setDepartments((rows) => rows.map((row) => (row.id === department.id ? { ...row, is_active: next } : row)));

      try {
        await setDepartmentActive(department.id, next);
      } catch (caught) {
        setDepartments((rows) =>
          rows.map((row) => (row.id === department.id ? { ...row, is_active: !next } : row)),
        );
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini status department.') });
      } finally {
        setTogglingId(null);
      }
    },
    [],
  );

  // --- Padam ----------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteDepartment(pendingDelete.id);
      const removed = pendingDelete.name;
      setPendingDelete(null);
      await load();
      setBanner({ tone: 'positive', message: removed + ' telah dipadam.' });
    } catch (caught) {
      setPendingDelete(null);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam department.') });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pendingDelete]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const activeCount = departments.filter((row) => row.is_active).length;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Department"
          subtitle={departments.length + ' department · ' + activeCount + ' aktif'}
          onBackPress={goBack}
        />

        <View className="gap-5 px-gutter pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button label="Tambah Department" onPress={openAddModal} />

          {departments.length === 0 ? (
            <EmptyState
              icon="business-outline"
              title="Tiada department"
              description="Tambah department pertama untuk mula melantik admin."
            />
          ) : (
            <View>
              <SectionTitle
                title="Senarai Department"
                caption="Department nonaktif kekal dalam sistem tetapi tidak boleh dipilih untuk lantikan baharu."
              />
              {/*
                Satu baris setiap department: nama dan status dibaca bersama,
                jadi badge duduk terus di sebelah nama dan bukan di baris kedua.
                Nama yang panjang dibenarkan dua baris dan bukan dipotong —
                beberapa nama lajnah hampir sama di hujungnya.
              */}
              <View className="gap-2">
                {departments.map((department) => (
                  <View
                    key={department.id}
                    className="flex-row items-center gap-3 rounded-card border border-line bg-surface py-2 pl-4 pr-2">
                    <View className="flex-1 flex-row items-center gap-2">
                      <Text className="flex-shrink text-sm font-semibold text-ink" numberOfLines={2}>
                        {department.name}
                      </Text>
                      <View>
                        <Badge
                          label={department.is_active ? 'Aktif' : 'Nonaktif'}
                          tone={department.is_active ? 'positive' : 'neutral'}
                        />
                      </View>
                    </View>

                    <Switch
                      value={department.is_active}
                      onValueChange={(next) => void toggleActive(department, next)}
                      disabled={togglingId === department.id}
                      trackColor={{ false: Colors.line, true: Colors.primaryMid }}
                      thumbColor={Colors.white}
                      ios_backgroundColor={Colors.line}
                      accessibilityLabel={'Status aktif ' + department.name}
                    />

                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      accessibilityLabel={'Padam ' + department.name}
                      onPress={() => setPendingDelete(department)}
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
        title="Tambah Department"
        description="Nama department mesti unik. Department baharu terus aktif."
        dismissable={!addBusy}
        onClose={() => setAddModal(false)}>
        <TextField
          label="Nama department"
          placeholder="Contoh: LAJNAH TARBIAH"
          value={name}
          onChangeText={changeName}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          editable={!addBusy}
          onSubmitEditing={() => void submitAdd()}
          error={nameError}
        />

        <Button label="Simpan Department" loading={addBusy} disabled={addBusy} onPress={() => void submitAdd()} />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam department?"
        message={
          'Anda pasti mahu memadam ' +
          (pendingDelete?.name ?? '') +
          '? Semua lantikan admin pada department ini turut dibuang. Tindakan ini tidak boleh dibatalkan.'
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
