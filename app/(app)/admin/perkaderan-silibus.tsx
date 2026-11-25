import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { deleteSilibus, fetchSilibus, saveSilibus, type SilibusRow } from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';
import { TINGKATAN_OPTIONS } from '@/types/database';

/** Senarai Fikrah rasmi setiap tingkatan. Admin Lajnah Perkaderan / Super Admin sahaja menyunting; naqib memilih daripadanya dalam laporan sesi. */
export default function PerkaderanSilibusScreen() {
  const goBack = useGoBack();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit } = usePerkaderanAccess();
  const mayEdit = isSuperAdmin() || canEdit;

  const [tingkatan, setTingkatan] = useState<string>('Tingkatan 3');
  const [rows, setRows] = useState<SilibusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'negative'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [urutan, setUrutan] = useState('');
  const [tajuk, setTajuk] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SilibusRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchSilibus(tingkatan));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan silibus.') });
    } finally {
      setLoading(false);
    }
  }, [tingkatan]);

  useFocusEffect(
    useCallback(() => {
      if (permLoading || accessLoading) return;
      void load();
    }, [accessLoading, load, permLoading]),
  );

  const openForm = (row: SilibusRow | null) => {
    setEditId(row?.id);
    setUrutan(row ? String(row.urutan) : String((rows[rows.length - 1]?.urutan ?? 0) + 1));
    setTajuk(row?.tajuk ?? '');
    setOpen(true);
  };

  const submit = async () => {
    const n = Number(urutan);
    if (!tajuk.trim() || !Number.isInteger(n) || n < 1 || n > 30) {
      setBanner({ tone: 'negative', message: 'Isi tajuk dan nombor Fikrah (1–30).' });
      return;
    }
    setBusy(true);
    try {
      await saveSilibus({ id: editId, tingkatan, urutan: n, tajuk });
      setOpen(false);
      setBanner({ tone: 'positive', message: 'Silibus disimpan.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan. Nombor Fikrah mungkin sudah digunakan.') });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteSilibus(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setPendingDelete(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam.') });
    } finally {
      setBusy(false);
    }
  };

  if (permLoading || accessLoading) return <LoadingScreen />;
  if (!mayEdit) return <NoAccessScreen title="Silibus Fikrah" description="Hanya untuk admin Lajnah Perkaderan." />;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader title="Silibus Fikrah" onBackPress={goBack} />
        <View className="gap-3 px-gutter pb-10">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}
          <Segmented label="Tingkatan" value={tingkatan} options={TINGKATAN_OPTIONS} onChange={setTingkatan} />
          {loading ? <LoadingScreen /> : null}
          {!loading && rows.length === 0 ? <Text className="text-sm text-ink-muted">Belum ada Fikrah untuk tingkatan ini.</Text> : null}
          {rows.length > 0 ? (
            <View className="overflow-hidden rounded-xl border border-line bg-surface">
              {rows.map((row, i) => (
                <View key={row.id} className={'flex-row items-center gap-2 px-3 py-1.5 ' + (i > 0 ? 'border-t border-line' : '')}>
                  <Text className="flex-1 text-sm text-ink">
                    F{row.urutan} · {row.tajuk}
                  </Text>
                  <IconButton icon="create-outline" accessibilityLabel="Sunting Fikrah" onPress={() => openForm(row)} />
                  <IconButton icon="trash-outline" accessibilityLabel="Padam Fikrah" onPress={() => setPendingDelete(row)} />
                </View>
              ))}
            </View>
          ) : null}
          <Button label="+ Tambah Fikrah" onPress={() => openForm(null)} />
        </View>
      </Screen>

      <FormModal
        visible={open}
        title={editId ? 'Sunting Fikrah' : 'Tambah Fikrah'}
        dismissable={!busy}
        onClose={() => setOpen(false)}
        footer={<Button label="Simpan" loading={busy} disabled={busy || !tajuk.trim()} onPress={() => void submit()} />}>
        <TextField label="Nombor Fikrah" value={urutan} onChangeText={setUrutan} keyboardType="number-pad" editable={!busy} />
        <TextField label="Tajuk" value={tajuk} onChangeText={setTajuk} editable={!busy} autoCapitalize="words" />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam Fikrah?"
        message={'F' + (pendingDelete?.urutan ?? '') + ' akan dibuang daripada senarai. Sesi lama yang merujuknya kekal, tetapi tajuknya tidak lagi dipapar.'}
        confirmLabel="Padam"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
