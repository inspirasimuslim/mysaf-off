import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Text, View } from 'react-native';

import { MemberForm, type ProfileTab } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { SelfUpdateAdminNote } from '@/components/self-update-status';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { ToastBanner } from '@/components/ui/toast';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { useMemberAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchMemberBusinesses, saveMemberBusinesses } from '@/lib/member-businesses';
import { fetchMemberEducation, saveMemberEducation } from '@/lib/member-education';
import {
  deleteMemberAccount,
  fetchGenerations,
  fetchMember,
  fetchMembersForPicker,
  updateMember,
} from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { fetchOrgChart, jawatanForMember } from '@/lib/org-chart';
import { toWhatsAppNumber } from '@/lib/phone';
import { usePermissions } from '@/lib/permissions';
import { fetchAllSchools } from '@/lib/schools';
import { useIsDesktop } from '@/lib/use-desktop';
import { TEMP_PASSWORD, resetMemberPassword } from '@/lib/temp-password';
import {
  type Generation,
  type Member,
  type MemberBusiness,
  type MemberBusinessDraft,
  type MemberEducation,
  type MemberEducationDraft,
  type MemberPickerRow,
  type School,
} from '@/types/database';
import { useColors } from '@/lib/theme';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

export default function AhliDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const desktop = useIsDesktop();

  // Desktop: butiran hidup di panel kanan senarai — pautan terus dibuka di sana.
  if (desktop) return <Redirect href={{ pathname: '/(app)/admin/ahli-list', params: id ? { id } : {} }} />;

  return <AhliDetailView id={id} />;
}

/**
 * Butiran ahli — skrin penuh di mobile, panel kanan di desktop (`ahli-list`).
 * `onChanged` dipanggil selepas simpan; `onDeleted` selepas padam (mod panel).
 */
