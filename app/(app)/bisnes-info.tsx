import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import {
  businessAdError,
  deleteBusinessAd,
  fetchBusinessAd,
  POSTER_ASPECT_RATIO,
  type BusinessAdDetail,
} from '@/lib/business-ads';
import { useGoBack } from '@/lib/navigation';
import { toWhatsAppNumber } from '@/lib/phone';

/**
 * Satu bisnes, penuh — dibuka dari carousel Utama atau Senarai Bisnes.
 *
 * `get_business_ad()` hanya memulangkan baris yang boleh dilihat pemanggil
 * (aktif, atau milik sendiri) — iklan yang sudah tamat/ditarik balik kelihatan
 * "tidak dijumpai" kepada orang lain.
 *
 * Susunan (rombak 2026-10-03, ikut poster baharu 1024×550 — banner landskap,
 * bukan lagi anggapan poster 3:4 potret): poster banner penuh lebar dahulu
 * (bekas `aspectRatio` SAMA dengan `POSTER_ASPECT_RATIO`, jadi `cover` tidak
 * memotong apa-apa — nisbah bekas = nisbah fail sebenar), kemudian butang
 * WhatsApp dinaikkan terus selepas poster (tindakan utama paling kerap
 * diperlukan pelawat, jangan sorok di bawah perenggan penerangan panjang),
 * penerangan dibungkus dalam kad "Tentang Bisnes" supaya kelihatan kemas
 * berbanding teks terapung, dan tindakan pemilik (sunting/padam) diletak
 * paling bawah sekali — ia jarang digunakan berbanding melihat/menghubungi.
 */
