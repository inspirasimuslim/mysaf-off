import { Image } from 'expo-image';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { fetchAdhocPayment } from '@/lib/adhoc-payments';
import { toMalayError } from '@/lib/errors';
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
  const [saving, setSaving] = useState(false);

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
   * Serahkan imej QR kepada pengguna untuk disimpan.
   *
   * Dua platform, dua cara — sama seperti muat turun laporan: peranti menulis
   * ke cache dan menyerahkannya kepada share sheet sistem (dari situ pengguna
   * memilih "Simpan Imej"), manakala web mencetuskan muat turun terus.
   *
   * Melalui share sheet dan bukan tulisan terus ke galeri kerana menulis ke
   * galeri memerlukan `expo-media-library` dan kebenaran storan — satu
   * pergantungan dan satu dialog kebenaran lagi, untuk sesuatu yang share
   * sheet sudah lakukan.
   */
  const saveQr = useCallback(async () => {
    if (!row?.qr_image_url || saving) return;

    setError(null);
    setSaving(true);

    try {
      const fileName = 'qr-' + row.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 40) + '.jpg';

      if (Platform.OS === 'web') {
        const anchor = document.createElement('a');
        anchor.href = row.qr_image_url;
        anchor.download = fileName;
        anchor.target = '_blank';
        anchor.click();
        return;
      }

      const response = await fetch(row.qr_image_url);
      const bytes = new Uint8Array(await response.arrayBuffer());

      const directory = new Directory(Paths.cache, 'qr');
      if (!directory.exists) directory.create({ intermediates: true });

      const file = new File(directory, fileName);
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg', dialogTitle: row.title });
      }
    } catch (caught) {
      setError(toMalayError(caught, 'Gagal menyimpan kod QR.'));
    } finally {
      setSaving(false);
    }
  }, [row, saving]);

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

              <Button
                label="Simpan / Kongsi Kod QR"
                variant="secondary"
                loading={saving}
                disabled={saving}
                onPress={() => void saveQr()}
              />
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
