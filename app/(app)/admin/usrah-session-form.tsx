import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { ToastBanner } from '@/components/ui/toast';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchSilibus, type SilibusRow } from '@/lib/perkaderan-program';
import { useGoBack } from '@/lib/navigation';
import {
  createSession,
  fetchAttendanceCandidates,
  fetchGroup,
  fetchMyGroups,
  fetchMyMemberId,
  fetchSession,
  saveAttendance,
  updateSession,
  type AttendanceCandidate,
} from '@/lib/perkaderan';
import { usePermissions } from '@/lib/permissions';
import { TINGKATAN_OPTIONS, type UsrahGroup } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

function today(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export default function UsrahSessionFormScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { groupId: groupIdParam, id } = useLocalSearchParams<{ groupId?: string; id?: string }>();
  const { loading: permissionsLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit: departmentCanEdit } = usePerkaderanAccess();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [canEdit, setCanEdit] = useState(false);
  /** Kumpulan dipilih. Tanpa param `groupId` (naqib dari Hub), kumpulan dipilih daripada kumpulan sendiri. */
  const [groupId, setGroupId] = useState<string | undefined>(groupIdParam);
  const [myGroups, setMyGroups] = useState<UsrahGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<UsrahGroup | null>(null);

  const [sessionDate, setSessionDate] = useState(today());
  const [locationText, setLocationText] = useState('');
  const [topik, setTopik] = useState('');
  const [jenis, setJenis] = useState<'fikrah' | 'bonding'>('fikrah');
  const [silibusIds, setSilibusIds] = useState<string[]>([]);
  const [silibusTingkatan, setSilibusTingkatan] = useState<string | null>(null);
  const [silibus, setSilibus] = useState<SilibusRow[]>([]);
  const [refleksi, setRefleksi] = useState('');
  const [partnerNaqibId, setPartnerNaqibId] = useState<string | null>(null);
  const [partnerHadir, setPartnerHadir] = useState(true);
  const [candidates, setCandidates] = useState<AttendanceCandidate[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) {
      try {
        const mine = await fetchMyGroups();
        setMyGroups(mine);
        if (mine[0]) setGroupId(mine[0].id);
        else setLoading(false);
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan kumpulan.') });
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      if (!id && myGroups.length === 0) setMyGroups(await fetchMyGroups());
      const [group, myMemberId, session, attendanceCandidates] = await Promise.all([
        fetchGroup(groupId),
        fetchMyMemberId(),
        id ? fetchSession(id) : Promise.resolve(null),
        fetchAttendanceCandidates(groupId, id ?? null),
      ]);

      setCurrentGroup(group);
      setCanEdit(
        isSuperAdmin() ||
          departmentCanEdit ||
          Boolean(group && myMemberId && (group.naqib_member_id === myMemberId || group.default_partner_naqib_member_id === myMemberId || (group.naqib_tambahan ?? []).includes(myMemberId))),
      );

      if (session) {
        setSessionDate(session.session_date);
        setLocationText(session.location_text ?? '');
        setTopik(session.topik ?? '');
        setJenis(session.jenis ?? 'fikrah');
        setSilibusIds(session.silibus_ids ?? []);
        setRefleksi(session.refleksi ?? '');
        setPartnerNaqibId(session.partner_naqib_member_id);
        setPartnerHadir(session.partner_naqib_hadir);
      } else {
        // Sesi BAHARU — partner tidak lagi dipilih daripada borang (ditetapkan Lajnah pada kumpulan).
        setPartnerNaqibId(null);
        setPartnerHadir(true);
      }

      setCandidates(attendanceCandidates);
      const sedia = attendanceCandidates.map((c) => c.tingkatan).find(Boolean) ?? null;
      setSilibusTingkatan(group?.tingkatan ?? sedia);
      setPresent(new Set(attendanceCandidates.filter((c) => c.hadir).map((c) => c.mad_u_id)));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan sesi.') });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentCanEdit, groupId, id, isSuperAdmin]);

  useEffect(() => {
    if (permissionsLoading || accessLoading) return;
    void load();
  }, [accessLoading, load, permissionsLoading]);

  const toggle = useCallback((madUId: string) => {
    setPresent((current) => {
      const next = new Set(current);
      if (next.has(madUId)) next.delete(madUId);
      else next.add(madUId);
      return next;
    });
  }, []);

  /*
    Kekal pada skrin ini selepas simpan (bukan `goBack()` serta-merta) —
    admin/naqib patut nampak notis kejayaan yang jelas dengan mata sendiri.
    Sesi BAHARU: `router.setParams` menukar skrin ini kepada mod SUNTING bagi
    sesi yang baru dicipta (tanpa navigasi), supaya tekan "Simpan" sekali lagi
    mengemas kini baris SAMA dan bukan mencipta pendua.
  */
  const save = useCallback(async () => {
    if (!groupId || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      const input = {
        session_date: sessionDate,
        location_text: locationText.trim() || null,
        topik: topik.trim() || null,
        jenis,
        silibus_ids: jenis === 'fikrah' ? silibusIds : [],
        refleksi: refleksi.trim() || null,
        partner_naqib_member_id: partnerNaqibId,
        partner_naqib_hadir: partnerHadir,
      };
      const wasCreate = !id;
      const savedSession = id ? await updateSession(id, input) : await createSession(groupId, input);
      await saveAttendance(savedSession.id, [...present]);
      if (wasCreate) router.setParams({ id: savedSession.id });
      setBanner({ tone: 'positive', message: wasCreate ? 'Sesi berjaya direkod.' : 'Perubahan berjaya disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan sesi.') });
    } finally {
      setSaving(false);
    }
  }, [groupId, id, jenis, locationText, partnerHadir, partnerNaqibId, present, refleksi, router, saving, sessionDate, silibusIds, topik]);

  useEffect(() => {
    if (!silibusTingkatan) return;
    let active = true;
    fetchSilibus(silibusTingkatan)
      .then((rows) => active && setSilibus(rows))
      .catch(() => active && setSilibus([]));
    return () => {
      active = false;
    };
  }, [silibusTingkatan]);

  const toggleSilibus = useCallback((silibusId: string) => {
    setSilibusIds((current) => (current.includes(silibusId) ? current.filter((x) => x !== silibusId) : [...current, silibusId]));
  }, []);

  const semuaHadir = candidates.length > 0 && candidates.every((c) => present.has(c.mad_u_id));
  const setSemuaHadir = useCallback(
    (next: boolean) => setPresent(next ? new Set(candidates.map((c) => c.mad_u_id)) : new Set()),
    [candidates],
  );

  const hadirCount = present.size;
  const title = useMemo(() => (id ? 'Sunting Sesi' : 'Sesi Baharu'), [id]);

  if (permissionsLoading || accessLoading || loading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title={title} onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Menyunting sesi memerlukan kebenaran edit LAJNAH PERKADERAN atau menjadi naqib kumpulan ini."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Panel Naqib" title={title} subtitle={hadirCount + " mad'u hadir ditanda"} onBackPress={goBack} />

        <View className="gap-6 px-gutter pt-6">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {currentGroup ? (
            <View className="gap-3">
              {!id && myGroups.length > 1 ? (
                <PickerField
                  label="Kumpulan"
                  value={groupId ?? null}
                  options={myGroups.map((g) => ({
                    value: g.id,
                    label: [g.sekolah, g.tingkatan ? g.tingkatan.replace('Tingkatan ', 'T') : null, g.no_kumpulan ? 'K' + g.no_kumpulan : null]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                  onChange={(next) => {
                    if (next && next !== groupId) {
                      setPresent(new Set());
                      setSilibusIds([]);
                      setGroupId(next);
                    }
                  }}
                  disabled={saving}
                />
              ) : null}
              <View className="flex-row flex-wrap gap-x-6 gap-y-1 rounded-card border border-line bg-surface p-card">
                <Text className="text-sm text-ink-muted">Sekolah: <Text className="font-semibold text-ink">{currentGroup.sekolah}</Text></Text>
                <Text className="text-sm text-ink-muted">Tingkatan: <Text className="font-semibold text-ink">{currentGroup.tingkatan ?? '-'}</Text></Text>
                <Text className="text-sm text-ink-muted">Kumpulan: <Text className="font-semibold text-ink">{currentGroup.no_kumpulan ?? '-'}</Text></Text>
              </View>
            </View>
          ) : null}

          <View className="gap-3">
            <DateTimeField label="Tarikh sesi" mode="date" value={sessionDate} onChange={setSessionDate} disabled={saving} />
            <TextField label="Lokasi" value={locationText} onChangeText={setLocationText} editable={!saving} autoCapitalize="sentences" />
            <Segmented
              label="Jenis sesi"
              value={jenis}
              options={[
                { value: 'fikrah', label: 'Fikrah' },
                { value: 'bonding', label: 'Bonding' },
              ]}
              onChange={setJenis}
              disabled={saving}
            />
            {jenis === 'fikrah' ? (
              <View className="gap-2">
                <PickerField
                  label="Silibus Fikrah (tingkatan)"
                  value={silibusTingkatan}
                  options={TINGKATAN_OPTIONS}
                  onChange={setSilibusTingkatan}
                  disabled={saving}
                />
                {silibus.length === 0 ? (
                  <Text className="text-xs text-ink-muted">Senarai silibus belum ditetapkan. Tulis topik di bawah, atau minta admin Lajnah isi silibus.</Text>
                ) : (
                  silibus.map((row) => (
                    <SelectRow
                      key={row.id}
                      title={'F' + row.urutan + ' · ' + row.tajuk}
                      selected={silibusIds.includes(row.id)}
                      disabled={saving}
                      onPress={() => toggleSilibus(row.id)}
                    />
                  ))
                )}
                <Text className="text-xs text-ink-muted">Pilih lebih daripada satu jika dua silibus digabungkan dalam satu sesi.</Text>
              </View>
            ) : null}
            <TextField label="Topik / catatan tajuk (pilihan)" value={topik} onChangeText={setTopik} editable={!saving} autoCapitalize="sentences" />
            <TextField
              label="Ulasan / refleksi naqib"
              value={refleksi}
              onChangeText={setRefleksi}
              editable={!saving}
              multiline
              autoCapitalize="sentences"
            />
          </View>

          <View className="pb-8">
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <SectionTitle
                title={"Kehadiran Mad'u"}
                caption={
                  id
                    ? "Mad'u yang sudah dibuang tetapi ada rekod hadir pada sesi ini kekal dipapar."
                    : "Mad'u aktif kumpulan ini."
                }
              />
            </View>


            {candidates.length > 0 ? (
              <View className="pb-3">
                <ToggleRow
                  icon="checkmark-done-outline"
                  title="Semua hadir"
                  subtitle="Hidupkan untuk tanda semua. Kemudian nyahtanda nama yang tidak hadir."
                  value={semuaHadir}
                  onValueChange={setSemuaHadir}
                  disabled={saving}
                />
              </View>
            ) : null}

            {candidates.length === 0 ? (
              <EmptyState icon="people-outline" title="Tiada mad'u" description="Lajnah Perkaderan akan menetapkan mad'u kumpulan ini." />
            ) : (
              <View className="gap-2">
                {candidates.map((candidate) => (
                  <SelectRow
                    key={candidate.mad_u_id}
                    title={candidate.nama}
                    subtitle={candidate.tingkatan ?? undefined}
                    selected={present.has(candidate.mad_u_id)}
                    disabled={saving}
                    onPress={() => toggle(candidate.mad_u_id)}>
                    {candidate.removed ? <Badge label="Sudah dibuang daripada senarai aktif" tone="warn" /> : null}
                  </SelectRow>
                ))}
              </View>
            )}
          </View>

          <View className="pb-8">
            <Button label="Simpan Sesi" loading={saving} disabled={saving} onPress={() => void save()} />
          </View>
        </View>
      </Screen>

    </>
  );
}