export default function BisnesInfoScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [ad, setAd] = useState<BusinessAdDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    /*
      Laluan ini statik (`/(app)/bisnes-info?id=...`, bukan segmen dinamik
      `[id]`), jadi Expo Router kadangkala guna SEMULA instance skrin yang
      sama bila ahli tekan terus daripada satu iklan ke iklan lain (contoh:
      padam iklan pertama -> `router.replace` balik ke senarai -> tekan
      iklan kedua). Tanpa reset ini, status `deleting`/`confirmingDelete`
      daripada padaman SEBELUM ini terbawa ke iklan seterusnya, menyebabkan
      dialog Padam terus "loading" walaupun belum ditekan langsung (bug
      dilaporkan 2026-10-03, sama bentuk dengan `semakan-iklan.tsx`).
    */
    setConfirmingDelete(false);
    setDeleting(false);
    setDeleteError(null);

    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const row = await fetchBusinessAd(id);
        if (active) setAd(row);
      } catch {
        if (active) setAd(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <LoadingScreen />;

  if (!ad) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Bisnes Ahli" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="storefront-outline"
            title="Bisnes tidak dijumpai"
            description="Iklan ini mungkin telah tamat tempoh atau ditarik balik."
          />
        </View>
      </Screen>
    );
  }

  const whatsApp = toWhatsAppNumber(ad.no_whatsapp);

  const contact = () => {
    if (!whatsApp) return;
    setLinkError(null);
    Linking.openURL('https://wa.me/' + whatsApp).catch(() => setLinkError('WhatsApp tidak dapat dibuka pada peranti ini.'));
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBusinessAd(ad.id);
      // Reset status SEBELUM navigasi keluar — sebelum ini hanya laluan
      // ralat yang reset `deleting`, bergantung semata-mata pada skrin
      // dibuang untuk membersihkan status berjaya; tidak selamat bila
      // instance skrin digunakan semula (lihat komen di `useEffect` id).
      setConfirmingDelete(false);
      setDeleting(false);
      router.replace('/(app)/bisnes-ahli');
    } catch (caught) {
      setDeleteError(businessAdError(caught, 'Gagal memadam iklan. Sila cuba lagi.'));
      setDeleting(false);
    }
  };

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Bisnes Ahli" title={ad.nama_bisnes} subtitle={ad.nama_pemilik} onBackPress={goBack} />

      <View className="gap-5 px-gutter pb-8 pt-6">
        <Image
          source={{ uri: ad.url_poster }}
          style={{ width: '100%', aspectRatio: POSTER_ASPECT_RATIO, borderRadius: 20 }}
          contentFit="cover"
          transition={150}
          accessibilityLabel={'Poster ' + ad.nama_bisnes}
        />

        {ad.is_mine && ad.status_paparan !== 'diluluskan' ? (
          <View className="flex-row items-center gap-2">
            <Badge
              label={
                ad.status_paparan === 'menunggu'
                  ? 'Pending'
                  : ad.status_paparan === 'ditolak'
                    ? 'Ditolak'
                    : 'Tamat Tempoh'
              }
              tone={ad.status_paparan === 'menunggu' ? 'warn' : ad.status_paparan === 'ditolak' ? 'negative' : 'neutral'}
            />
          </View>
        ) : null}

        {ad.is_mine && ad.status_paparan === 'ditolak' && ad.sebab_tolak ? (
          <Notice tone="negative" message={'Sebab ditolak: ' + ad.sebab_tolak} />
        ) : null}

        {linkError ? <Notice tone="negative" message={linkError} /> : null}

        {whatsApp ? (
          <Button
            label={ad.teks_cta ? ad.teks_cta + ' — Hubungi via WhatsApp' : 'Hubungi via WhatsApp'}
            icon={<Ionicons name="logo-whatsapp" size={20} color={Colors.white} />}
            onPress={contact}
          />
        ) : null}

        {ad.penerangan ? (
          <View className="gap-2 rounded-card border border-line bg-surface p-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Tentang Bisnes Ini</Text>
            <Text className="text-base leading-6 text-ink">{ad.penerangan}</Text>
          </View>
        ) : null}

        {/*
          Gambar 2/3 — pilihan, bebas orientation (tiada aspectRatio tetap
          seperti poster). `contentFit="contain"` di dalam bekas segi empat
          sama mengelakkan sebarang pemotongan tidak kira potret/landskap;
          bekas `bg-background` menyamarkan jalur kosong (letterbox) jika ada.
        */}
        {ad.url_gambar_2 || ad.url_gambar_3 ? (
          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Gambar Tambahan</Text>
            <View className="flex-row gap-3">
              {ad.url_gambar_2 ? (
                <View className="flex-1 overflow-hidden rounded-field bg-background" style={{ aspectRatio: 1 }}>
                  <Image
                    source={{ uri: ad.url_gambar_2 }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="contain"
                    transition={150}
                    accessibilityLabel={'Gambar tambahan 1 — ' + ad.nama_bisnes}
                  />
                </View>
              ) : null}
              {ad.url_gambar_3 ? (
                <View className="flex-1 overflow-hidden rounded-field bg-background" style={{ aspectRatio: 1 }}>
                  <Image
                    source={{ uri: ad.url_gambar_3 }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="contain"
                    transition={150}
                    accessibilityLabel={'Gambar tambahan 2 — ' + ad.nama_bisnes}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <Ionicons name="person-outline" size={16} color={Colors.inkMuted} />
          <Text className="text-sm text-ink-muted">{ad.nama_pemilik}</Text>
        </View>

        {ad.is_mine ? (
          <View className="gap-3 border-t border-line pt-5">
            {deleteError ? <Notice tone="negative" message={deleteError} /> : null}
            {ad.status_paparan === 'ditolak' ? (
              <Button
                label="Edit & Hantar Semula"
                variant="secondary"
                icon={<Ionicons name="create-outline" size={18} color={Colors.ink} />}
                onPress={() => router.push({ pathname: '/(app)/bisnes-upload', params: { id: ad.id } })}
              />
            ) : null}
            <Button
              label="Padam Iklan"
              variant="danger"
              icon={<Ionicons name="trash-outline" size={18} color={Colors.negative} />}
              onPress={() => setConfirmingDelete(true)}
            />
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmingDelete}
        title="Padam iklan ini?"
        message={'Iklan "' + ad.nama_bisnes + '" akan dipadam kekal, termasuk semua gambar. Tindakan ini tidak boleh diundur.'}
        confirmLabel="Padam"
        destructive
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}
