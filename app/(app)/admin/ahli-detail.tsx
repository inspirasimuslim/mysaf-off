import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { MemberForm } from '@/components/member-form';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fetchGenerations, fetchMember, updateMember } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { generationLabel, type Generation, type Member } from '@/types/database';

type Banner = { tone: 'positive' | 'negative'; message: string } | null;

export default function AhliDetailScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading: accessLoading, canView, canEdit } = useMemberAccess();

  const [member, setMember] = useState<Member | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  /** Dinaikkan selepas setiap simpanan berjaya untuk memaksa borang dibina semula. */
  const [version, setVersion] = useState(0);

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
      } catch (caught) {
        if (active) setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan rekod ahli.') });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canView, id]);

  const save = useCallback(
    async (patch: Partial<Member>) => {
      if (!member || saving) return;

      setBanner(null);
      setSaving(true);
      try {
        await updateMember(member.id, patch);
        // Baca semula supaya `updated_at` dan sebarang nilai yang dinormalkan
        // oleh pangkalan data terpapar, bukan andaian tempatan.
        const fresh = await fetchMember(member.id);
        setMember(fresh);
        setVersion((current) => current + 1);
        setBanner({ tone: 'positive', message: 'Perubahan telah disimpan.' });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
      } finally {
        setSaving(false);
      }
    },
    [member, saving],
  );

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
              <Notice tone={banner.tone} message={banner.message} />
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
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={(member.nombor_ahli ?? 'Tiada nombor') + ' · ' + generationLabel(member.generasi)}
        title={member.full_name}
        subtitle={member.email ?? 'Tiada emel'}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {!canEdit ? (
          <Notice
            tone="info"
            message="Anda hanya mempunyai kebenaran melihat. Sebarang perubahan akan ditolak oleh pangkalan data."
          />
        ) : null}

        <MemberForm
          /* `key` memaksa borang dibina semula selepas simpan supaya draftnya
             bermula daripada nilai terkini, bukan nilai sebelum simpan. */
          key={member.id + ':' + version}
          member={member}
          generations={generations}
          canEditAdminColumns={canEdit}
          busy={saving}
          onSave={(patch) => void save(patch)}
        />
      </View>
    </Screen>
  );
}
