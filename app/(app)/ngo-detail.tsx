import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NgoFormModal } from '@/components/ngo-form-modal';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { GenerationChip } from '@/components/ui/generation-chip';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useNgoAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  addNgoMember,
  cleanText,
  deleteNgo,
  deleteNgoMember,
  fetchNgo,
  groupNgoMembers,
  updateNgo,
  updateNgoMember,
  type Ngo,
  type NgoInput,
  type NgoMember,
} from '@/lib/ngo';

type MemberForm = { mode: 'add' } | { mode: 'edit'; member: NgoMember };

/**
 * Butiran satu NGO: perihal, tahun penubuhan dan jawatankuasa terkini.
 * Admin LAJNAH PEMBANGUNAN NGO (can_edit) boleh menyunting NGO dan menambah /
 * menyunting / memadam ahli jawatankuasa; ahli lain hanya melihat.
 */
export default function NgoDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const access = useNgoAccess();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [ngo, setNgo] = useState<Ngo | null>(null);
  const [members, setMembers] = useState<NgoMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingNgo, setEditingNgo] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm | null>(null);
  const [deletingNgo, setDeletingNgo] = useState(false);
  const [deletingMember, setDeletingMember] = useState<NgoMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [jawatan, setJawatan] = useState('');
  const [nama, setNama] = useState('');
  const [generasi, setGenerasi] = useState('');
  const [kumpulan, setKumpulan] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchNgo(id);
      setNgo(result.ngo);
      setMembers(result.members);
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan maklumat NGO.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openMemberForm = (form: MemberForm) => {
    setJawatan(form.mode === 'edit' ? form.member.jawatan : '');
    setNama(form.mode === 'edit' ? form.member.nama : '');
    setGenerasi(form.mode === 'edit' ? (form.member.generasi ?? '') : '');
    setKumpulan(form.mode === 'edit' ? (form.member.kumpulan ?? '') : '');
    setFormError(null);
    setMemberForm(form);
  };

  const run = async (action: () => Promise<void>, failure: string, done: string, onError?: (message: string) => void) => {
    setBusy(true);
    try {
      await action();
      setNotice(done);
      await load();
      return true;
    } catch (caught) {
      const message = toMalayError(caught, failure);
      if (onError) onError(message);
      else setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveNgo = async (input: NgoInput) => {
    if (!ngo) return;
    setFormError(null);
    const ok = await run(() => updateNgo(ngo.id, input), 'Gagal menyimpan NGO. Nama NGO mungkin sudah wujud.', 'Maklumat NGO disimpan.', setFormError);
    if (ok) setEditingNgo(false);
  };

  const saveMember = async () => {
    if (!ngo || !memberForm) return;
    const cleanJawatan = cleanText(jawatan);
    const cleanNama = cleanText(nama);
    if (!cleanJawatan || !cleanNama) {
      setFormError('Sila isi jawatan dan nama.');
      return;
    }
    const input = {
      jawatan: cleanJawatan,
      nama: cleanNama,
      generasi: cleanText(generasi)?.toLowerCase() ?? null,
      kumpulan: cleanText(kumpulan),
    };
    setFormError(null);
    const ok = await run(
      () => (memberForm.mode === 'edit' ? updateNgoMember(memberForm.member.id, input) : addNgoMember(ngo.id, input)),
      'Gagal menyimpan ahli jawatankuasa.',
      memberForm.mode === 'edit' ? 'Ahli jawatankuasa dikemas kini.' : 'Ahli jawatankuasa ditambah.',
      setFormError,
    );
    if (ok) setMemberForm(null);
  };

  const confirmDeleteMember = async () => {
    if (!deletingMember) return;
    const target = deletingMember;
    await run(() => deleteNgoMember(target.id), 'Gagal memadam ahli jawatankuasa.', target.nama + ' dibuang daripada jawatankuasa.');
    setDeletingMember(null);
  };

  const confirmDeleteNgo = async () => {
    if (!ngo) return;
    setBusy(true);
    try {
      await deleteNgo(ngo.id);
      setDeletingNgo(false);
      router.replace('/(app)/ngo');
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memadam NGO.'));
      setDeletingNgo(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading || access.loading) return <LoadingScreen />;

  if (!ngo) {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="NGO Rasmi" title="NGO" onBackPress={goBack} />
        {error ? <Notice tone="negative" message={error} /> : null}
        <EmptyState icon="people-circle-outline" title="NGO tidak ditemui" description="NGO ini mungkin telah dipadam." />
      </Screen>
    );
  }

  const groups = groupNgoMembers(members);
  const canEdit = access.canEdit;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="NGO Rasmi" title={ngo.nama} subtitle={ngo.nama_penuh ?? undefined} onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-10 pt-5">
        {notice ? <Notice tone="positive" message={notice} /> : null}
        {error ? <Notice tone="negative" message={error} /> : null}

        {canEdit ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                label="Sunting NGO"
                variant="secondary"
                onPress={() => {
                  setFormError(null);
                  setEditingNgo(true);
                }}
              />
            </View>
            <View className="flex-1">
              <Button label="Padam NGO" variant="danger" onPress={() => setDeletingNgo(true)} />
            </View>
          </View>
        ) : null}

        <Card>
          <View className="gap-3">
            <View>
              <Text className="text-xs font-semibold uppercase text-ink-muted">Tahun penubuhan</Text>
              <Text className="mt-0.5 text-base font-semibold text-ink">
                {ngo.tahun_penubuhan ? String(ngo.tahun_penubuhan) : 'Belum direkodkan'}
              </Text>
            </View>
            <View>
              <Text className="text-xs font-semibold uppercase text-ink-muted">Perihal</Text>
              <Text className="mt-0.5 text-base leading-6 text-ink">{ngo.perihal ?? 'Belum direkodkan'}</Text>
            </View>
          </View>
        </Card>

        <SectionTitle title={'Jawatankuasa Terkini (' + members.length + ')'} />

        {canEdit ? <Button label="Tambah Ahli Jawatankuasa" variant="secondary" onPress={() => openMemberForm({ mode: 'add' })} /> : null}

        {members.length === 0 ? (
          <EmptyState icon="people-outline" title="Belum ada jawatankuasa" description="Jawatankuasa NGO ini belum direkodkan." />
        ) : null}

        {groups.map((group) => (
          <View key={group.kumpulan ?? 'utama'} className="gap-2">
            {group.kumpulan ? <Text className="mt-2 text-sm font-bold text-primary">{group.kumpulan}</Text> : null}
            {group.members.map((member) => (
              <Card key={member.id}>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="text-xs text-ink-muted">{member.jawatan}</Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-2">
                      <Text className="shrink text-base font-semibold text-ink">{member.nama}</Text>
                      {member.generasi ? <GenerationChip code={member.generasi} /> : null}
                    </View>
                  </View>
                  {canEdit ? (
                    <View className="flex-row gap-2">
                      <IconButton icon="create-outline" accessibilityLabel={'Sunting ' + member.nama} onPress={() => openMemberForm({ mode: 'edit', member })} />
                      <IconButton icon="trash-outline" tone="danger" accessibilityLabel={'Buang ' + member.nama} onPress={() => setDeletingMember(member)} />
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        ))}
      </View>

      <NgoFormModal visible={editingNgo} ngo={ngo} busy={busy} error={formError} onClose={() => setEditingNgo(false)} onSubmit={(input) => void saveNgo(input)} />

      <FormModal
        visible={memberForm !== null}
        title={memberForm?.mode === 'edit' ? 'Sunting Ahli Jawatankuasa' : 'Tambah Ahli Jawatankuasa'}
        dismissable={!busy}
        onClose={() => setMemberForm(null)}
        footer={<Button label="Simpan" loading={busy} disabled={busy} onPress={() => void saveMember()} />}>
        <View className="gap-3">
          {formError ? <Notice tone="negative" message={formError} /> : null}
          <TextField label="Jawatan" value={jawatan} onChangeText={setJawatan} placeholder="Contoh: Setiausaha" editable={!busy} />
          <TextField label="Nama" value={nama} onChangeText={setNama} autoCapitalize="words" editable={!busy} />
          <TextField label="Generasi (pilihan)" value={generasi} onChangeText={setGenerasi} placeholder="Contoh: i10" autoCapitalize="none" editable={!busy} />
          <TextField
            label="Kumpulan (pilihan)"
            value={kumpulan}
            onChangeText={setKumpulan}
            placeholder="Contoh: Exco Media"
            editable={!busy}
          />
          <Text className="text-xs text-ink-muted">
            Kumpulan mengelompokkan beberapa ahli di bawah satu tajuk (gunakan nama yang sama). Kosongkan untuk jawatankuasa utama.
          </Text>
        </View>
      </FormModal>

      <ConfirmDialog
        visible={deletingMember !== null}
        title="Buang ahli jawatankuasa?"
        message={deletingMember ? deletingMember.nama + ' (' + deletingMember.jawatan + ') akan dibuang daripada jawatankuasa ' + ngo.nama + '.' : ''}
        confirmLabel="Buang"
        destructive
        busy={busy}
        onConfirm={() => void confirmDeleteMember()}
        onCancel={() => setDeletingMember(null)}
      />

      <ConfirmDialog
        visible={deletingNgo}
        title="Padam NGO?"
        message={ngo.nama + ' beserta ' + members.length + ' ahli jawatankuasanya akan dipadam kekal. Tindakan ini tidak boleh dibatalkan.'}
        confirmLabel="Padam NGO"
        destructive
        busy={busy}
        onConfirm={() => void confirmDeleteNgo()}
        onCancel={() => setDeletingNgo(false)}
      />
    </Screen>
  );
}
