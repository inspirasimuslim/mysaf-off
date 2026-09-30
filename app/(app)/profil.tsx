import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AchievementBadge } from '@/components/achievement-badge';
import { MemberForm, type ProfileTab } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { SelfUpdateStatus } from '@/components/self-update-status';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { ToastBanner } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { fetchMyActivityRank, type MyActivityRank } from '@/lib/activity-rank';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { displayName, useAuth } from '@/lib/auth-context';
import { useGoBack } from '@/lib/navigation';
import { toMalayError } from '@/lib/errors';
import { fetchMemberBusinesses, saveMemberBusinesses } from '@/lib/member-businesses';
import { fetchMemberEducation, saveMemberEducation } from '@/lib/member-education';
import { fetchOrgChart, jawatanForMember } from '@/lib/org-chart';
import { fetchGenerations, fetchMembersForPicker, fetchMyMember, fetchMyMemberLinked, updateMember } from '@/lib/members';
import { fetchAllSchools } from '@/lib/schools';
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

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

/**
 * Profil ahli sendiri.
 *
 * Borang yang sama seperti panel Admin digunakan semula, cuma
 * `canEditAdminColumns` ditetapkan `false` — nombor ahli, generasi, emel dan
 * status sekatan menjadi paparan sahaja. Sekatan sebenar tetap datang daripada
 * trigger `members_guard_admin_columns` di Supabase.
 */
export default function ProfilScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const goBack = useGoBack();
  const [member, setMember] = useState<Member | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [spouseCandidates, setSpouseCandidates] = useState<MemberPickerRow[]>([]);
  const [businesses, setBusinesses] = useState<MemberBusiness[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [education, setEducation] = useState<MemberEducation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  // Di sini dan bukan dalam borang: borang dipasang semula selepas setiap simpanan.
  const [tab, setTab] = useState<ProfileTab>('peribadi');
  const [jawatan, setJawatan] = useState<string | null>(null);

  /*
    Kedudukan dibaca berasingan daripada profil, dan kegagalannya SENYAP.
    Lencana ialah maklumat tambahan; profil masih boleh disunting tanpanya, jadi
    ralat di sini tidak patut menutup borang atau memaparkan notis merah.
    `null` (akaun belum dipautkan) dan kegagalan bacaan berakhir sama — lencana
    tidak dipapar langsung, bukan dipapar kosong.
  */
  const [rank, setRank] = useState<MyActivityRank | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void (async () => {
      try {
        const row = await fetchMyActivityRank();
        if (active) setRank(row);
      } catch {
        if (active) setRank(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const [row, gens] = await Promise.all([fetchMyMemberLinked(userId), fetchGenerations()]);
        if (!active) return;
        setMember(row);
        setGenerations(gens);
        setError(null);

        // Kegagalan di sini tidak boleh menyekat paparan profil — kesannya
        // hanya pemilih pasangan turun kepada senarai kosong.
        try {
          const candidates = await fetchMembersForPicker();
          if (active) setSpouseCandidates(candidates);
        } catch {
          if (active) setSpouseCandidates([]);
        }

        // Sama falsafah: tab Perniagaan mula kosong jika gagal, bukan menyekat profil.
        try {
          const rows = row ? await fetchMemberBusinesses(row.id) : [];
          if (active) setBusinesses(rows);
        } catch {
          if (active) setBusinesses([]);
        }

        // Jawatan daripada carta organisasi — kegagalan hanya bermakna baris jawatan tidak dipaparkan.
        try {
          const chart = row ? await fetchOrgChart() : [];
          if (active) setJawatan(row ? jawatanForMember(chart, row.id) : null);
        } catch {
          if (active) setJawatan(null);
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
        if (active) setError(toMalayError(caught, 'Gagal memuatkan profil anda.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);


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

        const fresh = userId ? await fetchMyMember(userId) : null;
        setMember(fresh ?? member);
        setBusinesses(await fetchMemberBusinesses(member.id));
        setEducation(await fetchMemberEducation(member.id));
        setVersion((current) => current + 1);
        setBanner({ tone: 'positive', message: 'Profil anda telah dikemas kini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan profil.') });
      } finally {
        setSaving(false);
      }
    },
    [businesses, education, member, saving, userId],
  );

  if (loading) return <LoadingScreen />;

  // Nombor ahli dan generasi tidak lagi di kepala skrin: generasi kini dalam
  // kepala profil borang, dan nombor ahli sengaja tidak dipapar kepada ahli.
  const header = <ScreenHeader title="Profil" onBackPress={goBack} />;

  // --- Akaun belum dikaitkan ke mana-mana rekod ahli -------------------------
  if (!member) {
    return (
      <Screen padTop={false}>
        {header}

        <View className="gap-6 px-gutter pt-6">
          {error ? <Notice tone="negative" message={error} /> : null}

          <Card>
            <View className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-pill bg-primary-soft">
                <Ionicons name="person" size={24} color={Colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-ink">{displayName(user)}</Text>
                <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
                  {user?.email ?? 'Tiada emel'}
                </Text>
              </View>
            </View>
          </Card>

          <EmptyState
            icon="link-outline"
            title="Profil belum dikaitkan"
            description="Emel akaun ini tidak sepadan dengan mana-mana rekod ahli yang belum dikaitkan. Hubungi admin untuk mengaitkannya."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      {header}

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        <MemberForm
          key={member.id + ':' + version}
          member={member}
          generations={generations}
          spouseCandidates={spouseCandidates}
          businesses={businesses}
          schools={schools}
          education={education}
          canEditAdminColumns={false}
          jawatan={jawatan}
          busy={saving}
          headerAside={rank ? <AchievementBadge rank={rank} /> : undefined}
          headerNote={
            <SelfUpdateStatus value={member.self_updated_at} onPress={() => setTab('peribadi')} />
          }
          onPickAvatar={() => void changeAvatar()}
          avatarBusy={avatarBusy}
          tabs={{ value: tab, onChange: setTab }}
          onSave={(patch, businessesDraft, educationDraft) => void save(patch, businessesDraft, educationDraft)}
        />
      </View>
    </Screen>
  );
}

