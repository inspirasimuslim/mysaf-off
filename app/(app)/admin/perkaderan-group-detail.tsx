import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import {
  addMadU,
  deleteOrArchiveGroup,
  deleteSession,
  fetchGroup,
  fetchMadU,
  fetchMyMemberId,
  fetchSessions,
  removeMadU,
  updateGroupDefaultPartner,
} from '@/lib/perkaderan';
import { usePermissions } from '@/lib/permissions';
import { TINGKATAN_OPTIONS, type MemberPickerRow, type Option, type UsrahGroup, type UsrahMadU, type UsrahSession } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** 'YYYY-MM-DD' → '12 Sep 2026'. */
function dateLabel(value: string): string {
  const parsed = new Date(value + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pilihan rasmi, ditambah nilai semasa sebagai "(tidak dikenali)" jika ia di luar senarai. */
function withUnrecognised(options: Option<string>[], current: string | null): Option<string>[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: current + ' (tidak dikenali)' }];
}

export default function PerkaderanGroupDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id, created } = useLocalSearchParams<{ id?: string; created?: string }>();
  const { loading: permissionsLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit: departmentCanEdit } = usePerkaderanAccess();

  const [group, setGroup] = useState<UsrahGroup | null>(null);
  const [madU, setMadU] = useState<UsrahMadU[]>([]);
  const [sessions, setSessions] = useState<UsrahSession[]>([]);
  const [memberCandidates, setMemberCandidates] = useState<MemberPickerRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [groupRow, madURows, sessionRows, myMemberId, pickerRows] = await Promise.all([
        fetchGroup(id),
        fetchMadU(id),
        fetchSessions(id),
        fetchMyMemberId(),
        fetchMembersForPicker(),
      ]);
      setGroup(groupRow);
      setMadU(madURows);
      setSessions(sessionRows);
      setMemberCandidates(pickerRows);
      setIsOwner(Boolean(groupRow && myMemberId && groupRow.naqib_member_id === myMemberId));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan kumpulan.') });
    } finally {
      setLoading(false);
    }
  }, [id]);

  /*
    `useFocusEffect` dan bukan `useEffect` sahaja — skrin ini kembali fokus
    selepas naqib mencipta sesi/mad'u di skrin lain dan menekan "kembali".
    React Navigation TIDAK memasang semula komponen ini (ia kekal dalam
    stack), jadi `useEffect` biasa hanya berjalan SEKALI dan tidak pernah
    tahu data sudah berubah — memaparkan senarai lapuk selama-lamanya.
  */
  useFocusEffect(
    useCallback(() => {
      if (permissionsLoading || accessLoading) return;
      void load();
    }, [accessLoading, load, permissionsLoading]),
  );

  /*
    `created=1` dihantar oleh `usrah-group-create.tsx` — dibaca SEKALI sahaja
    (bukan `useFocusEffect`) dan parameter dibuang serta-merta selepas itu,
    supaya notis tidak muncul semula setiap kali skrin ini kembali fokus.
  */
  useEffect(() => {
    if (created !== '1') return;
    setBanner({ tone: 'positive', message: 'Kumpulan berjaya dicipta.' });
    router.setParams({ created: undefined });
  }, [created, router]);

  const canEdit = isSuperAdmin() || departmentCanEdit || isOwner;

  const partnerName = useCallback(
    (memberId: string | null) => (memberId ? memberCandidates.find((row) => row.id === memberId)?.full_name ?? 'Ahli' : null),
    [memberCandidates],
  );

  // --- Tukar Partner Naqib DEFAULT kumpulan -----------------------------------
  const [partnerBusy, setPartnerBusy] = useState(false);

  const changeDefaultPartner = useCallback(
    async (nextPartnerId: string | null) => {
      if (!group || partnerBusy) return;

      setPartnerBusy(true);
      try {
        await updateGroupDefaultPartner(group.id, nextPartnerId);
        setGroup({ ...group, default_partner_naqib_member_id: nextPartnerId });
        setBanner({ tone: 'positive', message: 'Partner Naqib berjaya dikemaskini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menukar Partner Naqib.') });
      } finally {
        setPartnerBusy(false);
      }
    },
    [group, partnerBusy],
  );

  // --- Tambah mad'u ----------------------------------------------------------
  const [addingMadU, setAddingMadU] = useState(false);
  const [madUNama, setMadUNama] = useState('');
  const [madUTingkatan, setMadUTingkatan] = useState<string | null>(null);
  const [madUBusy, setMadUBusy] = useState(false);

  const openAddMadU = useCallback(() => {
    setBanner(null);
    setMadUNama('');
    setMadUTingkatan(null);
    setAddingMadU(true);
  }, []);

  const submitMadU = useCallback(async () => {
    if (!group || !madUNama.trim() || madUBusy) return;

    setMadUBusy(true);
    try {
      await addMadU(group.id, madUNama, madUTingkatan);
      setAddingMadU(false);
      await load();
      setBanner({ tone: 'positive', message: madUNama.trim() + " berjaya ditambah ke senarai mad'u." });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, "Gagal menambah mad'u.") });
    } finally {
      setMadUBusy(false);
    }
  }, [group, load, madUBusy, madUNama, madUTingkatan]);

  const [pendingRemoveMadU, setPendingRemoveMadU] = useState<UsrahMadU | null>(null);
  const [removeMadUBusy, setRemoveMadUBusy] = useState(false);

  const confirmRemoveMadU = useCallback(async () => {
    if (!pendingRemoveMadU || removeMadUBusy) return;

    const target = pendingRemoveMadU;
    setRemoveMadUBusy(true);
    try {
      await removeMadU(target.id);
      setPendingRemoveMadU(null);
      await load();
      setBanner({ tone: 'positive', message: target.nama + ' berjaya dibuang daripada senarai aktif.' });
    } catch (caught) {
      setPendingRemoveMadU(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, "Gagal membuang mad'u.") });
    } finally {
      setRemoveMadUBusy(false);
    }
  }, [load, pendingRemoveMadU, removeMadUBusy]);

  // --- Padam sesi ------------------------------------------------------------
  const [pendingRemoveSession, setPendingRemoveSession] = useState<UsrahSession | null>(null);
  const [removeSessionBusy, setRemoveSessionBusy] = useState(false);

  const confirmRemoveSession = useCallback(async () => {
    if (!pendingRemoveSession || removeSessionBusy) return;

    setRemoveSessionBusy(true);
    try {
      await deleteSession(pendingRemoveSession.id);
      setPendingRemoveSession(null);
      await load();
      setBanner({ tone: 'positive', message: 'Sesi berjaya dipadam.' });
    } catch (caught) {
      setPendingRemoveSession(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam sesi.') });
    } finally {
      setRemoveSessionBusy(false);
    }
  }, [load, pendingRemoveSession, removeSessionBusy]);

  // --- Padam/Arkib kumpulan ----------------------------------------------------
  const [confirmingRemoveGroup, setConfirmingRemoveGroup] = useState(false);
  const [removeGroupBusy, setRemoveGroupBusy] = useState(false);
  /*
    Kumpulan itu sendiri hilang/berubah selepas tindakan ini — teruskan
    memapar mad'u/sesi lampau tidak masuk akal. Papar keadaan pengesahan
    khusus dengan notis JELAS dan biarkan pengguna sendiri tekan kembali,
    dan bukan `goBack()` serta-merta (yang menghilangkan notis sebelum
    sempat dilihat).
  */
  const [groupRemoved, setGroupRemoved] = useState<'deleted' | 'archived' | null>(null);

  const confirmRemoveGroup = useCallback(async () => {
    if (!group || removeGroupBusy) return;

    setRemoveGroupBusy(true);
    try {
      const result = await deleteOrArchiveGroup(group.id);
      setConfirmingRemoveGroup(false);
      setGroupRemoved(result.outcome);
    } catch (caught) {
      setConfirmingRemoveGroup(false);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memadam/mengarkibkan kumpulan.') });
    } finally {
      setRemoveGroupBusy(false);
    }
  }, [group, removeGroupBusy]);

  if (permissionsLoading || accessLoading || loading) return <LoadingScreen />;

  if (groupRemoved) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kumpulan Usrah" onBackPress={goBack} />
        <View className="gap-6 px-gutter">
          <Notice
            tone="positive"
            message={groupRemoved === 'deleted' ? 'Kumpulan berjaya dipadam.' : 'Kumpulan berjaya diarkibkan.'}
          />
          <Button label="Kembali" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  if (!group) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kumpulan Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="alert-circle-outline"
            title="Kumpulan tidak dijumpai"
            description="Kumpulan ini mungkin tiada, atau anda tiada kebenaran melihatnya."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Panel Naqib" title={group.group_name} subtitle={group.sekolah} onBackPress={goBack} />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

          {/* --- Butiran kumpulan ------------------------------------------- */}
          <View>
            <SectionTitle title="Butiran Kumpulan" />
            <Card>
              <View className="gap-3">
                <Line label="Sekolah" value={group.sekolah} />
                {canEdit ? (
                  <MemberPickerField
                    label="Partner Naqib (cadangan)"
                    value={group.default_partner_naqib_member_id}
                    candidates={memberCandidates}
                    onChange={(next) => void changeDefaultPartner(next)}
                    placeholder="Tiada partner"
                    disabled={partnerBusy}
                  />
                ) : (
                  <Line label="Partner Naqib (cadangan)" value={partnerName(group.default_partner_naqib_member_id) ?? 'Tiada'} />
                )}
              </View>
            </Card>
          </View>

          {/* --- Mad'u ------------------------------------------------------- */}
          <View>
            <SectionTitle
              title={"Mad'u (" + madU.length + ')'}
              caption="Ahli usrah dalam kumpulan ini. Buang hanya menyembunyikan daripada senarai aktif — sejarah kehadiran kekal."
            />

            {canEdit ? (
              <View className="pb-3">
                <Button label="+ Tambah Mad'u" variant="secondary" onPress={openAddMadU} />
              </View>
            ) : null}

            {madU.length === 0 ? (
              <EmptyState icon="people-outline" title="Belum ada mad'u" description="Tambah mad'u pertama kumpulan ini." />
            ) : (
              <View className="gap-2">
                {madU.map((mu) => (
                  <View key={mu.id} className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">{mu.nama}</Text>
                      {mu.tingkatan ? <Text className="mt-0.5 text-sm text-ink-muted">{mu.tingkatan}</Text> : null}
                    </View>
                    {canEdit ? (
                      <IconButton
                        icon="person-remove-outline"
                        tone="danger"
                        accessibilityLabel={'Buang ' + mu.nama}
                        onPress={() => setPendingRemoveMadU(mu)}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* --- Sesi ---------------------------------------------------------- */}
          <View className="pb-8">
            <SectionTitle title={'Sesi (' + sessions.length + ')'} caption="Tersusun terkini dahulu." />

            {canEdit ? (
              <View className="pb-3">
                <Button
                  label="+ Sesi Baharu"
                  onPress={() =>
                    router.push({ pathname: '/(app)/admin/usrah-session-form', params: { groupId: group.id } })
                  }
                />
              </View>
            ) : null}

            {sessions.length === 0 ? (
              <EmptyState icon="calendar-outline" title="Belum ada sesi" description="Cipta sesi usrah pertama kumpulan ini." />
            ) : (
              <View className="gap-2">
                {sessions.map((s) => (
                  <View key={s.id} className="flex-row items-center gap-2 rounded-card border border-line bg-surface p-card">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({ pathname: '/(app)/admin/usrah-session-form', params: { groupId: group.id, id: s.id } })
                      }
                      className="flex-1 active:opacity-70">
                      <Text className="text-base font-semibold text-ink">{dateLabel(s.session_date)}</Text>
                      <Text className="mt-0.5 text-sm text-ink-muted">
                        {s.topik || 'Tiada topik'}
                        {s.location_text ? ' · ' + s.location_text : ''}
                      </Text>
                      {s.partner_naqib_member_id ? (
                        <Text className="mt-0.5 text-xs text-ink-faint">
                          Partner Naqib: {partnerName(s.partner_naqib_member_id)} · {s.partner_naqib_hadir ? 'Hadir' : 'Tidak Hadir'}
                        </Text>
                      ) : null}
                    </Pressable>
                    {canEdit ? (
                      <IconButton
                        icon="trash-outline"
                        tone="danger"
                        accessibilityLabel={'Padam sesi ' + dateLabel(s.session_date)}
                        onPress={() => setPendingRemoveSession(s)}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* --- Padam kumpulan -------------------------------------------- */}
          {canEdit ? (
            <View className="pb-8">
              <SectionTitle
                title="Zon Bahaya"
                caption={
                  sessions.length > 0
                    ? 'Kumpulan ini ada sejarah sesi — akan DIARKIBKAN (bukan dipadam terus) untuk kekalkan rekod.'
                    : 'Kumpulan ini kosong (tiada sesi) — boleh dipadam terus.'
                }
              />
              <Button
                label="Padam Kumpulan Ini"
                variant="danger"
                onPress={() => setConfirmingRemoveGroup(true)}
              />
            </View>
          ) : null}
        </View>
      </Screen>

      <FormModal
        visible={addingMadU}
        title="Tambah Mad'u"
        dismissable={!madUBusy}
        onClose={() => setAddingMadU(false)}
        footer={
          <Button label="Tambah" loading={madUBusy} disabled={madUBusy || !madUNama.trim()} onPress={() => void submitMadU()} />
        }>
        <TextField label="Nama" value={madUNama} onChangeText={setMadUNama} editable={!madUBusy} autoCapitalize="words" />
        <PickerField
          label="Tingkatan"
          value={madUTingkatan}
          options={withUnrecognised(TINGKATAN_OPTIONS, madUTingkatan)}
          onChange={setMadUTingkatan}
          disabled={madUBusy}
        />
      </FormModal>

      <ConfirmDialog
        visible={pendingRemoveMadU !== null}
        title="Buang mad'u?"
        message={(pendingRemoveMadU?.nama ?? '') + ' akan disembunyikan daripada senarai aktif. Sejarah kehadiran lampau KEKAL wujud.'}
        confirmLabel="Buang"
        destructive
        busy={removeMadUBusy}
        onConfirm={() => void confirmRemoveMadU()}
        onCancel={() => setPendingRemoveMadU(null)}
      />

      <ConfirmDialog
        visible={pendingRemoveSession !== null}
        title="Padam sesi ini?"
        message="Rekod kehadiran sesi ini akan turut dipadam. Tindakan ini tidak boleh dibatalkan."
        confirmLabel="Padam Sesi"
        destructive
        busy={removeSessionBusy}
        onConfirm={() => void confirmRemoveSession()}
        onCancel={() => setPendingRemoveSession(null)}
      />

      <ConfirmDialog
        visible={confirmingRemoveGroup}
        title={sessions.length > 0 ? 'Arkibkan kumpulan ini?' : 'Padam kumpulan ini?'}
        message={
          sessions.length > 0
            ? 'Kumpulan ini ada sejarah sesi, ia akan diarkibkan (bukan dipadam terus) untuk kekalkan rekod. Ia tidak akan muncul lagi dalam senarai aktif.'
            : 'Kumpulan ini kosong (tiada sesi) dan akan dipadam terus. Tindakan ini tidak boleh dibatalkan.'
        }
        confirmLabel={sessions.length > 0 ? 'Arkibkan Kumpulan' : 'Padam Kumpulan'}
        destructive
        busy={removeGroupBusy}
        onConfirm={() => void confirmRemoveGroup()}
        onCancel={() => setConfirmingRemoveGroup(false)}
      />
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
