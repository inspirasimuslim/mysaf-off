import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { createAdhocPayment, uploadPaymentQr } from '@/lib/adhoc-payments';
import { useYuranAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';

/**
 * Cipta satu jenis pembayaran adhoc.
 *
 * Kod QR PILIHAN dan bukan wajib, berbeza daripada poster pengumuman. Bendahari
 * selalunya mengumumkan tabung dahulu dan menerima kod QR daripada bank
 * beberapa hari kemudian; memaksanya memilih imej pada saat pertama bermakna
 * tabung itu tidak boleh disiapkan langsung sehingga QR sampai.
 */
export default function AdhocPaymentCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useYuranAccess();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [qrUri, setQrUri] = useState<string | null>(null);

  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = title.trim().length > 0;

  const chooseQr = useCallback(async () => {
    setBanner(null);
    try {
      const uri = await pickImage();
      if (uri) setQrUri(uri);
    } catch (caught) {
      setBanner(toMalayError(caught, 'Gagal memilih imej kod QR.'));
    }
  }, []);

  const create = useCallback(async () => {
    if (!ready || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      /*
        Imej dimuat naik SEBELUM baris dicipta supaya baris itu lengkap sejak
        saat pertama — tiada keadaan pertengahan di mana rekod wujud sambil
        menunggu failnya. Bila tiada imej dipilih, `null` yang disimpan.
      */
      const qrUrl = qrUri ? await uploadPaymentQr(qrUri) : null;

      await createAdhocPayment({
        title: title.trim(),
        description: description.trim() || null,
        qr_image_url: qrUrl,
        is_active: isActive,
      });

      router.replace('/(app)/admin/adhoc-payment-list');
    } catch (caught) {
      setBanner(toMalayError(caught, 'Gagal mencipta pembayaran.'));
    } finally {
      setSaving(false);
    }
  }, [description, isActive, qrUri, ready, router, saving, title]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Tambah Pembayaran" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Mencipta pembayaran memerlukan kebenaran menyunting pada department BENDAHARI."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Tambah Pembayaran"
        subtitle="Dipapar di tab Pembayaran setiap ahli"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone="negative" message={banner} /> : null}

        <View>
          <SectionTitle title="Kandungan" caption="Tajuk pendek; butiran penuh masuk dalam penerangan." />
          <View className="gap-4">
            <TextField
              label="Tajuk"
              placeholder="Contoh: Infaq Tabung Masjid"
              value={title}
              onChangeText={setTitle}
              editable={!saving}
              autoCapitalize="sentences"
              autoCorrect={false}
            />
            <TextField
              label="Penerangan (pilihan)"
              placeholder="Tujuan kutipan, sasaran, tempoh, dan apa-apa arahan pembayaran."
              value={description}
              onChangeText={setDescription}
              editable={!saving}
              autoCapitalize="sentences"
              multiline
              numberOfLines={6}
            />
          </View>
        </View>

        <View>
          <SectionTitle
            title="Kod QR DuitNow"
            caption="Pilihan — boleh ditambah kemudian dari senarai. Dikecilkan kepada 1400px sebelum dimuat naik."
          />
          <View className="gap-3">
            {qrUri ? (
              <View className="rounded-card border border-line bg-surface p-4">
                <Image
                  source={{ uri: qrUri }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }}
                  contentFit="contain"
                  accessibilityLabel="Pratonton kod QR"
                />
              </View>
            ) : null}
            <Button
              label={qrUri ? 'Tukar Kod QR' : 'Pilih Kod QR'}
              variant="secondary"
              disabled={saving}
              onPress={() => void chooseQr()}
            />
          </View>
        </View>

        <View className="gap-4 pb-8">
          <ToggleRow
            icon="eye-outline"
            title="Aktif"
            subtitle="Pembayaran aktif dipapar di tab Pembayaran setiap ahli."
            value={isActive}
            onValueChange={setIsActive}
            disabled={saving}
          />

          {!ready ? <Notice tone="negative" message="Tajuk diperlukan sebelum pembayaran boleh dicipta." /> : null}

          <Button
            label="Cipta Pembayaran"
            loading={saving}
            disabled={saving || !ready}
            onPress={() => void create()}
          />
        </View>
      </View>
    </Screen>
  );
}
