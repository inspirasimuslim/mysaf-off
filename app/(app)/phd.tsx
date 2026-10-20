import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
  type Peringkat,
  savePhdGraduate,
  type PhdGraduate,
  type PhdInput,
} from '@/lib/phd';
import { useColors } from '@/lib/theme';
import { useIsDesktop } from '@/lib/use-desktop';

/** 'Universiti Malaya · 2025' — hanya bahagian yang ada. */
function subtitleOf(row: PhdGraduate): string {
  return [row.bidang, row.universiti, row.tahun_tamat ? String(row.tahun_tamat) : null].filter(Boolean).join(' · ');
}

// Palet tetap "dewan kehormatan" — sengaja tidak mengikut tema cerah/gelap supaya dinding sentiasa megah.
const HALL = ['#06281D', '#0B3D2C', '#072F22'] as const;
const GOLD = ['#F6E7A8', '#D4AF37', '#9C7A1B'] as const;
const SILVER = ['#F1F4F7', '#B8C2CC', '#7C8793'] as const;
const GOLD_TEXT = '#E9C85A';
const SILVER_TEXT = '#D5DCE3';
const CREAM = '#FFF8E1';

const TIERS: Record<Peringkat, { heading: string; sub: string; frame: readonly [string, string, string]; accent: string; icon: 'ribbon' | 'medal' }> = {
  phd: { heading: 'DOKTOR FALSAFAH', sub: 'Puncak ilmu tertinggi', frame: GOLD, accent: GOLD_TEXT, icon: 'ribbon' },
  sarjana: { heading: 'SARJANA', sub: 'Pemegang ijazah sarjana', frame: SILVER, accent: SILVER_TEXT, icon: 'medal' },
};

function Portrait({ row, rounded = 12, ratio = 4 / 5 }: { row: PhdGraduate; rounded?: number; ratio?: number }) {
  const colors = useColors();
  return row.gambar_path ? (
    <Image
      source={{ uri: phdImageUrl(row.gambar_path) }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: rounded }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={'Gambar ' + row.nama}
    />
  ) : (
    <View
      style={{ width: '100%', aspectRatio: ratio, borderRadius: rounded, backgroundColor: colors.primaryTint }}
      className="items-center justify-center">
      <Ionicons name="school-outline" size={40} color={colors.primary} />
    </View>
  );
}

/** Garisan emas dengan hiasan di tengah. */
function Ornament({ color, icon = 'star' }: { color: string; icon?: 'star' | 'ribbon' | 'medal' }) {
  return (
    <View className="flex-row items-center justify-center gap-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={['transparent', color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5, flex: 1 }} />
      <Ionicons name={icon} size={14} color={color} />
      <LinearGradient colors={[color, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5, flex: 1 }} />
    </View>
  );
}

