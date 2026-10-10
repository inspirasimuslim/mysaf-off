import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
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
import { useUsrahKawasanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import {
  addKumpulanUsrahNaqib,
  deleteKumpulanUsrah,
  fetchKumpulanUsrahOverview,
  removeKumpulanUsrahMember,
  removeKumpulanUsrahNaqib,
  renameKumpulanUsrah,
  setKumpulanUsrahMember,
} from '@/lib/kumpulan-usrah';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { generationLabel, kawasanUsrahLabel, type KumpulanUsrahOverview, type MemberPickerRow } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;
const NAQIB_CAP = 2;

/** Butiran satu Kumpulan Usrah — tambah/buang ahli, lantik/buang naqib, sunting nama, padam kumpulan. */
export default function KumpulanUsrahDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading: accessLoading, canView, canEdit } = useUsrahKawasanAccess();

  const [all, setAll] = useState<KumpulanUsrahOverview[]>([]);
  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const [overview, picker] = await Promise.all([fetchKumpulanUsrahOverview(), fetchMembersForPicker()]);
      setAll(overview);
      setCandidates(picker);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan butiran kumpulan.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  const kumpulan = useMemo(() => all.find((row) => row.id === id) ?? null, [all, id]);

  // --- Nama -------------------------------------------------------------------
  const [namaDraft, setNamaDraft] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const nama = namaDraft ?? kumpulan?.nama ?? '';

  const saveNama = useCallback(async () => {
    if (!kumpulan || renameBusy || nama.trim().length < 1 || nama.trim() === kumpulan.nama) return;
    setRenameBusy(true);
    try {
      await renameKumpulanUsrah(kumpulan.id, nama);
      setNamaDraft(null);
      await load();
      setBanner({ tone: 'positive', message: 'Nama kumpulan dikemas kini.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal mengemas kini nama.') });
    } finally {
      setRenameBusy(false);
    }
  }, [kumpulan, nama, renameBusy, load]);

  // --- Padam kumpulan -----------------------------------------------------------
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!kumpulan || deleting) return;
    setDeleting(true);
    try {
      await deleteKumpulanUsrah(kumpulan.id);
      router.replace('/(app)/admin/kumpulan-usrah');
    } catch (caught) {
      setConfirmingDelete(false);
      setDeleting(false);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam kumpulan.') });
    }
  }, [kumpulan, deleting, router]);

  // --- Naqib ---------------------------------------------------------------------
  const [pickingNaqib, setPickingNaqib] = useState(false);
  const [naqibSearch, setNaqibSearch] = useState('');
  const [naqibBusy, setNaqibBusy] = useState(false);
  const [pendingRemoveNaqib, setPendingRemoveNaqib] = useState<{ id: string; full_name: string } | null>(null);

  const naqibCandidates = useMemo(() => {
    if (!kumpulan) return [];
    const term = naqibSearch.trim().toLowerCase();
    const existingIds = new Set(kumpulan.naqib.map((n) => n.member_id));
    return candidates
      .filter((row) => !existingIds.has(row.id))
      .filter((row) => !term || row.full_name.toLowerCase().includes(term))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' }));
  }, [candidates, kumpulan, naqibSearch]);

  const pickNaqib = useCallback(
    async (candidate: MemberPickerRow) => {
      if (!kumpulan || naqibBusy) return;
      setNaqibBusy(true);
      try {
        await addKumpulanUsrahNaqib(kumpulan.id, candidate.id);
        setPickingNaqib(false);
        await load();
        setBanner({ tone: 'positive', message: candidate.full_name + ' dilantik sebagai naqib.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal melantik naqib.') });
      } finally {
        setNaqibBusy(false);
      }
    },
    [kumpulan, naqibBusy, load],
  );

  const confirmRemoveNaqib = useCallback(async () => {
    if (!pendingRemoveNaqib || naqibBusy) return;
    const target = pendingRemoveNaqib;
    setNaqibBusy(true);
    try {
      await removeKumpulanUsrahNaqib(target.id);
      setPendingRemoveNaqib(null);
      await load();
      setBanner({ tone: 'positive', message: target.full_name + ' bukan lagi naqib kumpulan ini.' });
    } catch (caught) {
      setPendingRemoveNaqib(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang naqib.') });
    } finally {
      setNaqibBusy(false);
    }
  }, [pendingRemoveNaqib, naqibBusy, load]);

  // --- Ahli ------------------------------------------------------------------------
  const [pickingAhli, setPickingAhli] = useState(false);
  const [ahliSearch, setAhliSearch] = useState('');
  const [ahliBusy, setAhliBusy] = useState(false);
  const [pendingRemoveAhli, setPendingRemoveAhli] = useState<{ id: string; full_name: string } | null>(null);

  const ahliCandidates = useMemo(() => {
    if (!kumpulan) return [];
    const term = ahliSearch.trim().toLowerCase();
    const existingIds = new Set(kumpulan.ahli.map((a) => a.member_id));
    return candidates
      .filter((row) => !existingIds.has(row.id))
      .filter((row) => !term || row.full_name.toLowerCase().includes(term))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' }));
  }, [candidates, kumpulan, ahliSearch]);

  const pickAhli = useCallback(
    async (candidate: MemberPickerRow) => {
      if (!kumpulan || ahliBusy) return;
      setAhliBusy(true);
      try {
        await setKumpulanUsrahMember(kumpulan.id, candidate.id);
        setPickingAhli(false);
        await load();
        setBanner({ tone: 'positive', message: candidate.full_name + ' ditambah ke kumpulan ini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menambah ahli.') });
      } finally {
        setAhliBusy(false);
      }
    },
    [kumpulan, ahliBusy, load],
  );

  const confirmRemoveAhli = useCallback(async () => {
    if (!pendingRemoveAhli || ahliBusy) return;
    const target = pendingRemoveAhli;
    setAhliBusy(true);
    try {
      await removeKumpulanUsrahMember(target.id);
      setPendingRemoveAhli(null);
      await load();
      setBanner({ tone: 'positive', message: target.full_name + ' dibuang daripada kumpulan ini.' });
    } catch (caught) {
      setPendingRemoveAhli(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang ahli.') });
    } finally {
      setAhliBusy(false);
    }
  }, [pendingRemoveAhli, ahliBusy, load]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kumpulan Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState icon="lock-closed-outline" title="Tiada akses" description="Memerlukan kebenaran LAJNAH TARBIAH." />
        </View>
      </Screen>
    );
  }

  if (!kumpulan) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kumpulan Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState icon="people-outline" title="Kumpulan tidak dijumpai" description="Kumpulan ini mungkin telah dipadam." />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow={kawasanUsrahLabel(kumpulan.kawasan_usrah)}
          title={kumpulan.nama}
          subtitle={kumpulan.ahli.length + ' ahli · ' + kumpulan.naqib.length + ' naqib'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pb-8 pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {canEdit ? (
            <View>
              <SectionTitle title="Nama Kumpulan" />
              <View className="flex-row items-end gap-3">
                <View className="flex-1">
                  <TextField label="Nama" value={nama} onChangeText={setNamaDraft} editable={!renameBusy} />
                </View>
                <Button
                  label="Simpan"
                  size="sm"
                  variant="secondary"
                  onPress={() => void saveNama()}
                  loading={renameBusy}
                  disabled={nama.trim().length < 1 || nama.trim() === kumpulan.nama}
                />
              </View>
            </View>
          ) : null}

          <View>
            <SectionTitle title="Naqib" caption={'Had maksimum ' + NAQIB_CAP + ' naqib setiap kumpulan.'} />
            {kumpulan.naqib.length === 0 ? (
              <EmptyState icon="person-outline" title="Belum ada naqib" description="Lantik seorang ahli sebagai naqib kumpulan ini." />
            ) : (
              <View className="gap-2">
                {kumpulan.naqib.map((n) => (
                  <View key={n.id} className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{n.full_name}</Text>
                      {n.generasi ? <Text className="text-xs text-ink-muted">{generationLabel(n.generasi)}</Text> : null}
                    </View>
                    {canEdit ? (
                      <IconButton
                        icon="person-remove-outline"
                        tone="danger"
                        accessibilityLabel={'Buang ' + n.full_name + ' sebagai naqib'}
                        onPress={() => setPendingRemoveNaqib({ id: n.id, full_name: n.full_name })}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            )}
            {canEdit ? (
              kumpulan.naqib.length >= NAQIB_CAP ? (
                <View className="pt-3">
                  <Notice tone="info" message="Kumpulan ini sudah mencapai had maksimum naqib." />
                </View>
              ) : (
                <View className="pt-3">
                  <Button
                    label="+ Lantik Naqib"
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setBanner(null);
                      setNaqibSearch('');
                      setPickingNaqib(true);
                    }}
                  />
                </View>
              )
            ) : null}
          </View>

          <View>
            <SectionTitle title="Ahli" caption={kumpulan.ahli.length + ' ahli dalam kumpulan ini.'} />
            {kumpulan.ahli.length === 0 ? (
              <EmptyState icon="people-outline" title="Belum ada ahli" description="Tambah ahli ke kumpulan ini." />
            ) : (
              <View className="gap-2">
                {kumpulan.ahli.map((a) => (
                  <View key={a.id} className="flex-row items-center gap-3 rounded-field border border-line bg-surface p-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{a.full_name}</Text>
                      {a.generasi ? <Text className="text-xs text-ink-muted">{generationLabel(a.generasi)}</Text> : null}
                    </View>
                    {canEdit ? (
                      <IconButton
                        icon="person-remove-outline"
                        tone="danger"
                        accessibilityLabel={'Buang ' + a.full_name + ' daripada kumpulan'}
                        onPress={() => setPendingRemoveAhli({ id: a.id, full_name: a.full_name })}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            )}
            {canEdit ? (
              <View className="pt-3">
                <Button
                  label="+ Tambah Ahli"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setBanner(null);
                    setAhliSearch('');
                    setPickingAhli(true);
                  }}
                />
              </View>
            ) : null}
          </View>

          {canEdit ? (
            <View className="gap-3 border-t border-line pt-5">
              <Button label="Padam Kumpulan" variant="danger" onPress={() => setConfirmingDelete(true)} />
            </View>
          ) : null}
        </View>
      </Screen>

      <FormModal
        visible={pickingNaqib}
        title="Lantik Naqib"
        description="Pilih seorang ahli untuk dilantik sebagai naqib kumpulan ini."
        dismissable={!naqibBusy}
        onClose={() => setPickingNaqib(false)}>
        <TextField label="Cari ahli" placeholder="Nama ahli" value={naqibSearch} onChangeText={setNaqibSearch} autoCapitalize="none" autoCorrect={false} topAnchored />
        {naqibCandidates.length === 0 ? (
          <Text className="py-6 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
        ) : (
          <View className="gap-3">
            {naqibCandidates.map((candidate) => (
              <SelectRow
                key={candidate.id}
                title={candidate.full_name}
                subtitle={candidate.generasi ? generationLabel(candidate.generasi) : undefined}
                selected={false}
                disabled={naqibBusy}
                onPress={() => void pickNaqib(candidate)}
              />
            ))}
          </View>
        )}
      </FormModal>

      <FormModal
        visible={pickingAhli}
        title="Tambah Ahli"
        description="Pilih seorang ahli untuk ditambah ke kumpulan ini. Ahli yang sudah dalam kumpulan lain akan dipindahkan."
        dismissable={!ahliBusy}
        onClose={() => setPickingAhli(false)}>
        <TextField label="Cari ahli" placeholder="Nama ahli" value={ahliSearch} onChangeText={setAhliSearch} autoCapitalize="none" autoCorrect={false} topAnchored />
        {ahliCandidates.length === 0 ? (
          <Text className="py-6 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
        ) : (
          <View className="gap-3">
            {ahliCandidates.map((candidate) => (
              <SelectRow
                key={candidate.id}
                title={candidate.full_name}
                subtitle={candidate.generasi ? generationLabel(candidate.generasi) : undefined}
                selected={false}
                disabled={ahliBusy}
                onPress={() => void pickAhli(candidate)}
              />
            ))}
          </View>
        )}
      </FormModal>

      <ConfirmDialog
        visible={pendingRemoveNaqib !== null}
        title="Buang naqib?"
        message={(pendingRemoveNaqib?.full_name ?? '') + ' tidak lagi menjadi naqib kumpulan ini.'}
        confirmLabel="Buang Naqib"
        destructive
        busy={naqibBusy}
        onConfirm={() => void confirmRemoveNaqib()}
        onCancel={() => setPendingRemoveNaqib(null)}
      />

      <ConfirmDialog
        visible={pendingRemoveAhli !== null}
        title="Buang ahli?"
        message={(pendingRemoveAhli?.full_name ?? '') + ' akan dibuang daripada kumpulan ini.'}
        confirmLabel="Buang Ahli"
        destructive
        busy={ahliBusy}
        onConfirm={() => void confirmRemoveAhli()}
        onCancel={() => setPendingRemoveAhli(null)}
      />

      <ConfirmDialog
        visible={confirmingDelete}
        title="Padam kumpulan ini?"
        message={'Kumpulan "' + kumpulan.nama + '" akan dipadam kekal. Ahli dan naqibnya tidak dipadam, cuma dibuang daripada kumpulan ini.'}
        confirmLabel="Padam"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
