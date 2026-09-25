import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { SelectRow } from '@/components/ui/select-row';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { ToastBanner } from '@/components/ui/toast';
import { usePerkaderanAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import {
  addMadU,
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
import { TINGKATAN_OPTIONS, type MemberPickerRow, type Option } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

function today(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/** Pilihan rasmi, ditambah nilai semasa sebagai "(tidak dikenali)" jika ia di luar senarai. */
function withUnrecognised(options: Option<string>[], current: string | null): Option<string>[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: current + ' (tidak dikenali)' }];
}

export default function UsrahSessionFormScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const { loading: permissionsLoading, isSuperAdmin } = usePermissions();
  const { loading: accessLoading, canEdit: departmentCanEdit } = usePerkaderanAccess();

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [sessionDate, setSessionDate] = useState(today());
  const [locationText, setLocationText] = useState('');
  const [topik, setTopik] = useState('');
  const [partnerNaqibId, setPartnerNaqibId] = useState<string | null>(null);
  const [partnerHadir, setPartnerHadir] = useState(true);
  const [candidates, setCandidates] = useState<AttendanceCandidate[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [memberCandidates, setMemberCandidates] = useState<MemberPickerRow[]>([]);

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [group, myMemberId, session, attendanceCandidates, pickerRows] = await Promise.all([
        fetchGroup(groupId),
        fetchMyMemberId(),
        id ? fetchSession(id) : Promise.resolve(null),
        fetchAttendanceCandidates(groupId, id ?? null),
        fetchMembersForPicker(),
      ]);

      setCanEdit(isSuperAdmin() || departmentCanEdit || Boolean(group && myMemberId && group.naqib_member_id === myMemberId));

      if (session) {
        setSessionDate(session.session_date);
        setLocationText(session.location_text ?? '');
        setTopik(session.topik ?? '');
        setPartnerNaqibId(session.partner_naqib_member_id);
        setPartnerHadir(session.partner_naqib_hadir);
      } else {
        // Sesi BAHARU — pra-isi partner dengan cadangan kumpulan, bukan sesi tertentu.
        setPartnerNaqibId(group?.default_partner_naqib_member_id ?? null);
        setPartnerHadir(true);
      }

      setCandidates(attendanceCandidates);
      setPresent(new Set(attendanceCandidates.filter((c) => c.hadir).map((c) => c.mad_u_id)));
      setMemberCandidates(pickerRows);
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
  }, [groupId, id, locationText, partnerHadir, partnerNaqibId, present, router, saving, sessionDate, topik]);

  // --- Tambah mad'u baharu terus dalam borang sesi ----------------------------
  const [addingMadU, setAddingMadU] = useState(false);
  const [madUNama, setMadUNama] = useState('');
  const [madUTingkatan, setMadUTingkatan] = useState<string | null>(null);
  const [madUBusy, setMadUBusy] = useState(false);

  const submitMadU = useCallback(async () => {
    if (!groupId || !madUNama.trim() || madUBusy) return;

    setMadUBusy(true);
    try {
      const created = await addMadU(groupId, madUNama, madUTingkatan);
      setCandidates((current) =>
        [...current, { mad_u_id: created.id, nama: created.nama, tingkatan: created.tingkatan, removed: false, hadir: true }].sort(
          (a, b) => a.nama.localeCompare(b.nama, 'ms', { sensitivity: 'base' }),
        ),
      );
      // Mad'u yang baru ditambah semasa sesi berlangsung — anggap hadir secara lalai, naqib boleh nyahtanda.
      setPresent((current) => new Set(current).add(created.id));
      setAddingMadU(false);
      setMadUNama('');
      setMadUTingkatan(null);
      setBanner({ tone: 'positive', message: created.nama + " berjaya ditambah ke senarai mad'u." });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, "Gagal menambah mad'u.") });
    } finally {
      setMadUBusy(false);
    }
  }, [groupId, madUBusy, madUNama, madUTingkatan]);

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

          <View className="gap-3">
            <DateTimeField label="Tarikh sesi" mode="date" value={sessionDate} onChange={setSessionDate} disabled={saving} />
            <TextField label="Lokasi" value={locationText} onChangeText={setLocationText} editable={!saving} autoCapitalize="sentences" />
            <TextField label="Topik" value={topik} onChangeText={setTopik} editable={!saving} autoCapitalize="sentences" />
          </View>

          <View>
            <SectionTitle title="Partner Naqib" caption="Untuk sesi ini sahaja — tidak menjejaskan sesi lain atau cadangan kumpulan." />
            <View className="gap-3">
              <MemberPickerField
                label="Partner Naqib"
                value={partnerNaqibId}
                candidates={memberCandidates}
                onChange={setPartnerNaqibId}
                placeholder="Tiada partner untuk sesi ini"
                disabled={saving}
              />
              {partnerNaqibId ? (
                <ToggleRow
                  icon="person-outline"
                  title="Partner Hadir"
                  subtitle="Matikan jika partner tidak hadir pada sesi ini."
                  value={partnerHadir}
                  onValueChange={setPartnerHadir}
                  disabled={saving}
                />
              ) : null}
            </View>
          </View>

          <View className="pb-8">
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <SectionTitle
                title={"Kehadiran Mad'u"}
                caption={
                  id
                    ? "Mad'u yang sudah dibuang tetapi ada rekod hadir pada sesi ini kekal dipapar."
                    : "Mad'u aktif kumpulan ini. Tambah mad'u dahulu jika senarai kosong."
                }
              />
            </View>

            <View className="pb-3">
              <Button
                label="+ Tambah Mad'u Baharu"
                variant="secondary"
                disabled={saving}
                onPress={() => {
                  setBanner(null);
                  setMadUNama('');
                  setMadUTingkatan(null);
                  setAddingMadU(true);
                }}
              />
            </View>

            {candidates.length === 0 ? (
              <EmptyState icon="people-outline" title="Tiada mad'u" description="Tambah mad'u menggunakan butang di atas." />
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
    </>
  );
}
