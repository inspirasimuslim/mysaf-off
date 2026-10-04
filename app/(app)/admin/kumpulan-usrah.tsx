import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToastBanner } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayErrorVerbose } from '@/lib/errors';
import { createKumpulanUsrah, fetchKumpulanUsrahOverview } from '@/lib/kumpulan-usrah';
import { useGoBack } from '@/lib/navigation';
import { KAWASAN_USRAH_OPTIONS, kawasanUsrahLabel, type KumpulanUsrahOverview } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/**
 * Senarai Kumpulan Usrah Tarbiah — diminta 2026-10-04. Kawasan besar (ULK,
 * UPT, dll.) mempunyai beberapa kumpulan usrah, setiap satu ada 0-2 naqib.
 * Admin LAJNAH TARBIAH tentukan bilangan kumpulan & naqibnya di sini;
 * tambah/buang ahli dan naqib dibuat di skrin butiran (`kumpulan-usrah-detail.tsx`).
 */
export default function KumpulanUsrahScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canView, canEdit } = useUsrahAccess();

  const [rows, setRows] = useState<KumpulanUsrahOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchKumpulanUsrahOverview());
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal memuatkan senarai kumpulan usrah.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (accessLoading || !canView) return;
      void load();
    }, [accessLoading, canView, load]),
  );

  // --- Tambah kumpulan baharu ------------------------------------------------
  const [creating, setCreating] = useState(false);
  const [newKawasan, setNewKawasan] = useState<string | null>(null);
  const [newNama, setNewNama] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const openCreate = useCallback(() => {
    setBanner(null);
    setNewKawasan(null);
    setNewNama('');
    setCreating(true);
  }, []);

  const confirmCreate = useCallback(async () => {
    if (createBusy || !newKawasan || newNama.trim().length < 1) return;
    setCreateBusy(true);
    try {
      await createKumpulanUsrah(newKawasan, newNama);
      setCreating(false);
      await load();
      setBanner({ tone: 'positive', message: 'Kumpulan "' + newNama.trim() + '" telah dicipta.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayErrorVerbose(caught, 'Gagal mencipta kumpulan.') });
    } finally {
      setCreateBusy(false);
    }
  }, [createBusy, newKawasan, newNama, load]);

  const grouped = useMemo(() => {
    const byKawasan = new Map<string, KumpulanUsrahOverview[]>();
    rows.forEach((row) => {
      byKawasan.set(row.kawasan_usrah, [...(byKawasan.get(row.kawasan_usrah) ?? []), row]);
    });
    return [...byKawasan.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Kumpulan Usrah" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Kumpulan Usrah memerlukan kebenaran melihat pada department LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen padTop={false}>
        <ScreenHeader
          eyebrow="Panel Admin"
          title="Kumpulan Usrah"
          subtitle={rows.length + ' kumpulan direkod'}
          onBackPress={goBack}
        />

        <View className="gap-6 px-gutter pb-8 pt-5">
          {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

          {canEdit ? <Button label="+ Tambah Kumpulan" onPress={openCreate} /> : null}

          {rows.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Belum ada kumpulan"
              description="Cipta kumpulan usrah mengikut kawasan untuk mula memantau naqib dan ahlinya."
            />
          ) : (
            grouped.map(([kawasan, kumpulanList]) => (
              <View key={kawasan}>
                <SectionTitle title={kawasanUsrahLabel(kawasan)} caption={kumpulanList.length + ' kumpulan'} />
                <View className="gap-2">
                  {kumpulanList.map((kumpulan) => (
                    <Pressable
                      key={kumpulan.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/(app)/admin/kumpulan-usrah-detail', params: { id: kumpulan.id } })}
                      className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-card active:opacity-70">
                      <View className="flex-1">
                        <Text className="text-base font-semibold text-ink">{kumpulan.nama}</Text>
                        <Text className="mt-0.5 text-sm text-ink-muted">
                          {kumpulan.ahli.length + ' ahli · ' + (kumpulan.naqib.length === 0 ? 'Tiada naqib' : kumpulan.naqib.map((n) => n.full_name).join(', '))}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.inkMuted} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </Screen>

      <FormModal
        visible={creating}
        title="Tambah Kumpulan Usrah"
        description="Pilih kawasan dan namakan kumpulan baharu."
        dismissable={!createBusy}
        onClose={() => setCreating(false)}>
        <View className="gap-4">
          <PickerField label="Kawasan" value={newKawasan} options={KAWASAN_USRAH_OPTIONS} onChange={setNewKawasan} clearable={false} />
          <TextField label="Nama Kumpulan" placeholder="cth: Kumpulan 1" value={newNama} onChangeText={setNewNama} editable={!createBusy} />
          <Button
            label="Cipta Kumpulan"
            onPress={() => void confirmCreate()}
            loading={createBusy}
            disabled={!newKawasan || newNama.trim().length < 1}
          />
        </View>
      </FormModal>
    </>
  );
}
