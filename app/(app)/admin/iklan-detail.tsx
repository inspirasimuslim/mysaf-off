import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AutoAspectImage } from '@/components/business-ad-image-slot';
import { BUSINESS_AD_STATUS_LABEL } from '@/components/business-ad-list-row';
import { NoAccessScreen } from '@/components/no-access';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import {
  businessAdError,
  fetchBusinessAdAdmin,
  POSTER_ASPECT_RATIO,
  reviewBusinessAd,
  type AdminBusinessAd,
} from '@/lib/business-ads';
import { EKONOMI_DEPARTMENT, useDepartmentAccess } from '@/lib/department-access';
import { useGoBack } from '@/lib/navigation';

const DEFAULT_DURATION = '30';
type Mode = 'lulus' | 'tolak';

/**
 * Detail penuh satu iklan bisnes — admin LAJNAH EKONOMI DAN ASET + Super Admin.
 *
 * Dibuka daripada senarai ringkas `semakan-iklan.tsx`. Lulus/Tolak kekal di
 * sini (bukan di senarai) supaya senarai tidak perlu bentangkan borang inline
 * untuk setiap baris. Tiada butang Padam — Tolak dengan sebab (dibaca
 * pemilik) sudah memadai; pemilik sendiri yang boleh memadam iklannya.
 */
