import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import {
  addSekolah,
  assignSlot,
  fetchSekolahList,
  fetchSlots,
  removeSekolah,
  type PerkaderanSekolah,
  type PerkaderanSlot,
} from '@/lib/perkaderan';
import { TINGKATAN_OPTIONS, type MemberPickerRow } from '@/types/database';

const NO_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: 'Kumpulan ' + (i + 1) }));

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;
type Group = PerkaderanSlot & { sekolah: string };

const naqibLine = (g: PerkaderanSlot) => [g.naqib_nama, g.partner_nama, g.tambahan_nama].filter(Boolean).join(' & ');

export default function NaqibAssignmentsScreen() {
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = usePerkaderanAccess();

  const [sekolahList, setSekolahList] = useState<PerkaderanSekolah[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  // Borang tambah/edit — hanya dipaparkan bila butang ditekan.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sekolah, setSekolah] = useState<string | null>(null);
  const [tingkatan, setTingkatan] = useState<string | null>('Tingkatan 4');
  const [noKump, setNoKump] = useState<string | null>('1');
  const [naqibId, setNaqibId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [naqib3Id, setNaqib3Id] = useState<string | null>(null);
  const [naqib4Id, setNaqib4Id] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, members] = await Promise.all([fetchSekolahList(), fetchMembersForPicker()]);
      const perSekolah = await Promise.all(list.map((s) => fetchSlots(s.nama)));
      setSekolahList(list);
      setCandidates(members);
      setGroups(perSekolah.flatMap((slots, i) => slots.map((x) => ({ ...x, sekolah: list[i]!.nama }))));
      setSekolah((cur) => (cur && list.some((x) => x.nama === cur) ? cur : (list[0]?.nama ?? null)));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan kumpulan.') });
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

  const currentSlot = useMemo(
    () => groups.find((x) => x.sekolah === sekolah && x.tingkatan === tingkatan && String(x.no_kumpulan) === noKump) ?? null,
    [groups, sekolah, tingkatan, noKump],
  );
  useEffect(() => {
    setNaqibId(currentSlot?.naqib_id ?? null);
    setPartnerId(currentSlot?.partner_id ?? null);
    setNaqib3Id(currentSlot?.tambahan_ids?.[0] ?? null);
    setNaqib4Id(currentSlot?.tambahan_ids?.[1] ?? null);
  }, [currentSlot]);

  const noOptions = useMemo(
    () =>
      NO_OPTIONS.map((o) => {
        const taken = groups.find((x) => x.sekolah === sekolah && x.tingkatan === tingkatan && String(x.no_kumpulan) === o.value);
        return taken ? { ...o, label: o.label + ' — ' + taken.naqib_nama } : o;
      }),
    [groups, sekolah, tingkatan],
  );

  const openNew = useCallback(() => {
    setBanner(null);
    setEditing(false);
    // Cadang kumpulan kosong pertama dalam sekolah + tingkatan semasa.
    const used = new Set(groups.filter((x) => x.sekolah === sekolah && x.tingkatan === tingkatan).map((x) => String(x.no_kumpulan)));
    setNoKump(NO_OPTIONS.find((o) => !used.has(o.value))?.value ?? '1');
    setFormOpen(true);
  }, [groups, sekolah, tingkatan]);

  const openEdit = useCallback((g: Group) => {
    setBanner(null);
    setEditing(true);
    setSekolah(g.sekolah);
    setTingkatan(g.tingkatan);
    setNoKump(String(g.no_kumpulan));
    setFormOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (!sekolah || !tingkatan || !noKump || !naqibId || busy) return;
    setBusy(true);
    setBanner(null);
    try {
      await assignSlot({
        sekolah,
        tingkatan,
        no: Number(noKump),
        naqibId,
        partnerId,
        tambahanIds: [naqib3Id, naqib4Id].filter((x): x is string => Boolean(x)),
      });
      await load();
      setBanner({ tone: 'positive', message: 'Disimpan: ' + sekolah + ', ' + tingkatan + ', Kumpulan ' + noKump + '.' });
      setFormOpen(false);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan kumpulan.') });
    } finally {
      setBusy(false);
    }
  }, [busy, load, naqib3Id, naqib4Id, naqibId, noKump, partnerId, sekolah, tingkatan]);

  // --- Urus senarai sekolah ---
  const [managingSekolah, setManagingSekolah] = useState(false);
  const [newSekolah, setNewSekolah] = useState('');
  const [sekolahBusy, setSekolahBusy] = useState(false);

  const submitSekolah = useCallback(async () => {
    const nama = newSekolah.trim();
    if (nama.length < 2 || sekolahBusy) return;
    setSekolahBusy(true);
    try {
      await addSekolah(nama);
      setNewSekolah('');
      await load();
      setSekolah(nama);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menambah sekolah. Nama mungkin sudah wujud.') });
    } finally {
      setSekolahBusy(false);
    }
  }, [load, newSekolah, sekolahBusy]);

  const dropSekolah = useCallback(
    async (row: PerkaderanSekolah) => {
      if (sekolahBusy) return;
      setSekolahBusy(true);
      try {
        await removeSekolah(row.id);
        await load();
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang sekolah.') });
      } finally {
        setSekolahBusy(false);
      }
    },
    [load, sekolahBusy],
  );

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

  const bySekolah = sekolahList.map((s) => ({ nama: s.nama, rows: groups.filter((g) => g.sekolah === s.nama) })).filter((s) => s.rows.length > 0);

  return (
    <>
      <Screen padTop={false} wide>
        <ScreenHeader eyebrow="Panel Admin" title="Naqib/Naqibah" subtitle={groups.length + ' kumpulan'} onBackPress={goBack} />

        <View className="gap-4 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {formOpen ? (
            <View className="gap-3 rounded-card border border-line bg-surface p-card">
              <Text className="text-base font-semibold text-ink">{editing ? 'Edit Kumpulan' : 'Tambah Kumpulan'}</Text>
              <PickerField
                label="Sekolah"
                value={sekolah}
                options={sekolahList.map((x) => ({ value: x.nama, label: x.nama }))}
                onChange={setSekolah}
                clearable={false}
                disabled={busy || editing}
              />
              {editing ? null : <Button label="Urus Senarai Sekolah" variant="secondary" onPress={() => setManagingSekolah(true)} />}
              <PickerField label="Tingkatan" value={tingkatan} options={TINGKATAN_OPTIONS} onChange={setTingkatan} clearable={false} disabled={busy || editing} />
              <PickerField label="Kumpulan" value={noKump} options={noOptions} onChange={setNoKump} clearable={false} disabled={busy || editing} />
              <MemberPickerField label="Naqib/Naqibah" value={naqibId} candidates={candidates} onChange={setNaqibId} placeholder="Pilih naqib" disabled={busy} />
              <MemberPickerField label="Naqib kedua (pilihan)" value={partnerId} candidates={candidates} onChange={setPartnerId} placeholder="Tiada" disabled={busy} />
              <MemberPickerField label="Naqib ketiga (pilihan)" value={naqib3Id} candidates={candidates} onChange={setNaqib3Id} placeholder="Tiada" disabled={busy} />
              <MemberPickerField label="Naqib keempat (pilihan)" value={naqib4Id} candidates={candidates} onChange={setNaqib4Id} placeholder="Tiada" disabled={busy} />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Batal" variant="secondary" disabled={busy} onPress={() => setFormOpen(false)} />
                </View>
                <View className="flex-1">
                  <Button label="Simpan" loading={busy} disabled={busy || !sekolah || !naqibId} onPress={() => void submit()} />
                </View>
              </View>
            </View>
          ) : (
            <Button label="+ Tambah Kumpulan" onPress={openNew} />
          )}

          {bySekolah.length === 0 ? (
            <EmptyState icon="school-outline" title="Tiada kumpulan lagi" description="Tekan Tambah Kumpulan untuk melantik naqib bagi kumpulan usrah sekolah." />
          ) : (
            bySekolah.map((s) => (
              <View key={s.nama} className="gap-2">
                <Text className="text-sm font-semibold text-ink">{s.nama}</Text>
                {s.rows.map((g) => (
                  <View key={g.group_id} className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">
                        T{g.tingkatan.replace('Tingkatan ', '')} · K{g.no_kumpulan} · {g.madu} mad'u
                      </Text>
                      <Text className="text-xs text-ink-muted">{naqibLine(g)}</Text>
                    </View>
                    <IconButton icon="create-outline" accessibilityLabel={'Edit kumpulan ' + g.no_kumpulan} onPress={() => openEdit(g)} />
                  </View>
                ))}
              </View>
            ))
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
    </>
  );
}
