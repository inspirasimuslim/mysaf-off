import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { MemberForm } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { pickAvatar, uploadAvatar } from '@/lib/avatar';
import { displayName, useAuth } from '@/lib/auth-context';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations, fetchMyMember, fetchMyMemberLinked, updateMember } from '@/lib/members';
import { generationLabel, type Generation, type Member } from '@/types/database';

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

  const header = (
    <ScreenHeader
      title="Profil"
      eyebrow={member?.nombor_ahli ? 'Ahli ' + member.nombor_ahli : undefined}
      subtitle={member ? generationLabel(member.generasi) : undefined}
    />
  );

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

        <Card>
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-primary-soft">
              <Ionicons name="person" size={24} color={Colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                {member.full_name}
              </Text>
              <Text className="mt-0.5 text-sm text-ink-muted" numberOfLines={1}>
                {member.email ?? 'Tiada emel'}
              </Text>
            </View>
            {member.disekat ? <Badge label="Disekat" tone="negative" /> : null}
          </View>
        </Card>

        <MemberForm
          key={member.id + ':' + version}
          member={member}
          generations={generations}
          canEditAdminColumns={false}
          busy={saving}
          onPickAvatar={() => void changeAvatar()}
          avatarBusy={avatarBusy}
          onSave={(patch) => void save(patch)}
        />
      </View>
    </Screen>
  );
}