export function AhliDetailView({
  id,
  onChanged,
  onDeleted,
}: {
  id?: string;
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const colors = useColors();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useMemberAccess();
  const router = useRouter();
  // Kebenaran BERASINGAN: kehadiran usrah milik LAJNAH TARBIAH, bukan pemilik rekod ahli.
  const usrahAccess = useUsrahAccess();
  const { isSuperAdmin } = usePermissions();

  const [member, setMember] = useState<Member | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [spouseCandidates, setSpouseCandidates] = useState<MemberPickerRow[]>([]);
  const [businesses, setBusinesses] = useState<MemberBusiness[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [education, setEducation] = useState<MemberEducation[]>([]);
  const [loading, setLoading] = useState(true);
  const [jawatan, setJawatan] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  /** Dinaikkan selepas setiap simpanan berjaya untuk memaksa borang dibina semula. */
  const [version, setVersion] = useState(0);
  // Di sini dan bukan dalam borang: borang dipasang semula selepas setiap simpanan.
  const [tab, setTab] = useState<ProfileTab>('peribadi');

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

        // Kegagalan di sini tidak boleh menyekat paparan rekod ahli — kesannya
        // hanya pemilih pasangan turun kepada senarai kosong.
        try {
          const candidates = await fetchMembersForPicker();
          if (active) setSpouseCandidates(candidates);
        } catch {
          if (active) setSpouseCandidates([]);
        }

        // Jawatan daripada carta organisasi — kegagalan hanya bermakna baris jawatan tidak dipaparkan.
        try {
          const chart = await fetchOrgChart();
          if (active) setJawatan(jawatanForMember(chart, id));
        } catch {
          if (active) setJawatan(null);
        }

        // Sama falsafah: tab Perniagaan mula kosong jika gagal, bukan menyekat rekod.
        try {
          const rows = row ? await fetchMemberBusinesses(row.id) : [];
          if (active) setBusinesses(rows);
        } catch {
          if (active) setBusinesses([]);
        }

        // Sama falsafah lagi: tab Pendidikan mula kosong jika gagal.
        try {
          const [schoolRows, educationRows] = await Promise.all([
            fetchAllSchools(),
            row ? fetchMemberEducation(row.id) : Promise.resolve([]),
          ]);
          if (active) {
            setSchools(schoolRows);
            setEducation(educationRows);
          }
        } catch {
          if (active) {
            setSchools([]);
            setEducation([]);
          }
        }
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
    async (patch: Partial<Member>, businessesDraft: MemberBusinessDraft[], educationDraft: MemberEducationDraft[]) => {
      if (!member || saving) return;

      setBanner(null);
      setSaving(true);
      try {
        if (Object.keys(patch).length > 0) await updateMember(member.id, patch);
        await saveMemberBusinesses(member.id, businesses, businessesDraft);
        await saveMemberEducation(member.id, education, educationDraft);

        // Baca semula supaya `updated_at` dan sebarang nilai yang dinormalkan
        // oleh pangkalan data terpapar, bukan andaian tempatan.
        const fresh = await fetchMember(member.id);
        setMember(fresh);
        setBusinesses(await fetchMemberBusinesses(member.id));
        setEducation(await fetchMemberEducation(member.id));
        setVersion((current) => current + 1);
        setBanner({ tone: 'positive', message: 'Perubahan telah disimpan.' });
        onChanged?.();
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
      } finally {
        setSaving(false);
      }
    },
    [businesses, education, member, onChanged, saving],
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
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = useCallback(() => {
    setBanner(null);
    setDeleteBusy(false);
    setDeleteModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!member || deleteBusy) return;

    setDeleteBusy(true);
    try {
      await deleteMemberAccount(member.id);
      setDeleteModal(false);
      /*
        `goBack()` serta-merta menutup skrin sebelum notis kejayaan sempat
        dilihat. Set `member` kepada `null` sebaliknya — cabang "!member"
        sedia ada di bawah (asalnya untuk rekod tidak dijumpai) sudah memapar
        `banner` di atas `EmptyState`, jadi ia dikongsi terus di sini.
      */
      setMember(null);
      setBanner({ tone: 'positive', message: 'Ahli berjaya dipadam.' });
      // Mod panel: senarai membuang barisnya dan panel kanan kembali kosong.
      onDeleted?.();
    } catch (caught) {
      setDeleteModal(false);
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memadam ahli.') });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, member, onDeleted]);

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
              <ToastBanner tone={banner.tone} message={banner.message} />
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
        {/* Nama, generasi dan emel sudah dalam kepala borang — kepala skrin cukup nombor ahli. */}
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Butiran Ahli"
          subtitle={member.nombor_ahli ?? 'Tiada nombor ahli'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pb-8 pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

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
            spouseCandidates={spouseCandidates}
            businesses={businesses}
            schools={schools}
            education={education}
            /* Panel Admin sentiasa berurusan dengan kolum keahlian; yang
             menentukan sama ada ia boleh disunting ialah `readOnly` di bawah. */
            canEditAdminColumns
            jawatan={jawatan}
            readOnly={!canEdit}
            busy={saving}
            headerNote={<SelfUpdateAdminNote value={member.self_updated_at} />}
            onPickAvatar={() => void changeAvatar()}
            avatarBusy={avatarBusy}
            tabs={{ value: tab, onChange: setTab }}
            onSave={(patch, businessesDraft, educationDraft) => void save(patch, businessesDraft, educationDraft)}
            actions={({ save: saveNode, sekat }) => (
              <ActionPanel
                save={saveNode}
                /*
                  `isSuperAdmin()` dan BUKAN `canEdit`, dengan sengaja — sepadan
                  dengan semakan dalam `reset_member_login_window()` itu sendiri.
                  Kebenaran department membenarkan seseorang menyunting rekod;
                  butang ini pula memberi seseorang tiga hari untuk log masuk
                  dengan kata laluan yang diketahui umum. Itu perbezaan jenis,
                  bukan darjah.
                */
                reset={
                  isSuperAdmin() ? (
                    <Button
                      label="Reset Kata Laluan"
                      variant="secondary"
                      size="sm"
                      loading={resetBusy}
                      disabled={resetBusy}
                      onPress={() => setResetDialog(true)}
                    />
                  ) : null
                }
                whatsapp={
                  toWhatsAppNumber(member.no_tel) ? (
                    <Button
                      label="WhatsApp"
                      variant="secondary"
                      size="sm"
                      icon={<Ionicons name="logo-whatsapp" size={16} color="#25D366" />}
                      onPress={() => void Linking.openURL('https://wa.me/' + toWhatsAppNumber(member.no_tel))}
                    />
                  ) : null
                }
                sekat={sekat}
                // Kebenaran BERASINGAN: kehadiran usrah milik LAJNAH TARBIAH, bukan pemilik rekod ahli.
                usrah={
                  usrahAccess.canView ? (
                    <Button
                      label="Rekod / Betulkan Kehadiran Usrah"
                      variant="secondary"
                      size="sm"
                      icon={<Ionicons name="people-outline" size={16} color={colors.primary} />}
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/admin/ahli-usrah-history',
                          params: { id: member.id, nama: member.full_name, nombor: member.nombor_ahli ?? '' },
                        })
                      }
                    />
                  ) : null
                }
                padam={
                  canEdit ? (
                    <Button
                      label="Padam Ahli"
                      variant="danger"
                      size="sm"
                      icon={<Ionicons name="trash-outline" size={16} color={colors.negative} />}
                      onPress={openDelete}
                    />
                  ) : null
                }
              />
            )}
          />
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

      <ConfirmDialog
        visible={deleteModal}
        title="Padam ahli?"
        message={
          'Padam rekod ' +
          (member.nombor_ahli ?? '') +
          ' · ' +
          member.full_name +
          ' secara kekal, termasuk akaun log masuknya? Tindakan ini tidak boleh dibatalkan.'
        }
        confirmLabel="Padam Kekal"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteModal(false)}
      />
    </>
  );
}

