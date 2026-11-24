import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { useMbmAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { addMbmPanel, fetchMbmPanels, removeMbmPanel, type MbmPanel } from '@/lib/mbm-borang';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { generationLabel, type MemberPickerRow } from '@/types/database';

/**
 * Lantik panel MBM. Hanya panel yang dipilih ahli menerima permohonan itu; panel lain tidak
 * nampak. Admin MBM hanya melantik/menyahaktifkan di sini. Pelayan menyemak kebenaran semula.
 */
export default function MbmPanelUrusScreen() {
  const goBack = useGoBack();
  const access = useMbmAccess();

  const [panels, setPanels] = useState<MbmPanel[] | null>(null);
  const [candidates, setCandidates] = useState<MemberPickerRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<MbmPanel | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, members] = await Promise.all([fetchMbmPanels(), fetchMembersForPicker()]);
      setPanels(list.filter((panel) => panel.aktif));
      setCandidates(members);
      setError(null);
    } catch (caught) {
      setPanels((prev) => prev ?? []);
      setError(toMalayError(caught, 'Gagal memuatkan senarai panel.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (access.loading || !access.canView) return;
      void load();
    }, [access.loading, access.canView, load]),
  );

  const add = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addMbmPanel(selected);
      setSelected(null);
      await load();
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal melantik panel.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!toRemove || busy) return;
    setBusy(true);
    try {
      await removeMbmPanel(toRemove.id);
      setToRemove(null);
      await load();
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menyahaktifkan panel.'));
      setToRemove(null);
    } finally {
      setBusy(false);
    }
  };

  if (access.loading || (access.canView && panels === null)) return <LoadingScreen />;
  if (!access.canView) {
    return <NoAccessScreen title="Lantik Panel MBM" description="Khusus untuk admin MBM dan Super Admin." />;
  }

  const activeIds = new Set((panels ?? []).filter((panel) => panel.aktif).map((panel) => panel.member_id));
  const available = (candidates ?? []).filter((member) => !activeIds.has(member.id));

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Majlis Baitul Muslim (MBM)"
        title="Lantik Panel"
        subtitle="Butiran permohonan hanya untuk panel; admin nampak bilangan sahaja"
        onBackPress={goBack}
      />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {access.canEdit ? (
          <View className="gap-3 rounded-field border border-line bg-surface p-4">
            <MemberPickerField
              label="Lantik ahli sebagai panel"
              value={selected}
              candidates={available}
              onChange={setSelected}
              disabled={busy || candidates === null}
            />
            <Button label="Lantik Panel" loading={busy} disabled={!selected || busy} onPress={() => void add()} />
          </View>
        ) : null}

        {(panels ?? []).length === 0 ? (
          <EmptyState icon="people-outline" title="Belum ada panel" description="Lantik ahli supaya senarai panel muncul pada borang ahli." />
        ) : (
          <View className="gap-2">
            {(panels ?? []).map((panel) => (
              <View key={panel.id} className="flex-row items-center gap-2 rounded-field border border-line bg-surface px-3 py-2.5">
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-sm font-bold text-ink">
                    {panel.nama}
                    {panel.generasi ? '  ·  ' + generationLabel(panel.generasi) : ''}
                  </Text>
                  <Text className="text-xs text-ink-muted">
                    {panel.jumlah + ' permohonan'}
                  </Text>
                </View>
                {access.canEdit && panel.aktif ? (
                  <Button label="Nyahaktif" variant="secondary" size="sm" disabled={busy} onPress={() => setToRemove(panel)} />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <ConfirmDialog
        visible={toRemove !== null}
        title="Nyahaktifkan panel?"
        message={
          toRemove
            ? toRemove.nama +
              ' tidak lagi dipaparkan kepada ahli dan kehilangan akses kepada permohonannya. Permohonan sedia ada kekal dalam senarai admin MBM.'
            : ''
        }
        confirmLabel="Nyahaktif"
        destructive
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setToRemove(null)}
      />
    </Screen>
  );
}
