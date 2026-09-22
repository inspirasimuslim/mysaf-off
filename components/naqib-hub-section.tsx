import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionRow } from '@/components/ui/action-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { SelectRow } from '@/components/ui/select-row';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { deleteSession, fetchMyGroups, fetchMySessionsAcrossGroups, fetchSessionViewDetail } from '@/lib/perkaderan';
import type { MemberPickerRow, MySessionRow, SessionViewDetail, UsrahGroup } from '@/types/database';

/** 'YYYY-MM-DD' → '12 Sep 2026'. */
function dateLabel(value: string): string {
  const parsed = new Date(value + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Seksyen "Kumpulan Usrah Saya" di Hub Admin — panel naqib sendiri.
 *
 * Diasingkan daripada `admin/index.tsx` (bukan sekadar disatukan di situ)
 * kerana seksyen ini membawa keadaannya sendiri yang cukup besar (kumpulan,
 * sesi lampau merentasi kumpulan, modal butiran view-only, carian nama
 * partner) — mencampurkannya terus ke dalam Hub akan menenggelamkan skrin
 * yang sepatutnya hanya menyusun kad.
 */
export function NaqibHubSection({ defaultOpen }: { defaultOpen: boolean }) {
  const router = useRouter();

  const [myGroups, setMyGroups] = useState<UsrahGroup[]>([]);
  const [mySessions, setMySessions] = useState<MySessionRow[]>([]);
  const [memberCandidates, setMemberCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);

  /*
    `useFocusEffect` dan bukan `useEffect` sahaja — Hub kekal dalam stack
    React Navigation, jadi seksyen ini mesti segar semula setiap kali naqib
    kembali selepas mencipta kumpulan/sesi di skrin lain. Lihat nota sejarah
    bug "sentiasa landing ke Cipta Kumpulan Baru" di `admin/index.tsx`.
  */
  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchMyGroups(), fetchMySessionsAcrossGroups(), fetchMembersForPicker()])
      .then(([groups, sessions, candidates]) => {
        if (!active) return;
        setMyGroups(groups);
        setMySessions(sessions);
        setMemberCandidates(candidates);
      })
      .catch(() => {
        if (!active) return;
        setMyGroups([]);
        setMySessions([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  const partnerName = useCallback(
    (memberId: string | null) => (memberId ? memberCandidates.find((row) => row.id === memberId)?.full_name ?? 'Ahli' : null),
    [memberCandidates],
  );

  // --- "Kumpulan Sedia Ada" — pilih kumpulan (jika >1), kemudian Urus/Tambah Sesi ---
  const [pickingGroup, setPickingGroup] = useState(false);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);

  const openManageFlow = useCallback(() => {
    const onlyGroup = myGroups.length === 1 ? myGroups[0] : undefined;
    if (onlyGroup) {
      setManageGroupId(onlyGroup.id);
      return;
    }
    setPickingGroup(true);
  }, [myGroups]);

  const pickGroupForManage = useCallback((groupId: string) => {
    setPickingGroup(false);
    setManageGroupId(groupId);
  }, []);

  // --- Butiran sesi lampau (VIEW-ONLY, + Padam Sesi) --------------------------
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<SessionViewDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const openSessionView = useCallback(async (sessionId: string) => {
    setViewingSessionId(sessionId);
    setViewDetail(null);
    setViewError(null);
    setViewLoading(true);
    try {
      setViewDetail(await fetchSessionViewDetail(sessionId));
    } catch (caught) {
      setViewError(toMalayErrorVerbose(caught, 'Gagal memuatkan butiran sesi.'));
    } finally {
      setViewLoading(false);
    }
  }, []);

  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState(false);
  const [deleteSessionBusy, setDeleteSessionBusy] = useState(false);
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);

  /** Notis seksyen ini sendiri — modal butiran sesi tertutup selepas padam, jadi notis ralatnya sendiri tidak lagi kelihatan. */
  const [sectionBanner, setSectionBanner] = useState<{ tone: 'positive' | 'negative'; message: string } | null>(null);

  const confirmDeleteSession = useCallback(async () => {
    if (!viewingSessionId || deleteSessionBusy) return;

    setDeleteSessionBusy(true);
    setDeleteSessionError(null);
    try {
      await deleteSession(viewingSessionId);
      setConfirmingDeleteSession(false);
      setViewingSessionId(null);
      setSectionBanner({ tone: 'positive', message: 'Sesi berjaya dipadam.' });
      load();
    } catch (caught) {
      setDeleteSessionError(toMalayErrorVerbose(caught, 'Gagal memadam sesi.'));
    } finally {
      setDeleteSessionBusy(false);
    }
  }, [deleteSessionBusy, load, viewingSessionId]);

  if (loading) return null;

  const hasGroups = myGroups.length > 0;
  const manageGroup = myGroups.find((group) => group.id === manageGroupId) ?? null;

  return (
    <>
      {/*
        Panel Naqib — BUKAN kebenaran department. Naqib aktif yang bukan admin
        department mana-mana pun tetap perlukan pintu ini supaya Hub tidak
        kosong; naqib yang turut memegang department lain tetap melihatnya
        sebagai laluan pantas ke kumpulan sendiri.
      */}
      <CollapsibleSection
        variant="plain"
        title="Kumpulan Usrah Saya"
        caption="Kumpulan usrah sekolah yang anda naqibkan."
        count={hasGroups ? myGroups.length : 1}
        defaultOpen={defaultOpen}>
        {sectionBanner ? (
          <View className="mb-3">
            <Notice tone={sectionBanner.tone} message={sectionBanner.message} />
          </View>
        ) : null}

        {!hasGroups ? (
          // Naqib baharu — tiada apa untuk diurus pun, terus ke Cipta.
          <ActionRow
            icon="add-circle-outline"
            title="Cipta Kumpulan Usrah"
            subtitle="Pilih sekolah dan tambah mad'u"
            onPress={() => router.push('/(app)/admin/usrah-group-create')}
          />
        ) : (
          <View className="gap-3">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label="Kumpulan Sedia Ada"
                  size="sm"
                  onPress={openManageFlow}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="+ Kumpulan Baru"
                  size="sm"
                  variant="secondary"
                  onPress={() => router.push('/(app)/admin/usrah-group-create')}
                />
              </View>
            </View>

            <View className="gap-1.5">
              {myGroups.map((group) => (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(app)/admin/perkaderan-group-detail', params: { id: group.id } })}
                  className="flex-row items-center justify-between gap-2 rounded-field border border-line bg-surface px-3 py-2.5 active:opacity-70">
                  <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                    {group.sekolah}
                  </Text>
                  <Text className="text-xs text-ink-faint">Urus →</Text>
                </Pressable>
              ))}
            </View>

            {mySessions.length > 0 ? (
              <View>
                <Text className="mb-1.5 text-xs font-semibold uppercase text-ink-faint">
                  Sesi Lampau ({mySessions.length})
                </Text>
                <View className="gap-1.5">
                  {mySessions.map((session) => (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      onPress={() => void openSessionView(session.id)}
                      className="flex-row items-center justify-between gap-2 rounded-field border border-line bg-surface px-3 py-2.5 active:opacity-70">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink">{dateLabel(session.session_date)}</Text>
                        <Text className="mt-0.5 text-xs text-ink-muted" numberOfLines={1}>
                          {session.sekolah}
                          {session.location_text ? ' · ' + session.location_text : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </CollapsibleSection>

      {/* Langkah 1 (hanya jika >1 kumpulan): pilih kumpulan mana yang diurus. */}
      <FormModal
        visible={pickingGroup}
        title="Pilih Kumpulan"
        description="Kumpulan mana yang mahu diurus?"
        onClose={() => setPickingGroup(false)}>
        <View className="gap-3">
          {myGroups.map((group) => (
            <SelectRow
              key={group.id}
              title={group.group_name}
              subtitle={group.sekolah}
              selected={false}
              onPress={() => pickGroupForManage(group.id)}
            />
          ))}
        </View>
      </FormModal>

      {/* Langkah 2: kumpulan sudah ditentukan (auto jika cuma satu) — dua pilihan. */}
      <FormModal
        visible={manageGroupId !== null}
        title={manageGroup?.group_name ?? 'Kumpulan'}
        description="Apa yang mahu dilakukan untuk kumpulan ini?"
        onClose={() => setManageGroupId(null)}>
        <View className="gap-3">
          <Button
            label="Urus Kumpulan"
            onPress={() => {
              const id = manageGroupId;
              setManageGroupId(null);
              if (id) router.push({ pathname: '/(app)/admin/perkaderan-group-detail', params: { id } });
            }}
          />
          <Button
            label="Tambah Sesi Baharu"
            variant="secondary"
            onPress={() => {
              const id = manageGroupId;
              setManageGroupId(null);
              if (id) router.push({ pathname: '/(app)/admin/usrah-session-form', params: { groupId: id } });
            }}
          />
        </View>
      </FormModal>

      {/*
        VIEW-ONLY — tiada butang sunting/simpan sengaja, kecuali Padam Sesi
        (memadam, bukan menyunting). Menyunting sesi lampau kekal melalui
        laluan sedia ada: "Kumpulan Sedia Ada" -> Urus/Tambah Sesi.
      */}
      <FormModal
        visible={viewingSessionId !== null}
        title={viewDetail ? dateLabel(viewDetail.session.session_date) : 'Butiran Sesi'}
        description={viewDetail ? viewDetail.sekolah + (viewDetail.session.location_text ? ' · ' + viewDetail.session.location_text : '') : undefined}
        onClose={() => setViewingSessionId(null)}
        footer={
          viewDetail ? (
            <Button
              label="Padam Sesi Ini"
              variant="danger"
              onPress={() => {
                setDeleteSessionError(null);
                setConfirmingDeleteSession(true);
              }}
            />
          ) : undefined
        }>
        {viewLoading ? (
          <LoadingScreen />
        ) : viewError ? (
          <Text className="text-sm text-negative">{viewError}</Text>
        ) : viewDetail ? (
          <View className="gap-4">
            {deleteSessionError ? <Notice tone="negative" message={deleteSessionError} /> : null}

            {viewDetail.session.topik ? (
              <View>
                <Text className="text-xs font-semibold uppercase text-ink-faint">Topik</Text>
                <Text className="mt-1 text-base text-ink">{viewDetail.session.topik}</Text>
              </View>
            ) : null}

            {viewDetail.session.partner_naqib_member_id ? (
              <View>
                <Text className="text-xs font-semibold uppercase text-ink-faint">Partner Naqib</Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <Text className="text-base text-ink">{partnerName(viewDetail.session.partner_naqib_member_id)}</Text>
                  <Badge
                    label={viewDetail.session.partner_naqib_hadir ? 'Hadir' : 'Tidak Hadir'}
                    tone={viewDetail.session.partner_naqib_hadir ? 'positive' : 'neutral'}
                  />
                </View>
              </View>
            ) : null}

            <View>
              <Text className="text-xs font-semibold uppercase text-ink-faint">
                {"Mad'u Hadir (" + viewDetail.attendees.length + ')'}
              </Text>
              {viewDetail.attendees.length === 0 ? (
                <Text className="mt-1 text-sm text-ink-muted">{"Tiada mad'u hadir direkodkan."}</Text>
              ) : (
                <View className="mt-2 gap-1.5">
                  {viewDetail.attendees.map((attendee, index) => (
                    <View key={index} className="rounded-field border border-line bg-surface px-3 py-2">
                      <Text className="text-sm font-semibold text-ink">{attendee.nama}</Text>
                      {attendee.tingkatan ? <Text className="text-xs text-ink-muted">{attendee.tingkatan}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </FormModal>

      <ConfirmDialog
        visible={confirmingDeleteSession}
        title="Padam sesi ini?"
        message="Rekod kehadiran sesi ini akan turut dipadam. Tindakan ini tidak boleh dibatalkan."
        confirmLabel="Padam Sesi"
        destructive
        busy={deleteSessionBusy}
        onConfirm={() => void confirmDeleteSession()}
        onCancel={() => setConfirmingDeleteSession(false)}
      />
    </>
  );
}
