import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SaveShareButtons } from '@/components/save-share-buttons';
import { ScreenHeader } from '@/components/screen-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { fetchAdhocPayment } from '@/lib/adhoc-payments';
import { toMalayError } from '@/lib/errors';
import type { DeliveryMode } from '@/lib/file-delivery';
import { deliverImage, fileSlug, imageDeliveryMessage } from '@/lib/image-share';
import { useGoBack } from '@/lib/navigation';
import type { AdhocPaymentType } from '@/types/database';

/**
 * Butiran satu pembayaran adhoc, dengan kod QR DuitNow.
 *
 * QR ialah sebab skrin ini wujud, jadi ia dipapar sebagai segi empat sama
 * penuh lebar dan bukan lakaran kecil: ia perlu diimbas oleh kamera telefon
 * KEDUA dari skrin ini, dan corak QR yang kecil pada skrin yang malap gagal
 * dikunci.
 *
 * `contentFit="contain"` dan latar putih, bukan "cover": memotong tepi kod QR
 * merosakkan penanda sudutnya dan menjadikannya tidak boleh dibaca langsung.
 */
export default function AdhocPaymentInfoScreen() {
  const goBack = useGoBack();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? null;

  const [row, setRow] = useState<AdhocPaymentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<DeliveryMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const found = await fetchAdhocPayment(id);
        if (active) setRow(found);
      } catch (caught) {
        if (active) setError(toMalayError(caught, 'Gagal memuatkan butiran pembayaran.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  /**
   * Serahkan imej QR kepada pengguna: "Simpan ke Galeri" (terus ke galeri
   * telefon) atau "Kongsi" (share sheet). Web memuat turun terus. Lihat
   * `lib/image-share.ts`.
   */
  const saveQr = useCallback(
    async (mode: DeliveryMode) => {
      if (!row?.qr_image_url || saving) return;

      setError(null);
      setNotice(null);
      setSaving(mode);
      try {
        const result = await deliverImage(row.qr_image_url, 'qr-' + fileSlug(row.title) + '.jpg', row.title, mode);
        setNotice(imageDeliveryMessage(result));
      } catch (caught) {
        setError(toMalayError(caught, 'Gagal menyimpan kod QR.'));
      } finally {
        setSaving(null);
      }
    },
    [row, saving],
  );

  if (loading) return <LoadingScreen />;

  if (!row) {
    return (
      <Screen padTop={false}>
        <ScreenHeader eyebrow="Pembayaran" title="Butiran" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="help-circle-outline"
            title="Rekod tidak dijumpai"
            description={error ?? 'Pembayaran ini mungkin sudah dipadam atau dimatikan oleh Bendahari.'}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Pembayaran" title={row.title} onBackPress={goBack} />

      <View className="gap-6 px-gutter pt-6">
        {error ? <Notice tone="negative" message={error} /> : null}

        {row.description ? (
          <Card>
            <Text className="text-sm leading-6 text-ink">{row.description}</Text>
          </Card>
        ) : null}

        {row.qr_image_url ? (
          <View>
            <SectionTitle
              title="Kod QR DuitNow"
              caption="Imbas dengan aplikasi perbankan, atau simpan imej ini ke telefon."
            />
            <View className="gap-4">
              <View className="rounded-card border border-line bg-surface p-4">
                <Image
                  source={{ uri: row.qr_image_url }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }}
                  contentFit="contain"
                  transition={150}
                  accessibilityLabel={'Kod QR DuitNow untuk ' + row.title}
                />
              </View>

              <SaveShareButtons
                kind="image"
                variant="secondary"
                webLabel="Muat Turun Kod QR"
                busy={saving}
                onPress={(mode) => void saveQr(mode)}
              />
              {notice ? <Notice tone="positive" message={notice} /> : null}
            </View>
          </View>
        ) : (
          <Notice
            tone="info"
            message="Kod QR untuk pembayaran ini belum disediakan. Hubungi Bendahari untuk maklumat pembayaran."
          />
        )}

        <View className="pb-8">
          <Text className="text-center text-xs text-ink-muted">
            Pembayaran masuk terus ke akaun organisasi melalui DuitNow. Simpan resit bank anda sebagai bukti —
            aplikasi ini tidak merekod transaksi tersebut.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
