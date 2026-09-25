import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useIsDesktop } from '@/lib/use-desktop';
import { assignNaqib, fetchActiveNaqibList, removeNaqib } from '@/lib/perkaderan';
import { generationLabel, type MemberPickerRow, type NaqibAssignmentWithMember } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function NaqibAssignmentsScreen() {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const { loading: accessLoading, canEdit } = usePerkaderanAccess();

  const [naqibs, setNaqibs] = useState<NaqibAssignmentWithMember[]>([]);
  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      const [nextNaqibs, nextCandidates] = await Promise.all([fetchActiveNaqibList(), fetchMembersForPicker()]);
      setNaqibs(nextNaqibs);
      setCandidates(nextCandidates);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai naqib.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canEdit) return;
      void load();
    }, [accessLoading, canEdit, load]),
  );

  // --- Lantik naqib baharu -----------------------------------------------
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const naqibMemberIds = useMemo(() => new Set(naqibs.map((row) => row.member_id)), [naqibs]);

  const pickerCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates
      .filter((row) => !naqibMemberIds.has(row.id))
      .filter((row) => !term || row.full_name.toLowerCase().includes(term))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' }));
  }, [candidates, naqibMemberIds, search]);

  const openPicker = useCallback(() => {
    setBanner(null);
    setSearch('');
    setPicking(true);
  }, []);

  const pick = useCallback(
    async (candidate: MemberPickerRow) => {
      if (assignBusy) return;
      setAssignBusy(true);
      try {
        await assignNaqib(candidate.id);
        setPicking(false);
        await load();
        setBanner({ tone: 'positive', message: candidate.full_name + ' telah dilantik sebagai naqib.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal melantik naqib.') });
      } finally {
        setAssignBusy(false);
      }
    },
    [assignBusy, load],
  );

  // --- Buang naqib ---------------------------------------------------------
  const [pendingRemove, setPendingRemove] = useState<NaqibAssignmentWithMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const confirmRemove = useCallback(async () => {
    if (!pendingRemove || removeBusy) return;

    const target = pendingRemove;
    setRemoveBusy(true);
    try {
      await removeNaqib(target.id);
      setPendingRemove(null);
      await load();
      setBanner({ tone: 'positive', message: target.member_full_name + ' bukan lagi naqib aktif.' });
    } catch (caught) {
      setPendingRemove(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang naqib.') });
    } finally {
      setRemoveBusy(false);
    }
  }, [load, pendingRemove, removeBusy]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Naqib/Naqibah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Lantikan naqib memerlukan kebenaran EDIT pada department LAJNAH PERKADERAN."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false} wide>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Naqib/Naqibah"
          subtitle={naqibs.length + ' naqib aktif'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          <Button label="+ Lantik Naqib Baharu" onPress={openPicker} />

          {naqibs.length === 0 ? (
            <EmptyState
              icon="school-outline"
              title="Tiada naqib lagi"
              description="Lantik ahli sebagai naqib untuk mengendalikan kumpulan usrah sekolah."
            />
          ) : (
            <View>
              <SectionTitle title="Senarai Naqib" caption="Setiap naqib mengendalikan kumpulan usrah sekolahnya sendiri." />
              {desktop ? (
                <DataTable
                  rows={naqibs}
                  keyOf={(n) => n.id}
                  actionsWidth={56}
                  columns={[
                    { key: 'nama', header: 'Nama', flex: 2, render: (n) => <CellText strong>{n.member_full_name}</CellText> },
                    {
                      key: 'gen',
                      header: 'Generasi',
                      flex: 1,
                      render: (n) => <CellText muted>{n.member_generasi ? generationLabel(n.member_generasi) : 'Tiada generasi'}</CellText>,
                    },
                  ]}
                  actions={(n) => (
                    <RowIconAction
                      icon="person-remove-outline"
                      destructive
                      label={'Buang ' + n.member_full_name + ' sebagai naqib'}
                      onPress={() => setPendingRemove(n)}
                    />
                  )}
                />
              ) : (
              <View className="gap-3">
                {naqibs.map((naqib) => (
                  <View
                    key={naqib.id}
                    className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{naqib.member_full_name}</Text>
                      <Text className="mt-0.5 text-sm text-ink-muted">
                        {naqib.member_generasi ? generationLabel(naqib.member_generasi) : 'Tiada generasi'}
                      </Text>
                    </View>
                    <IconButton
                      icon="person-remove-outline"
                      tone="danger"
                      accessibilityLabel={'Buang ' + naqib.member_full_name + ' sebagai naqib'}
                      onPress={() => setPendingRemove(naqib)}
                    />
                  </View>
                ))}
              </View>
              )}
            </View>
          )}
        </View>
      </Screen>

      <FormModal
        visible={picking}
        title="Lantik Naqib Baharu"
        description="Pilih seorang ahli untuk dilantik sebagai naqib/naqibah."
        dismissable={!assignBusy}
        onClose={() => setPicking(false)}>
        <TextField
          label="Cari ahli"
          placeholder="Nama ahli"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {pickerCandidates.length === 0 ? (
          <Text className="py-6 text-center text-sm text-ink-muted">Tiada ahli sepadan.</Text>
        ) : (
          <View className="gap-3">
            {pickerCandidates.map((candidate) => (
              <SelectRow
                key={candidate.id}
                title={candidate.full_name}
                subtitle={candidate.generasi ? generationLabel(candidate.generasi) : undefined}
                selected={false}
                disabled={assignBusy}
                onPress={() => void pick(candidate)}
              />
            ))}
          </View>
        )}
      </FormModal>

      <ConfirmDialog
        visible={pendingRemove !== null}
        title="Buang naqib?"
        message={
          (pendingRemove?.member_full_name ?? '') +
          ' tidak lagi boleh mengendalikan kumpulan usrahnya. Kumpulan, mad\'u dan sejarah sesi yang sedia ada KEKAL wujud.'
        }
        confirmLabel="Buang Naqib"
        destructive
        busy={removeBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