/** Bingkai potret bersama papan nama — emas untuk PhD, perak untuk Sarjana. */
function HonorFrame({ row, tier, compact, onPress }: { row: PhdGraduate; tier: Peringkat; compact: boolean; onPress: () => void }) {
  const t = TIERS[tier];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Buka ' + row.nama} onPress={onPress} className="active:opacity-80">
      <LinearGradient
        colors={t.frame}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 14, padding: compact ? 3 : 4, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        <View style={{ backgroundColor: '#0A1F17', borderRadius: 11, padding: compact ? 5 : 7 }}>
          <Portrait row={row} rounded={7} />
          <LinearGradient
            colors={t.frame}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 7, marginTop: compact ? 5 : 7, paddingVertical: compact ? 6 : 8, paddingHorizontal: 8, alignItems: 'center', gap: 1 }}>
            <Text style={{ color: '#2B1D00', fontSize: compact ? 12 : 14, fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>
              {row.nama}
            </Text>
            {row.generasi ? (
              <Text style={{ color: '#3E2C06', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{row.generasi.toUpperCase()}</Text>
            ) : null}
            {row.bidang ? (
              <Text style={{ color: '#3E2C06', fontSize: compact ? 10 : 11, textAlign: 'center' }} numberOfLines={2}>
                {row.bidang}
              </Text>
            ) : null}
            {row.tahun_tamat ? <Text style={{ color: '#3E2C06', fontSize: 10, fontWeight: '600' }}>{row.tahun_tamat}</Text> : null}
          </LinearGradient>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function TierSection({
  tier,
  rows,
  columns,
  onOpen,
}: {
  tier: Peringkat;
  rows: PhdGraduate[];
  columns: number;
  onOpen: (row: PhdGraduate) => void;
}) {
  const t = TIERS[tier];
  return (
    <View className="gap-4">
      <View className="items-center gap-1">
        <Ornament color={t.accent} icon={t.icon} />
        <Text style={{ color: t.accent, fontSize: 18, fontWeight: '800', letterSpacing: 3, marginTop: 4 }}>{t.heading}</Text>
        <Text style={{ color: CREAM, opacity: 0.7, fontSize: 12 }}>
          {t.sub} · {rows.length} ahli
        </Text>
      </View>

      {rows.length === 0 ? (
        <Text style={{ color: CREAM, opacity: 0.55, textAlign: 'center', fontSize: 13, paddingVertical: 12 }}>Belum ada rekod</Text>
      ) : (
        <View className="-mx-1.5 flex-row flex-wrap justify-center">
          {rows.map((row) => (
            <View key={row.id} style={{ width: `${100 / columns}%` }} className="p-1.5">
              <HonorFrame row={row} tier={tier} compact={tier === 'sarjana'} onPress={() => onOpen(row)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Pencapaian Akademik Tertinggi — "dinding kehormatan" ahli: PhD di atas, Sarjana di bawah
 * (tile Direktori). Semua ahli boleh melihat; admin JABATAN DATA & SUMBER MANUSIA (can_edit)
 * boleh menambah, menyunting dan memadam. Ketik satu bingkai untuk gambar besar dan butiran.
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

  const phd = rows.filter((row) => row.peringkat === 'phd');
  const sarjana = rows.filter((row) => row.peringkat === 'sarjana');

  return (
    <Screen padTop={false} wide>
      <ScreenHeader
        eyebrow="Direktori"
        title="Pencapaian Akademik"
        subtitle={phd.length + ' PhD · ' + sarjana.length + ' Sarjana'}
        onBackPress={goBack}
      />

      <View className="gap-3 px-gutter pb-10 pt-5">
        {error ? <Notice tone="negative" message={error} /> : null}

        {access.canEdit ? <Button label="Tambah Pencapaian" variant="secondary" onPress={() => openForm(null)} /> : null}

        <LinearGradient colors={HALL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: desktop ? 28 : 16, gap: 28, overflow: 'hidden' }}>
          <View className="items-center gap-2 pt-2">
            <View
              style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: GOLD_TEXT, backgroundColor: 'rgba(212,175,55,0.12)' }}
              className="items-center justify-center">
              <Ionicons name="trophy" size={30} color={GOLD_TEXT} />
            </View>
            <Text style={{ color: GOLD_TEXT, fontSize: desktop ? 28 : 22, fontWeight: '900', letterSpacing: 4, textAlign: 'center' }}>DINDING KEHORMATAN</Text>
            <Text style={{ color: CREAM, opacity: 0.75, fontSize: 13, textAlign: 'center' }}>
              Pencapaian akademik tertinggi ahli kita
            </Text>
          </View>

          {rows.length === 0 && !error ? (
            <EmptyState icon="school-outline" title="Belum ada rekod" description="Dinding kehormatan akan dipaparkan di sini." />
          ) : (
            <>
              <TierSection tier="phd" rows={phd} columns={desktop ? 3 : 2} onOpen={setViewing} />
              <TierSection tier="sarjana" rows={sarjana} columns={desktop ? 4 : 2} onOpen={setViewing} />
            </>
          )}
        </LinearGradient>
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
              <Text className="text-base font-bold text-ink">{(viewing.peringkat === 'phd' ? 'PhD ' : 'Sarjana ') + (viewing.bidang ?? '')}</Text>
              <GenerationChip code={viewing.generasi} />
            </View>
            {subtitleOf({ ...viewing, bidang: null }) ? (
              <Text className="text-sm text-ink-muted">{subtitleOf({ ...viewing, bidang: null })}</Text>
            ) : null}
            {viewing.tajuk_tesis ? (
              <View className="gap-1 rounded-field bg-primary-tint p-3">
                <Text className="text-xs font-semibold text-ink-muted">Tajuk penyelidikan</Text>
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
        message={deleting ? deleting.nama + ' dan gambarnya akan dipadam kekal daripada dinding kehormatan.' : ''}
        confirmLabel="Padam"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Screen>
  );
}
