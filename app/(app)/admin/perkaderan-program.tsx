import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { DateTimeField } from '@/components/ui/date-time-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  deleteTamrin,
  fetchPrograms,
  fetchTamrin,
  saveProgram,
  saveTamrin,
  type PerkaderanProgram,
  type PerkaderanTamrin,
} from '@/lib/perkaderan-program';
import { usePermissions } from '@/lib/permissions';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

function dateLabel(value: string): string {
  const d = new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIso(): string {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

/**
 * Program Pra-Keahlian + jadual tamrin. Admin LAJNAH PERKADERAN (can_edit) / Super Admin
 * menyunting; naqib hanya melihat jadual dan merekod kehadiran tamrin.
 */
export default function PerkaderanProgramScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit } = usePerkaderanAccess();
  const mayEdit = isSuperAdmin() || canEdit;

  const [programs, setPrograms] = useState<PerkaderanProgram[]>([]);
  const [tamrin, setTamrin] = useState<PerkaderanTamrin[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const program = programs.find((p) => p.aktif) ?? programs[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPrograms();
      setPrograms(list);
      const current = list.find((p) => p.aktif) ?? list[0];
      setTamrin(current ? await fetchTamrin(current.id) : []);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan program.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (permLoading || accessLoading) return;
      void load();
    }, [accessLoading, load, permLoading]),
  );

  // --- Program ---
  const [progOpen, setProgOpen] = useState(false);
  const [progNama, setProgNama] = useState('');
  const [progSasaran, setProgSasaran] = useState('');
  const [progAktif, setProgAktif] = useState(true);
  const [progEditId, setProgEditId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const openProgram = (p: PerkaderanProgram | null) => {
    setProgEditId(p?.id);
    setProgNama(p?.nama ?? '');
    setProgSasaran(p ? String(p.sasaran_usrah) : '');
    setProgAktif(p?.aktif ?? true);
    setProgOpen(true);
  };

  const submitProgram = async () => {
    const sasaran = Number(progSasaran || '0');
    if (!progNama.trim() || !Number.isInteger(sasaran) || sasaran < 0 || sasaran > 200) {
      setBanner({ tone: 'negative', message: 'Isi nama program dan sasaran usrah (0–200).' });
      return;
    }
    setBusy(true);
    try {
      await saveProgram({ id: progEditId, nama: progNama, sasaran_usrah: sasaran, aktif: progAktif });
      setProgOpen(false);
      setBanner({ tone: 'positive', message: 'Program disimpan.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan program.') });
    } finally {
      setBusy(false);
    }
  };

  // --- Tamrin ---
  const [tOpen, setTOpen] = useState(false);
  const [tId, setTId] = useState<string | undefined>();
  const [tNama, setTNama] = useState('');
  const [tTarikh, setTTarikh] = useState(todayIso());
  const [tLokasi, setTLokasi] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PerkaderanTamrin | null>(null);

  const openTamrin = (t: PerkaderanTamrin | null) => {
    setTId(t?.id);
    setTNama(t?.nama ?? '');
    setTTarikh(t?.tarikh ?? todayIso());
    setTLokasi(t?.lokasi ?? '');
    setTOpen(true);
  };

  const submitTamrin = async () => {
    if (!program || !tNama.trim()) return;
    setBusy(true);
    try {
      await saveTamrin({ id: tId, program_id: program.id, nama: tNama, tarikh: tTarikh, lokasi: tLokasi });
      setTOpen(false);
      setBanner({ tone: 'positive', message: 'Tamrin disimpan.' });
      await load();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan tamrin.') });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteTamrin(pendingDelete.id);
      setPendingDelete(null);
      setBanner({ tone: 'positive', message: 'Tamrin dipadam beserta rekod kehadirannya.' });
      await load();
    } catch (caught) {
      setPendingDelete(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam tamrin.') });
    } finally {
      setBusy(false);
    }
  };

  if (permLoading || accessLoading || loading) return <LoadingScreen />;

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader title="Program & Tamrin" onBackPress={goBack} />
        <View className="gap-5 px-gutter pb-10">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          {!program ? (
            <EmptyState
              icon="calendar-outline"
              title="Belum ada program"
              description={mayEdit ? 'Cipta program pra-keahlian dahulu, kemudian tambah tarikh tamrin.' : 'Admin Lajnah Perkaderan belum menetapkan program.'}
            />
          ) : (
            <Card>
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-base font-bold text-ink">{program.nama}</Text>
                  <Text className="text-xs text-ink-muted">
                    Sasaran {program.sasaran_usrah} sesi usrah{program.aktif ? '' : ' · tidak aktif'}
                  </Text>
                </View>
                {mayEdit ? <IconButton icon="create-outline" accessibilityLabel="Sunting program" onPress={() => openProgram(program)} /> : null}
              </View>
            </Card>
          )}

          {mayEdit && !program ? <Button label="Cipta Program" onPress={() => openProgram(null)} /> : null}

          {program ? (
            <View className="gap-3">
              <SectionTitle title="Jadual Tamrin" />
              {tamrin.length === 0 ? <Text className="text-sm text-ink-muted">Belum ada tamrin dijadualkan.</Text> : null}
              {tamrin.map((t) => (
                <Card key={t.id}>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{t.nama}</Text>
                      <Text className="text-xs text-ink-muted">
                        {dateLabel(t.tarikh)}
                        {t.lokasi ? ' · ' + t.lokasi : ''}
                      </Text>
                    </View>
                    {mayEdit ? (
                      <>
                        <IconButton icon="create-outline" accessibilityLabel="Sunting tamrin" onPress={() => openTamrin(t)} />
                        <IconButton icon="trash-outline" accessibilityLabel="Padam tamrin" onPress={() => setPendingDelete(t)} />
                      </>
                    ) : null}
                  </View>
                  <View className="mt-3">
                    <Button
                      label="Rekod Kehadiran"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/(app)/admin/perkaderan-tamrin', params: { id: t.id } })}
                    />
                  </View>
                </Card>
              ))}
              {mayEdit ? <Button label="Tambah Tamrin" onPress={() => openTamrin(null)} /> : null}
            </View>
          ) : null}
        </View>
      </Screen>

      <FormModal
        visible={progOpen}
        title={progEditId ? 'Sunting Program' : 'Cipta Program'}
        dismissable={!busy}
        onClose={() => setProgOpen(false)}
        footer={<Button label="Simpan" loading={busy} disabled={busy} onPress={() => void submitProgram()} />}>
        <TextField label="Nama program" value={progNama} onChangeText={setProgNama} editable={!busy} />
        <TextField label="Sasaran bilangan sesi usrah" value={progSasaran} onChangeText={setProgSasaran} keyboardType="number-pad" editable={!busy} />
        <ToggleRow icon="flag-outline" title="Program aktif" value={progAktif} onValueChange={setProgAktif} />
      </FormModal>

      <FormModal
        visible={tOpen}
        title={tId ? 'Sunting Tamrin' : 'Tambah Tamrin'}
        dismissable={!busy}
        onClose={() => setTOpen(false)}
        footer={<Button label="Simpan" loading={busy} disabled={busy || !tNama.trim()} onPress={() => void submitTamrin()} />}>
        <TextField label="Nama tamrin" value={tNama} onChangeText={setTNama} editable={!busy} />
        <DateTimeField label="Tarikh" mode="date" value={tTarikh} onChange={setTTarikh} />
        <TextField label="Lokasi (pilihan)" value={tLokasi} onChangeText={setTLokasi} editable={!busy} />
      </FormModal>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Padam tamrin?"
        message={(pendingDelete?.nama ?? '') + ' dan semua rekod kehadirannya akan dipadam.'}
        confirmLabel="Padam"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