/**
 * Semua tindakan ke atas rekod dalam satu panel di bawah borang.
 *
 * Susunan ikut kekerapan dan risiko: Simpan (paling kerap) di atas dan paling
 * menonjol; alat pentadbir berpasangan di tengah; Padam (musnah, tidak boleh
 * dibatalkan) terpencil di hujung selepas garis pemisah, bersaiz labelnya
 * sahaja supaya tidak tertekan ketika menuju butang lain.
 */
function ActionPanel({
  save,
  reset,
  whatsapp,
  sekat,
  usrah,
  padam,
}: {
  save: ReactNode;
  reset: ReactNode;
  whatsapp: ReactNode;
  sekat: ReactNode;
  usrah: ReactNode;
  padam: ReactNode;
}) {
  const hasTools = Boolean(reset || sekat || usrah || whatsapp);
  if (!save && !hasTools && !padam) return null;

  return (
    <View className="gap-4 rounded-card border border-line bg-surface p-4">
      {save ? <View className="gap-3">{save}</View> : null}

      {hasTools ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Tindakan Admin</Text>
          {/* Satu baris dua lajur; yang tinggal seorang mengambil lebar penuh. */}
          {reset || sekat ? (
            <View className="flex-row gap-2">
              {reset ? <View className="flex-1">{reset}</View> : null}
              {sekat ? <View className="flex-1">{sekat}</View> : null}
            </View>
          ) : null}
          {whatsapp}
          {usrah}
        </View>
      ) : null}

      {/* Memadam ahli membuang rekod DAN akaun log masuknya, tanpa pemulihan. */}
      {padam ? (
        <View className="flex-row items-center gap-3 border-t border-line pt-4">
          <Text className="flex-1 text-xs leading-4 text-ink-muted">
            Rekod dan akaun log masuk ahli ini dipadam kekal.
          </Text>
          {padam}
        </View>
      ) : null}
    </View>
  );
}