export default function AdminIklanDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { loading: accessLoading, canView, canEdit } = useDepartmentAccess(EKONOMI_DEPARTMENT);

  const [ad, setAd] = useState<AdminBusinessAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('lulus');
  const [acting, setActing] = useState(false);
  const [durasi, setDurasi] = useState(DEFAULT_DURATION);
  const [sebab, setSebab] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setAd(await fetchBusinessAdAdmin(id));
      setLoadError(null);
    } catch (caught) {
      setLoadError(businessAdError(caught, 'Gagal memuatkan iklan.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const confirm = async () => {
    if (!ad || acting) return;
    setActionError(null);

    let decision: Parameters<typeof reviewBusinessAd>[1];
    if (mode === 'lulus') {
      const days = Number(durasi);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return setActionError('Durasi mesti nombor bulat 1 hingga 365 hari.');
      }
      decision = { keputusan: 'diluluskan', durasiHari: days };
    } else {
      decision = { keputusan: 'ditolak', sebab: sebab.trim() };
    }

    setActing(true);
    try {
      await reviewBusinessAd(ad.id, decision);
      setDone(mode === 'lulus' ? 'Iklan diluluskan.' : 'Iklan ditolak.');
      void load();
    } catch (caught) {
      setActionError(businessAdError(caught, 'Gagal menyimpan keputusan.'));
    } finally {
      setActing(false);
    }
  };

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <NoAccessScreen
        title="Detail Iklan"
        description="Skrin ini khusus untuk admin LAJNAH EKONOMI DAN ASET dan Super Admin."
      />
    );
  }

  if (loadError || !ad) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Detail Iklan" onBackPress={goBack} />
        <View className="px-gutter">
          {loadError ? (
            <Notice tone="negative" message={loadError} />
          ) : (
            <EmptyState icon="storefront-outline" title="Iklan tidak dijumpai" description="Iklan ini mungkin telah dipadam." />
          )}
        </View>
      </Screen>
    );
  }

  const status = BUSINESS_AD_STATUS_LABEL[ad.status_paparan];

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Lajnah Ekonomi dan Aset" title={ad.nama_bisnes} subtitle={ad.nama_pemilik} onBackPress={goBack} />

      <View className="gap-4 pb-8 pt-5">
        <View className="gap-4 px-gutter">
          <Image
            source={{ uri: ad.url_poster }}
            style={{ width: '100%', aspectRatio: POSTER_ASPECT_RATIO, borderRadius: 20 }}
            contentFit="cover"
            accessibilityLabel={'Poster ' + ad.nama_bisnes}
          />

          <View className="flex-row items-center gap-2">
            <Badge label={status.label} tone={status.tone} />
          </View>

          {ad.penerangan ? (
            <View className="gap-2 rounded-card border border-line bg-surface p-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Tentang Bisnes Ini</Text>
              <Text className="text-sm leading-5 text-ink">{ad.penerangan}</Text>
            </View>
          ) : null}
        </View>

        {/*
          Gambar 2/3 — pilihan, bebas resolusi; sama rawatan dengan
          bisnes-info.tsx (2026-10-04) — `AutoAspectImage` menyesuaikan tinggi
          kepada nisbah sebenar fail, dipaparkan penuh lebar LUAR bekas
          `px-gutter` supaya tepi kiri/kanan sampai hujung.
        */}
        {ad.url_gambar_2 || ad.url_gambar_3 ? (
          <View className="gap-2">
            <Text className="px-gutter text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Gambar Tambahan
            </Text>
            <View className="gap-2">
              {ad.url_gambar_2 ? (
                <AutoAspectImage uri={ad.url_gambar_2} label={'Gambar tambahan 1 — ' + ad.nama_bisnes} />
              ) : null}
              {ad.url_gambar_3 ? (
                <AutoAspectImage uri={ad.url_gambar_3} label={'Gambar tambahan 2 — ' + ad.nama_bisnes} />
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="gap-4 px-gutter">
          <View className="gap-1">
            <Text className="text-sm text-ink-muted">
              {ad.nama_pemilik}
              {ad.no_keahlian ? ' · ' + ad.no_keahlian : ''} · WhatsApp {ad.no_whatsapp}
            </Text>
            {ad.teks_cta ? <Text className="text-sm text-ink-muted">Butang: {ad.teks_cta}</Text> : null}
            <Text className="text-xs text-ink-faint">Dihantar {new Date(ad.submitted_at).toLocaleString('ms-MY')}</Text>
          </View>

          {ad.status_paparan === 'ditolak' && ad.sebab_tolak ? (
            <Notice tone="negative" message={'Sebab ditolak: ' + ad.sebab_tolak} />
          ) : null}

          {done ? <Notice tone="positive" message={done} /> : null}

          {!canEdit && ad.status_paparan === 'menunggu' ? (
            <Notice tone="info" message="Anda hanya boleh melihat iklan ini. Kelulusan dan penolakan memerlukan kebenaran sunting." />
          ) : null}

          {canEdit && ad.status_paparan === 'menunggu' && !done ? (
            <View className="gap-3">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    label="Lulus"
                    size="sm"
                    variant={mode === 'lulus' ? 'primary' : 'secondary'}
                    onPress={() => {
                      setMode('lulus');
                      setActionError(null);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="Tolak"
                    size="sm"
                    variant={mode === 'tolak' ? 'danger' : 'secondary'}
                    onPress={() => {
                      setMode('tolak');
                      setActionError(null);
                    }}
                  />
                </View>
              </View>

              {mode === 'lulus' ? (
                <TextField
                  label="Durasi paparan (hari, 1–365)"
                  value={durasi}
                  onChangeText={setDurasi}
                  keyboardType="number-pad"
                  editable={!acting}
                />
              ) : (
                <TextField
                  label="Sebab ditolak (dipaparkan kepada pemilik)"
                  value={sebab}
                  onChangeText={setSebab}
                  multiline
                  maxLength={500}
                  editable={!acting}
                />
              )}

              {actionError ? <Notice tone="negative" message={actionError} /> : null}

              <Button
                label={mode === 'lulus' ? 'Sahkan Lulus' : 'Sahkan Tolak'}
                variant={mode === 'lulus' ? 'primary' : 'danger'}
                loading={acting}
                onPress={() => void confirm()}
              />
            </View>
          ) : null}

          {done ? <Button label="Kembali ke Senarai" variant="secondary" onPress={() => router.back()} /> : null}
        </View>
      </View>
    </Screen>
  );
}
