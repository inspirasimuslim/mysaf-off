import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberPickerField } from '@/components/ui/member-picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { ToastBanner } from '@/components/ui/toast';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { addKawasanAdmin, fetchKawasanAdmins, removeKawasanAdmin, type KawasanAdmin } from '@/lib/kawasan-admin';
import { fetchMembersForPicker } from '@/lib/members';
import { useGoBack } from '@/lib/navigation';
import { useColors } from '@/lib/theme';
import { KAWASAN_USRAH_OPTIONS, kawasanUsrahLabel, type MemberPickerRow } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/**
 * Lantik admin bagi setiap kawasan usrah — Super Admin / admin LAJNAH TARBIAH.
 *
 * Admin kawasan hanya boleh menyunting kawasannya: kumpulan usrah, acara usrah
 * dan statistik tarbiah (lihat migration 147). Satu kawasan boleh ada beberapa
 * admin. Membuang admin tidak memadam apa-apa data ahli.
 */
export default function AdminKawasanScreen() {
  const colors = useColors();
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useUsrahAccess();

  const [admins, setAdmins] = useState<KawasanAdmin[]>([]);
  const [candidates, setCandidates] = useState<MemberPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<KawasanAdmin | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, people] = await Promise.all([fetchKawasanAdmins(), fetchMembersForPicker()]);
      setAdmins(rows);
      setCandidates(people);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai admin kawasan.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canEdit) return;
      void load();
    }, [accessLoading, canEdit, load]),
  );

  const byKawasan = useMemo(() => {
    const map = new Map<string, KawasanAdmin[]>();
    admins.forEach((row) => map.set(row.kawasan_usrah, [...(map.get(row.kawasan_usrah) ?? []), row]));
    return map;
  }, [admins]);

  const add = async (kawasan: string, memberId: string | null) => {
    if (!memberId || busy) return;
    setBusy(true);
    setBanner(null);
    try {
      await addKawasanAdmin(kawasan, memberId);
      await load();
      setBanner({ tone: 'positive', message: 'Admin ditambah untuk ' + kawasanUsrahLabel(kawasan) + '.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal menambah admin.') });
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await removeKawasanAdmin(removing.id);
      setRemoving(null);
      await load();
      setBanner({ tone: 'positive', message: removing.full_name + ' dibuang daripada admin ' + kawasanUsrahLabel(removing.kawasan_usrah) + '.' });
    } catch (caught) {
      setRemoving(null);
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal membuang admin.') });
    } finally {
      setBusy(false);
    }
  };

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Admin Usrah Kawasan" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Melantik admin kawasan memerlukan kebenaran menyunting pada LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Lajnah Tarbiah"
          title="Admin Usrah Kawasan"
          subtitle="Setiap admin hanya boleh urus kawasannya sendiri"
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pb-8 pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {KAWASAN_USRAH_OPTIONS.map((option) => {
            const list = byKawasan.get(option.value) ?? [];
            return (
              <View key={option.value}>
                <SectionTitle title={option.label} caption={list.length + ' admin'} />
                <View className="gap-3 rounded-card border border-line bg-surface p-4">
                  {list.map((row) => (
                    <View key={row.id} className="flex-row items-center gap-3">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink">{row.full_name}</Text>
                        {row.generasi ? <Text className="text-xs text-ink-muted">{row.generasi}</Text> : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={'Buang ' + row.full_name}
                        hitSlop={10}
                        disabled={busy}
                        onPress={() => setRemoving(row)}
                        className="h-9 w-9 items-center justify-center rounded-pill bg-negative-soft active:opacity-70">
                        <Ionicons name="close" size={18} color={colors.negative} />
                      </Pressable>
                    </View>
                  ))}
                  <MemberPickerField
                    label="Tambah admin"
                    value={null}
                    candidates={candidates.filter((c) => !list.some((row) => row.member_id === c.id))}
                    onChange={(id) => void add(option.value, id)}
                    placeholder="Cari & pilih ahli"
                    disabled={busy}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Screen>

      <ConfirmDialog
        visible={removing !== null}
        title="Buang admin kawasan?"
        message={
          removing
            ? removing.full_name + ' tidak lagi dapat mengurus ' + kawasanUsrahLabel(removing.kawasan_usrah) + '. Data usrah tidak dipadam.'
            : ''
        }
        confirmLabel="Buang"
        destructive
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
