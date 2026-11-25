import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CellText, DataTable, RowIconAction } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { PickerField } from '@/components/ui/picker-field';
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
import {
  addSekolah,
  assignNaqib,
  assignSlot,
  fetchActiveNaqibList,
  fetchSekolahList,
  fetchSlots,
  removeNaqib,
  removeSekolah,
  type PerkaderanSekolah,
  type PerkaderanSlot,
} from '@/lib/perkaderan';
import { generationLabel, TINGKATAN_OPTIONS, type MemberPickerRow, type NaqibAssignmentWithMember } from '@/types/database';

const NO_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: 'Kumpulan ' + (i + 1) }));

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


  // --- Struktur kumpulan: sekolah > tingkatan > kumpulan > naqib -----------------
  const [sekolahList, setSekolahList] = useState<PerkaderanSekolah[]>([]);
  const [sekolah, setSekolah] = useState<string | null>(null);
  const [tingkatan, setTingkatan] = useState<string | null>('Tingkatan 3');
  const [noKump, setNoKump] = useState<string | null>('1');
  const [naqibId, setNaqibId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [naqib3Id, setNaqib3Id] = useState<string | null>(null);
  const [naqib4Id, setNaqib4Id] = useState<string | null>(null);
  const [slots, setSlots] = useState<PerkaderanSlot[]>([]);
  const [slotBusy, setSlotBusy] = useState(false);
  const [managingSekolah, setManagingSekolah] = useState(false);
  const [newSekolah, setNewSekolah] = useState('');
  const [sekolahBusy, setSekolahBusy] = useState(false);

  const loadSekolah = useCallback(async () => {
    try {
      const list = await fetchSekolahList();
      setSekolahList(list);
      setSekolah((current) => (current && list.some((x) => x.nama === current) ? current : (list[0]?.nama ?? null)));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai sekolah.') });
    }
  }, []);

  const loadSlots = useCallback(async (nama: string | null) => {
    if (!nama) return setSlots([]);
    try {
      setSlots(await fetchSlots(nama));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan kumpulan.') });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canEdit) return;
      void loadSekolah();
    }, [accessLoading, canEdit, loadSekolah]),
  );
  useEffect(() => {
    void loadSlots(sekolah);
  }, [loadSlots, sekolah]);

  const currentSlot = useMemo(
    () => slots.find((x) => x.tingkatan === tingkatan && String(x.no_kumpulan) === noKump) ?? null,
    [slots, tingkatan, noKump],
  );

  // Papar siapa pemegang slot pada senarai nombor kumpulan; isi semula pilihan naqib bila slot sudah ada.
  const noOptions = useMemo(
    () =>
      NO_OPTIONS.map((o) => {
        const taken = slots.find((x) => x.tingkatan === tingkatan && String(x.no_kumpulan) === o.value);
        return taken ? { ...o, label: o.label + ' — ' + taken.naqib_nama } : o;
      }),
    [slots, tingkatan],
  );
  useEffect(() => {
    setNaqibId(currentSlot?.naqib_id ?? null);
    setPartnerId(currentSlot?.partner_id ?? null);
    setNaqib3Id(currentSlot?.tambahan_ids?.[0] ?? null);
    setNaqib4Id(currentSlot?.tambahan_ids?.[1] ?? null);
  }, [currentSlot]);

  const submitSlot = useCallback(async () => {
    if (!sekolah || !tingkatan || !noKump || !naqibId || slotBusy) return;
    setSlotBusy(true);
    setBanner(null);
    try {
      await assignSlot({ sekolah, tingkatan, no: Number(noKump), naqibId, partnerId, tambahanIds: [naqib3Id, naqib4Id].filter((x): x is string => Boolean(x)) });
      const fresh = await fetchSlots(sekolah);
      setSlots(fresh);
      await load();
      setBanner({
        tone: 'positive',
        message: (currentSlot ? 'Naqib kumpulan ' : 'Naqib dilantik untuk kumpulan ') + noKump + ' (' + tingkatan + ', ' + sekolah + ').',
      });
      // Lompat ke kumpulan kosong seterusnya dalam tingkatan yang sama.
      const next = NO_OPTIONS.find((o) => !fresh.some((x) => x.tingkatan === tingkatan && String(x.no_kumpulan) === o.value));
      if (next) setNoKump(next.value);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal melantik naqib.') });
    } finally {
      setSlotBusy(false);
    }
  }, [currentSlot, load, naqib3Id, naqib4Id, naqibId, noKump, partnerId, sekolah, slotBusy, tingkatan]);

  const submitSekolah = useCallback(async () => {
    const nama = newSekolah.trim();
    if (nama.length < 2 || sekolahBusy) return;
    setSekolahBusy(true);
    try {
      await addSekolah(nama);
      setNewSekolah('');
      await loadSekolah();
      setSekolah(nama);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menambah sekolah. Nama mungkin sudah wujud.') });
    } finally {
      setSekolahBusy(false);
    }
  }, [loadSekolah, newSekolah, sekolahBusy]);

  const dropSekolah = useCallback(
    async (row: PerkaderanSekolah) => {
      if (sekolahBusy) return;
      setSekolahBusy(true);
      try {
        await removeSekolah(row.id);
        await loadSekolah();
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang sekolah.') });
      } finally {
        setSekolahBusy(false);
      }
    },
    [loadSekolah, sekolahBusy],
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

          <View className="gap-3 rounded-card border border-line bg-surface p-card">
            <SectionTitle title="Lantik Naqib ikut Kumpulan" caption="Pilih sekolah, tingkatan dan kumpulan, kemudian lantik naqib. Ulang untuk kumpulan seterusnya." />
            <PickerField
              label="Sekolah"
              value={sekolah}
              options={sekolahList.map((x) => ({ value: x.nama, label: x.nama }))}
              onChange={setSekolah}
              clearable={false}
              disabled={slotBusy}
            />
            <Button label="Urus Senarai Sekolah" variant="secondary" onPress={() => setManagingSekolah(true)} />
            <PickerField label="Tingkatan" value={tingkatan} options={TINGKATAN_OPTIONS} onChange={setTingkatan} clearable={false} disabled={slotBusy} />
            <PickerField label="Kumpulan" value={noKump} options={noOptions} onChange={setNoKump} clearable={false} disabled={slotBusy} />
            <MemberPickerField
              label="Naqib/Naqibah"
              value={naqibId}
              candidates={candidates}
              onChange={setNaqibId}
              placeholder="Pilih naqib"
              disabled={slotBusy}
            />
            <MemberPickerField
              label="Naqib kedua (setaraf, pilihan)"
              value={partnerId}
              candidates={candidates}
              onChange={setPartnerId}
              placeholder="Tiada"
              disabled={slotBusy}
            />
            <MemberPickerField
              label="Naqib ketiga (setaraf, pilihan)"
              value={naqib3Id}
              candidates={candidates}
              onChange={setNaqib3Id}
              placeholder="Tiada"
              disabled={slotBusy}
            />
            <MemberPickerField
              label="Naqib keempat (setaraf, pilihan)"
              value={naqib4Id}
              candidates={candidates}
              onChange={setNaqib4Id}
              placeholder="Tiada"
              disabled={slotBusy}
            />
            <Button
              label={currentSlot ? 'Tukar Naqib Kumpulan Ini' : 'Lantik Naqib'}
              loading={slotBusy}
              disabled={slotBusy || !sekolah || !naqibId}
              onPress={() => void submitSlot()}
            />
            {slots.length > 0 ? (
              <View className="mt-2 gap-2">
                <Text className="text-sm font-semibold text-ink">Kumpulan dalam {sekolah}</Text>
                {slots.map((x) => (
                  <Pressable
                    key={x.group_id}
                    accessibilityRole="button"
                    onPress={() => {
                      setTingkatan(x.tingkatan);
                      setNoKump(String(x.no_kumpulan));
                    }}
                    className="rounded-card border border-line p-3">
                    <Text className="text-sm font-semibold text-ink">
                      {x.tingkatan} · Kumpulan {x.no_kumpulan}
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      {x.naqib_nama}
                      {x.partner_nama ? ' & ' + x.partner_nama : ''}
                      {x.tambahan_nama ? ' & ' + x.tambahan_nama : ''} · {x.madu} mad'u
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Button label="+ Lantik Naqib (tanpa kumpulan)" variant="secondary" onPress={openPicker} />

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
        visible={managingSekolah}
        title="Senarai Sekolah"
        description="Tambah sekolah baharu atau buang yang tidak digunakan. Sekolah yang masih ada kumpulan aktif tidak boleh dibuang."
        dismissable={!sekolahBusy}
        onClose={() => setManagingSekolah(false)}>
        <TextField label="Nama sekolah baharu" value={newSekolah} onChangeText={setNewSekolah} autoCapitalize="characters" editable={!sekolahBusy} />
        <Button label="Tambah Sekolah" loading={sekolahBusy} disabled={sekolahBusy || newSekolah.trim().length < 2} onPress={() => void submitSekolah()} />
        <View className="mt-3 gap-2">
          {sekolahList.map((x) => (
            <View key={x.id} className="flex-row items-center gap-3 rounded-card border border-line p-3">
              <Text className="flex-1 text-sm text-ink">{x.nama}</Text>
              <IconButton icon="trash-outline" tone="danger" accessibilityLabel={'Buang ' + x.nama} onPress={() => void dropSekolah(x)} />
            </View>
          ))}
        </View>
      </FormModal>

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
          topAnchored
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
