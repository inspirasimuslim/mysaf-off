import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AchievementBadge } from '@/components/achievement-badge';
import { MemberForm, type ProfileTab } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { fetchMyActivityRank, type MyActivityRank } from '@/lib/activity-rank';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { displayName, useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations, fetchMyMember, fetchMyMemberLinked, updateMember } from '@/lib/members';
import type { Generation, Member } from '@/types/database';

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
          canEditAdminColumns={false}
          busy={saving}
          headerAside={rank ? <AchievementBadge rank={rank} /> : undefined}
          onPickAvatar={() => void changeAvatar()}
          avatarBusy={avatarBusy}
          tabs={{ value: tab, onChange: setTab }}
          onSave={(patch) => void save(patch)}
        />
      </View>
    </Screen>
  );
}
