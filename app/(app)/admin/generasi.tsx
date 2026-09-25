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
import { toMalayError } from '@/lib/errors';
import { createGeneration, deleteGeneration, fetchGenerations, setGenerationActive } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { generationOrder, type Generation } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Kod generasi ialah 'i' diikuti dua digit — bentuk yang dirujuk `members.generasi`. */
const CODE_PATTERN = /^i\d{2}$/i;

export default function GenerasiScreen() {
  const goBack = useGoBack();
  const { isSuperAdmin } = usePermissions();

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchGenerations();
      setGenerations([...rows].sort((a, b) => generationOrder(a.code) - generationOrder(b.code)));
      setBanner(null);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan senarai generasi.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Tambah generasi ------------------------------------------------------
  const [addModal, setAddModal] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const openAddModal = useCallback(() => {
    setBanner(null);
    setCode('');
    setLabel('');
    setCodeError(null);
    setAddBusy(false);
    setAddModal(true);
  }, []);

  const changeCode = useCallback(
    (value: string) => {
      setCode(value);
      if (codeError) setCodeError(null);
    },
    [codeError],
  );

  const submitAdd = useCallback(async () => {
    if (addBusy) return;

    const value = code.trim().toLowerCase();
    if (!value) {
      setCodeError('Sila masukkan kod generasi.');
      return;
    }
    if (!CODE_PATTERN.test(value)) {
      setCodeError('Kod mesti berbentuk i01 hingga i99.');
      return;
    }
    // Kod unik di peringkat pangkalan data — semak awal supaya mesejnya jelas.
    if (generations.some((row) => row.code.toLowerCase() === value)) {
      setCodeError('Generasi dengan kod ini sudah wujud.');
      return;
    }

    // Label mengikut corak sedia ada ('Ikhwan 07') bila admin tidak menaipnya.
    const name = label.trim() || 'Ikhwan ' + value.slice(1);

    setAddBusy(true);
    try {
      await createGeneration(value, name);
      setAddModal(false);
      setCode('');
      setLabel('');
      await load();
      setBanner({ tone: 'positive', message: name + ' telah ditambah.' });
    } catch (caught) {
      setCodeError(toMalayError(caught, 'Gagal menambah generasi.'));
    } finally {
      setAddBusy(false);
    }
  }, [addBusy, code, generations, label, load]);

  // --- Toggle aktif ---------------------------------------------------------
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActive = useCallback(async (generation: Generation, next: boolean) => {
    setBanner(null);
    setTogglingId(generation.id);

    // Kemas kini optimistik supaya suis tidak tersekat menunggu rangkaian.
    setGenerations((rows) => rows.map((row) => (row.id === generation.id ? { ...row, is_active: next } : row)));

    try {
      await setGenerationActive(generation.id, next);
    } catch (caught) {
      setGenerations((rows) => rows.map((row) => (row.id === generation.id ? { ...row, is_active: !next } : row)));
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mengemas kini status generasi.') });
    } finally {
      setTogglingId(null);
    }
  }, []);

  // --- Padam ----------------------------------------------------------------
  const [pendingDelete, setPendingDelete] = useState<Generation | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteGeneration(pendingDelete.id);
      const removed = pendingDelete.label;
      setPendingDelete(null);
      await load();
      setBanner({ tone: 'positive', message: removed + ' telah dipadam.' });
    } catch (caught) {
      setPendingDelete(null);
      /*
        `members.generasi` merujuk `generations.code` dengan `on delete
        restrict`, jadi pangkalan data menolak pemadaman generasi yang masih
        digunakan. Ralat kekangan itu ditukar kepada sebab yang boleh difahami.
      */
      const raw = caught instanceof Error ? caught.message : '';
      const inUse = /foreign key|violates|restrict/i.test(raw);
      setBanner({
        tone: 'negative',
        message: inUse
          ? 'Generasi ini masih digunakan oleh rekod ahli. Pindahkan ahli itu ke generasi lain dahulu, atau tetapkan generasi ini sebagai nonaktif.'
          : toMalayError(caught, 'Gagal memadam generasi.'),
      });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, load, pendingDelete]);

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccessScreen title="Panel Super Admin" description={SUPER_ADMIN_ONLY} />;

  const activeCount = generations.filter((row) => row.is_active).length;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Super Admin"
          title="Generasi"
          subtitle={generations.length + ' generasi · ' + activeCount + ' aktif'}
          onBackPress={goBack}
        />

        <View className="gap-5 px-gutter pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button label="Tambah Generasi" onPress={openAddModal} />

          {generations.length === 0 ? (
            <EmptyState
              icon="layers-outline"
              title="Tiada generasi"
              description="Tambah generasi pertama sebelum merekod ahli."
            />
          ) : (
            <View>
              <SectionTitle
                title="Senarai Generasi"
                caption="Generasi nonaktif kekal pada rekod sedia ada tetapi tidak boleh dipilih untuk ahli baharu."
              />
              {/*
                Satu baris setiap generasi. Kod ('i01') tidak dipapar: label
                sudah membawa nombor yang sama, dan kod hanya perlu wujud dalam
                data sebagai kunci `members.generasi`.
              */}
              <View className="gap-2">
                {generations.map((generation) => (
                  <View
                    key={generation.id}
                    className="flex-row items-center gap-3 rounded-card border border-line bg-surface py-2 pl-4 pr-2">
                    <View className="flex-1 flex-row items-center gap-2">
                      <Text className="flex-shrink text-base font-semibold text-ink" numberOfLines={1}>
                        {generation.label}
                      </Text>
                      <View>
                        <Badge
                          label={generation.is_active ? 'Aktif' : 'Nonaktif'}
                          tone={generation.is_active ? 'positive' : 'neutral'}
                        />
                      </View>
                    </View>

                    <Switch
                      value={generation.is_active}
                      onValueChange={(next) => void toggleActive(generation, next)}
                      disabled={togglingId === generation.id}
                      trackColor={{ false: Colors.line, true: Colors.primaryMid }}
                      thumbColor={Colors.white}
                      ios_backgroundColor={Colors.line}
                      accessibilityLabel={'Status aktif ' + generation.label}
                    />

                    <IconButton
                      icon="trash-outline"
                      tone="danger"
                      accessibilityLabel={'Padam ' + generation.label}
                      onPress={() => setPendingDelete(generation)}
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
        title="Tambah Generasi"
        description="Kod mesti berbentuk i01 hingga i99 dan unik. Generasi baharu terus aktif."
        dismissable={!addBusy}
        onClose={() => setAddModal(false)}>
        <TextField
          label="Kod generasi"
          placeholder="Contoh: i28"
          value={code}
          onChangeText={changeCode}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!addBusy}
          error={codeError}
        />

        <TextField
          label="Nama paparan (pilihan)"
          placeholder="Contoh: Ikhwan 28"
          value={label}
          onChangeText={setLabel}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="go"
          editable={!addBusy}
          onSubmitEditing={() => void submitAdd()}
        />

        <Button label="Simpan Generasi" loading={addBusy} disabled={addBusy} onPress={() => void submitAdd()} />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam generasi?"
        message={
          'Anda pasti mahu memadam ' +
          (pendingDelete?.label ?? '') +
          '? Generasi yang masih digunakan oleh rekod ahli tidak boleh dipadam.'
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
