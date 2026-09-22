import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  createSession,
  fetchAttendanceCandidates,
  fetchGroup,
  fetchMyMemberId,
  fetchSession,
  saveAttendance,
  updateSession,
  type AttendanceCandidate,
} from '@/lib/perkaderan';
import { usePermissions } from '@/lib/permissions';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

function today(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export default function UsrahSessionFormScreen() {
  const goBack = useGoBack();
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const { loading: permissionsLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit: departmentCanEdit } = usePerkaderanAccess();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [sessionDate, setSessionDate] = useState(today());
  const [locationText, setLocationText] = useState('');
  const [topik, setTopik] = useState('');
  const [candidates, setCandidates] = useState<AttendanceCandidate[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [group, myMemberId, session, attendanceCandidates] = await Promise.all([
        fetchGroup(groupId),
        fetchMyMemberId(),
        id ? fetchSession(id) : Promise.resolve(null),
        fetchAttendanceCandidates(groupId, id ?? null),
      ]);

      setCanEdit(isSuperAdmin() || departmentCanEdit || Boolean(group && myMemberId && group.naqib_member_id === myMemberId));

      if (session) {
        setSessionDate(session.session_date);
        setLocationText(session.location_text ?? '');
        setTopik(session.topik ?? '');
      }

      setCandidates(attendanceCandidates);
      setPresent(new Set(attendanceCandidates.filter((c) => c.hadir).map((c) => c.mad_u_id)));
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan sesi.') });
    } finally {
      setLoading(false);
    }
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

  const save = useCallback(async () => {
    if (!groupId || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      const input = { session_date: sessionDate, location_text: locationText.trim() || null, topik: topik.trim() || null };
      const savedSession = id ? await updateSession(id, input) : await createSession(groupId, input);
      await saveAttendance(savedSession.id, [...present]);
      goBack();
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menyimpan sesi.') });
    } finally {
      setSaving(false);
    }
  }, [goBack, groupId, id, locationText, present, saving, sessionDate, topik]);

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
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Panel Naqib" title={title} subtitle={hadirCount + " mad'u hadir ditanda"} onBackPress={goBack} />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <View className="gap-3">
          <DateTimeField label="Tarikh sesi" mode="date" value={sessionDate} onChange={setSessionDate} disabled={saving} />
          <TextField label="Lokasi" value={locationText} onChangeText={setLocationText} editable={!saving} autoCapitalize="sentences" />
          <TextField label="Topik" value={topik} onChangeText={setTopik} editable={!saving} autoCapitalize="sentences" />
        </View>

        <View className="pb-8">
          <SectionTitle
            title={"Kehadiran Mad'u"}
            caption={
              id
                ? "Mad'u yang sudah dibuang tetapi ada rekod hadir pada sesi ini kekal dipapar."
                : "Mad'u aktif kumpulan ini. Tambah mad'u dahulu di skrin kumpulan jika senarai kosong."
            }
          />

          {candidates.length === 0 ? (
            <EmptyState icon="people-outline" title="Tiada mad'u" description="Tambah mad'u di skrin kumpulan dahulu." />
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
  );
}
