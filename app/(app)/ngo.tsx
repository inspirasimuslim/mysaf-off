import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { NgoFormModal } from '@/components/ngo-form-modal';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { useNgoAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { createNgo, fetchNgos, type Ngo, type NgoInput } from '@/lib/ngo';
import { useColors } from '@/lib/theme';

/**
 * NGO Rasmi — senarai NGO (tile Direktori). Semua ahli boleh melihat; admin
 * LAJNAH PEMBANGUNAN NGO (can_edit) boleh menambah NGO baharu di sini dan
 * menyunting/memadam di skrin butiran.
 */
export default function NgoListScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const colors = useColors();
  const access = useNgoAccess();

  const [ngos, setNgos] = useState<Ngo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNgos(await fetchNgos());
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan senarai NGO.'));
      setNgos((current) => current ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = async (input: NgoInput) => {
    setBusy(true);
    setFormError(null);
    try {
      const id = await createNgo(input);
      setAdding(false);
      await load();
      router.push({ pathname: '/(app)/ngo-detail', params: { id } });
    } catch (caught) {
      setFormError(toMalayError(caught, 'Gagal menambah NGO. Nama NGO mungkin sudah wujud.'));
    } finally {
      setBusy(false);
    }
  };

  if (ngos === null || access.loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Direktori" title="NGO Rasmi" subtitle={ngos.length + ' NGO'} onBackPress={goBack} />

      <View className="gap-3 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {access.canEdit ? (
          <Button
            label="Tambah NGO"
            variant="secondary"
            onPress={() => {
              setFormError(null);
              setAdding(true);
            }}
          />
        ) : null}

        {ngos.length === 0 && !error ? (
          <EmptyState icon="people-circle-outline" title="Tiada NGO direkodkan" description="Senarai NGO rasmi akan dipaparkan di sini." />
        ) : null}

        {ngos.map((ngo) => (
          <Pressable
            key={ngo.id}
            accessibilityRole="button"
            accessibilityLabel={'Buka ' + ngo.nama}
            onPress={() => router.push({ pathname: '/(app)/ngo-detail', params: { id: ngo.id } })}
            className="active:opacity-70">
            <Card>
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-pill bg-primary-soft">
                  <Ionicons name="people-circle-outline" size={24} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-ink" numberOfLines={1}>
                    {ngo.nama}
                  </Text>
                  {ngo.nama_penuh ? (
                    <Text className="text-sm text-ink-muted" numberOfLines={1}>
                      {ngo.nama_penuh}
                    </Text>
                  ) : null}
                  {ngo.tahun_penubuhan ? (
                    <Text className="mt-0.5 text-xs text-ink-muted">{'Ditubuhkan ' + ngo.tahun_penubuhan}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>

      <NgoFormModal
        visible={adding}
        ngo={null}
        busy={busy}
        error={formError}
        onClose={() => setAdding(false)}
        onSubmit={(input) => void create(input)}
      />
    </Screen>
  );
}
