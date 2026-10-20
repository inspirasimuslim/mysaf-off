import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PhdFormModal } from '@/components/phd-form-modal';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormModal } from '@/components/ui/form-modal';
import { GenerationChip } from '@/components/ui/generation-chip';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { useMemberAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import {
  deletePhdGraduate,
  fetchPhdGraduates,
  phdImageUrl,
  savePhdGraduate,
  type PhdGraduate,
  type PhdInput,
} from '@/lib/phd';
import { useColors } from '@/lib/theme';
import { useIsDesktop } from '@/lib/use-desktop';

/** 'Kejuruteraan · Universiti Malaya · 2025' — hanya bahagian yang ada. */
function subtitleOf(row: PhdGraduate): string {
  return [row.bidang, row.universiti, row.tahun_tamat ? String(row.tahun_tamat) : null].filter(Boolean).join(' · ');
}

function Portrait({ row, rounded = 12 }: { row: PhdGraduate; rounded?: number }) {
  const colors = useColors();
  return row.gambar_path ? (
    <Image
      source={{ uri: phdImageUrl(row.gambar_path) }}
      style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: rounded }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={'Gambar ' + row.nama}
    />
  ) : (
    <View
      style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: rounded, backgroundColor: colors.primaryTint }}
      className="items-center justify-center">
      <Ionicons name="school-outline" size={40} color={colors.primary} />
    </View>
  );
}

/**
 * Pemegang PhD — galeri gambar dan nama ahli yang berjaya tamat PhD (tile Direktori).
 * Semua ahli boleh melihat; admin JABATAN DATA & SUMBER MANUSIA (can_edit) boleh
 * menambah, menyunting dan memadam. Ketik satu kad untuk gambar besar dan butiran.
 */
export default function PhdScreen() {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const access = useMemberAccess();

  const [rows, setRows] = useState<PhdGraduate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PhdGraduate | null>(null);
  const [editing, setEditing] = useState<PhdGraduate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<PhdGraduate | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchPhdGraduates());
      setError(null);
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal memuatkan senarai pemegang PhD.'));
      setRows((current) => current ?? []);
    }
  }, []);

  // Skrin tab tersembunyi kekal terpasang — muat semula setiap kali difokus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openForm = (row: PhdGraduate | null) => {
    setViewing(null);
    setEditing(row);
    setFormError(null);
    setFormOpen(true);
  };

  const save = async (input: PhdInput, photoUri: string | null, removePhoto: boolean) => {
    setBusy(true);
    setFormError(null);
    try {
      await savePhdGraduate(editing, input, photoUri, removePhoto);
      setFormOpen(false);
      await load();
    } catch (caught) {
      setFormError(toMalayError(caught, 'Gagal menyimpan. Sila cuba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deletePhdGraduate(deleting);
      setDeleting(null);
      await load();
    } catch (caught) {
      setDeleting(null);
      setError(toMalayError(caught, 'Gagal memadam rekod.'));
    } finally {
      setBusy(false);
    }
  };

  if (rows === null || access.loading) return <LoadingScreen />;

  const columns = desktop ? 4 : 2;

  return (
    <Screen padTop={false} wide>
      <ScreenHeader eyebrow="Direktori" title="Pemegang PhD" subtitle={rows.length + ' ahli berjaya tamat PhD'} onBackPress={goBack} />

      <View className="gap-3 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {access.canEdit ? <Button label="Tambah Pemegang PhD" variant="secondary" onPress={() => openForm(null)} /> : null}

        {rows.length === 0 && !error ? (
          <EmptyState icon="school-outline" title="Belum ada rekod" description="Galeri pemegang PhD akan dipaparkan di sini." />
        ) : null}

        <View className="-mx-1.5 flex-row flex-wrap">
          {rows.map((row) => (
            <View key={row.id} style={{ width: `${100 / columns}%` }} className="p-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Buka ' + row.nama}
                onPress={() => setViewing(row)}
                className="overflow-hidden rounded-card border border-line bg-surface active:opacity-70">
                <Portrait row={row} rounded={0} />
                <View className="gap-0.5 p-3">
                  <Text className="text-sm font-bold text-ink" numberOfLines={2}>
                    {row.nama}
                  </Text>
                  {row.bidang ? (
                    <Text className="text-xs text-ink-muted" numberOfLines={2}>
                      {row.bidang}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-ink-faint" numberOfLines={1}>
                    {[row.universiti, row.tahun_tamat].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <FormModal
        visible={viewing !== null}
        title={viewing?.nama ?? ''}
        onClose={() => setViewing(null)}
        centerOnDesktop
        footer={
          access.canEdit && viewing ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Sunting" variant="secondary" onPress={() => openForm(viewing)} />
              </View>
              <View className="flex-1">
                <Button
                  label="Padam"
                  variant="danger"
                  onPress={() => {
                    setDeleting(viewing);
                    setViewing(null);
                  }}
                />
              </View>
            </View>
          ) : undefined
        }>
        {viewing ? (
          <View className="gap-3">
            <Portrait row={viewing} />
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-base font-bold text-ink">PhD {viewing.bidang ?? ''}</Text>
              <GenerationChip code={viewing.generasi} />
            </View>
            {subtitleOf({ ...viewing, bidang: null }) ? (
              <Text className="text-sm text-ink-muted">{subtitleOf({ ...viewing, bidang: null })}</Text>
            ) : null}
            {viewing.tajuk_tesis ? (
              <View className="gap-1 rounded-field bg-primary-tint p-3">
                <Text className="text-xs font-semibold text-ink-muted">Tajuk tesis</Text>
                <Text className="text-sm text-ink">{viewing.tajuk_tesis}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </FormModal>

      <PhdFormModal
        visible={formOpen}
        graduate={editing}
        busy={busy}
        error={formError}
        onClose={() => setFormOpen(false)}
        onSubmit={(input, photoUri, removePhoto) => void save(input, photoUri, removePhoto)}
      />

      <ConfirmDialog
        visible={deleting !== null}
        title="Padam rekod?"
        message={deleting ? deleting.nama + ' dan gambarnya akan dipadam kekal daripada galeri.' : ''}
        confirmLabel="Padam"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Screen>
  );
}
