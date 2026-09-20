import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AchievementBadge } from '@/components/achievement-badge';
import { MemberForm, type ProfileTab } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { BIRTHDAY_GOLD, Colors } from '@/constants/theme';
import { fetchMyActivityRank, type MyActivityRank } from '@/lib/activity-rank';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { displayName, useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations, fetchMembersForPicker, fetchMyMember, fetchMyMemberLinked, updateMember } from '@/lib/members';
import { MONTH_NAMES, type Generation, type Member, type MemberPickerRow } from '@/types/database';

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

  const [member, setMember] = useState<Member | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [spouseCandidates, setSpouseCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  // Di sini dan bukan dalam borang: borang dipasang semula selepas setiap simpanan.
  const [tab, setTab] = useState<ProfileTab>('diri');

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
    async (patch: Partial<Member>) => {
      if (!member || saving) return;

      setBanner(null);
      setSaving(true);
      try {
        await updateMember(member.id, patch);
        const fresh = userId ? await fetchMyMember(userId) : null;
        setMember(fresh ?? member);
        setVersion((current) => current + 1);
        setBanner({ tone: 'positive', message: 'Profil anda telah dikemas kini.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan profil.') });
      } finally {
        setSaving(false);
      }
    },
    [member, saving, userId],
  );

  if (loading) return <LoadingScreen />;

  // Nombor ahli dan generasi tidak lagi di kepala skrin: generasi kini dalam
  // kepala profil borang, dan nombor ahli sengaja tidak dipapar kepada ahli.
  const header = <ScreenHeader title="Profil" />;

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
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <MemberForm
          key={member.id + ':' + version}
          member={member}
          generations={generations}
          spouseCandidates={spouseCandidates}
          canEditAdminColumns={false}
          busy={saving}
          headerAside={rank ? <AchievementBadge rank={rank} /> : undefined}
          headerNote={
            <SelfUpdateStatus value={member.self_updated_at} onPress={() => setTab('diri')} />
          }
          onPickAvatar={() => void changeAvatar()}
          avatarBusy={avatarBusy}
          tabs={{ value: tab, onChange: setTab }}
          onSave={(patch) => void save(patch)}
        />
      </View>
    </Screen>
  );
}

/** "hari ini" / "semalam" / "3 hari lalu" dalam seminggu; selepas itu tarikh penuh. */
function formatSelfUpdated(iso: string): string {
  const then = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86_400_000);

  if (days <= 0) return 'hari ini';
  if (days === 1) return 'semalam';
  if (days < 7) return `${days} hari lalu`;
  return `${then.getDate()} ${MONTH_NAMES[then.getMonth()]} ${then.getFullYear()}`;
}

/*
  Dua bentuk dengan berat visual berbeza. Sudah pernah dikemas kini: satu baris
  kelabu, maklumat sahaja. Belum pernah: jalur emas lembut yang boleh ditekan —
  galakan, bukan ralat, jadi bukan merah. Ia duduk betul-betul di atas tab, jadi
  menekannya cukup dengan membuka tab "Maklumat Diri" di bawahnya.
*/
function SelfUpdateStatus({ value, onPress }: { value: string | null; onPress: () => void }) {
  if (value) {
    return (
      <View className="flex-row items-center justify-center gap-1.5">
        <Ionicons name="time-outline" size={14} color={Colors.inkFaint} />
        <Text className="text-xs text-ink-muted">Kemaskini terakhir: {formatSelfUpdated(value)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-pill px-4 py-2.5 active:opacity-70"
      style={{ backgroundColor: Colors.warnSoft }}>
      <Ionicons name="create-outline" size={16} color={BIRTHDAY_GOLD} />
      <Text className="flex-1 text-sm font-semibold text-ink">Sila kemaskini maklumat diri anda</Text>
      <Ionicons name="chevron-forward" size={16} color={BIRTHDAY_GOLD} />
    </Pressable>
  );
}
