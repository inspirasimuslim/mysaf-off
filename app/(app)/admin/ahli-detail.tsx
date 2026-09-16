import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { MemberForm } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { ActionRow } from '@/components/ui/action-row';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { useMemberAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deleteMemberAccount, fetchGenerations, fetchMember, updateMember } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions';
import { TEMP_PASSWORD, resetMemberPassword } from '@/lib/temp-password';
import { generationLabel, type Generation, type Member } from '@/types/database';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

export default function AhliDetailScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading: accessLoading, canView, canEdit } = useMemberAccess();
  const router = useRouter();
  // Kebenaran BERASINGAN: kehadiran usrah milik LAJNAH TARBIAH, bukan pemilik rekod ahli.
  const usrahAccess = useUsrahAccess();
  const { isSuperAdmin } = usePermissions();

  const [member, setMember] = useState<Member | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  /** Dinaikkan selepas setiap simpanan berjaya untuk memaksa borang dibina semula. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (accessLoading || !canView || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const [row, gens] = await Promise.all([fetchMember(id), fetchGenerations()]);
        if (!active) return;
        setMember(row);
        setGenerations(gens);
      } catch (caught) {
        if (active)
          setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod ahli.') });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canView, id]);

  // --- Avatar ---------------------------------------------------------------
  const [avatarBusy, setAvatarBusy] = useState(false);

  const changeAvatar = useCallback(async () => {
    if (!member || avatarBusy) return;

    setBanner(null);
    setAvatarBusy(true);
    try {
      const uri = await pickAvatar();
      // `null` bermakna pemilihan dibatalkan — bukan kegagalan, jadi senyap.
      if (!uri) return;

      const url = await uploadAvatar(member.id, uri);
      setMember({ ...member, avatar_url: url });
      setBanner({ tone: 'positive', message: 'Gambar profil telah dikemas kini.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat naik gambar.') });
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, member]);

  const save = useCallback(
    async (patch: Partial<Member>) => {
      if (!member || saving) return;

      setBanner(null);
      setSaving(true);
      try {
        await updateMember(member.id, patch);
        // Baca semula supaya `updated_at` dan sebarang nilai yang dinormalkan
        // oleh pangkalan data terpapar, bukan andaian tempatan.
        const fresh = await fetchMember(member.id);
        setMember(fresh);
        setVersion((current) => current + 1);
        setBanner({ tone: 'positive', message: 'Perubahan telah disimpan.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
      } finally {
        setSaving(false);
      }
    },
    [member, saving],
  );

  // --- Tempoh log masuk sementara -------------------------------------------
  const [resetDialog, setResetDialog] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const confirmReset = useCallback(async () => {
    if (!member || resetBusy) return;

    setBanner(null);
    setResetBusy(true);
    try {
      const result = await resetMemberPassword(member.id);
      setResetDialog(false);
      setBanner({
        tone: 'positive',
        message:
          'Kata laluan ' +
          result.full_name +
          ' ditetapkan semula kepada "' +
          result.password +
          '", sah sehingga ' +
          new Date(result.expires_at).toLocaleString('ms-MY') +
          '. Ahli akan dipaksa menetapkan kata laluan baharu semasa log masuk seterusnya.',
      });
    } catch (caught) {
      setResetDialog(false);
      /*
        Mesej pelayan dijadikan SANDARAN, bukan diganti. `toMalayError` masih
        menangkap kegagalan rangkaian dan sesi tamat dengan ayatnya sendiri;
        selebihnya jatuh kepada sebab sebenar yang dilontar oleh RPC.
      */
      const fallback = caught instanceof Error && caught.message ? caught.message : 'Gagal menetapkan semula kata laluan ahli.';
      setBanner({ tone: 'negative', message: toMalayError(caught, fallback) });
    } finally {
      setResetBusy(false);
    }
  }, [member, resetBusy]);

  // --- Padam ahli (kekal) ---------------------------------------------------
  const [deleteModal, setDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = useCallback(() => {
    setBanner(null);
    setConfirmText('');
    setDeleteBusy(false);
    setDeleteModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!member || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteMemberAccount(member.id);
      setDeleteModal(false);
      // Rekod sudah tiada — kekal di skrin ini akan memapar borang hantu.
      goBack();
    } catch (caught) {
      setDeleteModal(false);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam ahli.') });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, goBack, member]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Butiran Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Butiran ahli memerlukan kebenaran melihat pada department JABATAN DATA & SUMBER MANUSIA."
          />
        </View>
      </Screen>
    );
  }

  if (!member) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Butiran Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          {banner ? (
            <View className="pt-6">
              <Notice tone={banner.tone} message={banner.message} />
            </View>
          ) : null}
          <EmptyState
            icon="alert-circle-outline"
            title="Rekod tidak dijumpai"
            description="Rekod ahli ini mungkin telah dipadam. Kembali ke senarai dan cuba lagi."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow={(member.nombor_ahli ?? 'Tiada nombor') + ' · ' + generationLabel(member.generasi)}
          title={member.full_name}
          subtitle={member.email ?? 'Tiada emel'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          {!canEdit ? (
            <Notice
              tone="info"
              message="Anda hanya mempunyai akses Lihat untuk bahagian ini. Borang di bawah adalah paparan sahaja."
            />
          ) : null}

          <MemberForm
            /* `key` memaksa borang dibina semula selepas simpan supaya draftnya
             bermula daripada nilai terkini, bukan nilai sebelum simpan. */
            key={member.id + ':' + version}
            member={member}
            generations={generations}
            /* Panel Admin sentiasa berurusan dengan kolum keahlian; yang
             menentukan sama ada ia boleh disunting ialah `readOnly` di bawah. */
            canEditAdminColumns
            readOnly={!canEdit}
            busy={saving}
            onPickAvatar={() => void changeAvatar()}
            avatarBusy={avatarBusy}
            onSave={(patch) => void save(patch)}
          />

          {/*
            `isSuperAdmin()` dan BUKAN `canEdit`, dengan sengaja — sepadan dengan
            semakan dalam `reset_member_login_window()` itu sendiri. Kebenaran
            department membenarkan seseorang menyunting rekod; butang ini pula
            memberi seseorang tiga hari untuk log masuk dengan kata laluan yang
            diketahui umum. Itu perbezaan jenis, bukan darjah.
          */}
          {usrahAccess.canView ? (
            <ActionRow
              icon="people-outline"
              title="Rekod / Betulkan Kehadiran Usrah"
              subtitle="Kehadiran bulanan dengan kawasan, tempat dan tarikh"
              onPress={() =>
                router.push({
                  pathname: '/(app)/admin/ahli-usrah-history',
                  params: { id: member.id, nama: member.full_name, nombor: member.nombor_ahli ?? '' },
                })
              }
            />
          ) : null}

          {isSuperAdmin() ? (
            <View className="gap-3 pt-2">
              <Button
                label="Reset Kata Laluan Ahli"
                variant="secondary"
                loading={resetBusy}
                disabled={resetBusy}
                onPress={() => setResetDialog(true)}
              />
              <Text className="text-center text-sm text-ink-muted">
                Menetapkan semula kata laluan kepada kata laluan sementara dan memaksa ahli menukarnya.
              </Text>
            </View>
          ) : null}

          {/*
          Memadam ahli membuang rekod DAN akaun log masuknya, tanpa pemulihan.
          Kerana itu ia terletak di hujung skrin, dipisahkan daripada borang,
          dan memerlukan perkataan disahkan sebelum butang terakhir hidup.
        */}
          {canEdit ? (
            <View className="gap-3 pb-8 pt-2">
              <Button label="Padam Ahli" variant="danger" onPress={openDelete} />
              <Text className="text-center text-sm text-ink-muted">
                Rekod dan akaun log masuk ahli ini akan dipadam kekal.
              </Text>
            </View>
          ) : null}
        </View>
      </Screen>

      <ConfirmDialog
        visible={resetDialog}
        title="Reset kata laluan ahli?"
        message={
          member.full_name +
          ' akan kehilangan kata laluan semasanya. Ini akan menetapkan semula kata laluan ahli ini kepada "' +
          TEMP_PASSWORD +
          '" dan meminta dia tukar kata laluan baharu semasa log masuk seterusnya. Tetingkap sementara sah selama tiga hari.'
        }
        confirmLabel="Reset"
        busy={resetBusy}
        onConfirm={() => void confirmReset()}
        onCancel={() => setResetDialog(false)}
      />

      <FormModal
        visible={deleteModal}
        title="Padam ahli?"
        description={
          'Rekod ' +
          (member.nombor_ahli ?? '') +
          ' · ' +
          member.full_name +
          ' dan akaun log masuknya akan dipadam KEKAL. Tindakan ini tidak boleh dibatalkan.'
        }
        dismissable={!deleteBusy}
        onClose={() => setDeleteModal(false)}
      >
        <Notice tone="warn" message="Taip PADAM di bawah untuk mengesahkan." />

        <TextField
          label="Taip PADAM"
          placeholder="PADAM"
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleteBusy}
        />

        <Button
          label="Padam Kekal"
          variant="danger"
          loading={deleteBusy}
          disabled={deleteBusy || confirmText.trim().toUpperCase() !== 'PADAM'}
          onPress={() => void confirmDelete()}
        />
      </FormModal>
    </>
  );
}
