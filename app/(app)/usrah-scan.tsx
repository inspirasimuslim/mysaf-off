import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { pickImage } from '@/lib/image-upload';
import {
  ALREADY_RECORDED,
  ScanError,
  currentCoords,
  findEventByQrToken,
  recordAttendance,
  type AttendanceResult,
  type ScanMethod,
} from '@/lib/usrah-scan';
import { EVENT_TYPE_LABEL, dateRangeLabel, timeRangeLabel } from '@/types/database';

/**
 * Rekod kehadiran usrah dengan mengimbas kod QR program.
 *
 * Skrin ini TIDAK memutuskan sama ada kehadiran diterima. Ia mengumpul kod QR
 * dan koordinat GPS, menghantarnya ke `record_usrah_attendance()`, dan memapar
 * apa jua jawapan yang pulang. Setiap penolakan tiba dengan ayatnya sendiri —
 * jarak sebenar berbanding had geofence, program yang tamat tempoh, kehadiran
 * yang sudah direkodkan — jadi tiada satu pun daripadanya menjadi "ralat
 * berlaku" di sini.
 */

/** Bingkai sasaran di tengah suapan kamera. */
const FRAME = 240;

type Phase =
  /** Kamera hidup, menunggu kod QR. */
  | { step: 'imbas' }
  /** Kod sudah dibaca; program dicari, GPS dibaca, kehadiran direkod. */
  | { step: 'proses'; note: string }
  | { step: 'berjaya'; result: AttendanceResult }
  | { step: 'gagal'; message: string; tone: 'negative' | 'warn' };

export default function UsrahScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  /*
    Skrin ini ialah akar sebuah tab, jadi tiada anak panah kembali dan tiada
    `useGoBack()`: tiada skrin sebelumnya untuk dipulangkan. "Kembali ke Utama"
    bertukar tab, dan itu perbuatan yang berbeza daripada berundur.
  */
  const goHome = useCallback(() => router.navigate('/(app)/dashboard'), [router]);

  const [phase, setPhase] = useState<Phase>({ step: 'imbas' });
  const [picking, setPicking] = useState(false);

  /*
    `onBarcodeScanned` menembak berkali-kali sesaat selagi kod berada dalam
    bingkai. Tanpa pengadang ini, satu kod menghasilkan berpuluh permintaan
    serentak — dan yang kedua akan ditolak sebagai "sudah hadir" walaupun yang
    pertama baru sahaja berjaya. `useRef` dan bukan state kerana ia perlu benar
    SERTA-MERTA, sebelum render seterusnya.
  */
  const busy = useRef(false);

  const handleToken = useCallback(async (token: string, method: ScanMethod) => {
    if (busy.current) return;
    busy.current = true;

    try {
      setPhase({ step: 'proses', note: 'Mencari program...' });

      const event = await findEventByQrToken(token.trim());
      if (!event) {
        setPhase({
          step: 'gagal',
          tone: 'negative',
          message: 'Kod QR ini bukan kod kehadiran yang sah.',
        });
        return;
      }

      // Program tanpa pin lokasi tidak boleh disemak jaraknya, jadi GPS
      // langsung tidak diminta — meminta kebenaran yang tidak akan digunakan
      // hanya melatih pengguna menolaknya.
      let coords: { latitude: number; longitude: number } | null = null;
      if (event.has_pin) {
        setPhase({ step: 'proses', note: 'Mengesahkan lokasi anda...' });
        coords = await currentCoords();
      }

      setPhase({ step: 'proses', note: 'Merekod kehadiran...' });
      const result = await recordAttendance(event.id, coords, method);

      setPhase({ step: 'berjaya', result });
    } catch (caught) {
      const message =
        caught instanceof ScanError ? caught.message : 'Kehadiran tidak dapat direkodkan. Sila cuba lagi.';

      // "Sudah hadir" bukan kegagalan dari sudut pandangan pengguna — dia sudah
      // mendapat apa yang dituntutnya, jadi ia dipapar dengan nada amaran dan
      // bukan merah.
      const tone = caught instanceof ScanError && caught.code === ALREADY_RECORDED ? 'warn' : 'negative';

      setPhase({ step: 'gagal', tone, message });
    } finally {
      busy.current = false;
    }
  }, []);

  const scanAgain = useCallback(() => {
    busy.current = false;
    setPhase({ step: 'imbas' });
  }, []);

  /**
   * Kod QR daripada gambar yang tersimpan dalam galeri.
   *
   * `scanFromURLAsync` datang bersama expo-camera dan menggunakan pengesan
   * asli platform (dan polyfill `BarcodeDetector` di web), jadi tiada
   * perpustakaan penyahkod tambahan diperlukan — dan tiada pula kerja membaca
   * piksel secara manual, yang React Native tidak sediakan.
   */
  const uploadFromGallery = useCallback(async () => {
    if (picking || busy.current) return;
    setPicking(true);

    try {
      const uri = await pickImage();
      if (!uri) return;

      const found = await scanFromURLAsync(uri, ['qr']);
      const token = found[0]?.data;

      if (!token) {
        setPhase({
          step: 'gagal',
          tone: 'negative',
          message: 'Tiada kod QR dijumpai dalam gambar itu. Pastikan kod jelas dan tidak terpotong.',
        });
        return;
      }

      await handleToken(token, 'upload');
    } catch (caught) {
      setPhase({
        step: 'gagal',
        tone: 'negative',
        message:
          caught instanceof Error && caught.message
            ? caught.message
            : 'Gagal membaca gambar yang dipilih. Sila cuba gambar lain.',
      });
    } finally {
      setPicking(false);
    }
  }, [handleToken, picking]);

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Kehadiran"
        title="Scan QR"
        subtitle="Imbas kod QR program atau usrah untuk merekod kehadiran"
      />

      <View className="gap-6 px-gutter pt-6">
        {phase.step === 'imbas' ? (
          <>
            {permission?.granted ? (
              <View
                className="overflow-hidden rounded-card border border-line bg-ink"
                style={{ height: 340 }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => void handleToken(data, 'scan')}
                />

                {/* Bingkai sasaran — hiasan semata-mata; pengesan membaca seluruh bingkai. */}
                <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                  <View
                    style={{
                      width: FRAME,
                      height: FRAME,
                      borderWidth: 3,
                      borderColor: Colors.white,
                      borderRadius: 20,
                      opacity: 0.85,
                    }}
                  />
                </View>
              </View>
            ) : (
              <Card>
                <View className="items-center gap-4">
                  <View className="h-16 w-16 items-center justify-center rounded-pill bg-primary-soft">
                    <Ionicons name="camera-outline" size={28} color={Colors.primary} />
                  </View>
                  <Text className="text-center text-sm leading-5 text-ink-muted">
                    {permission?.canAskAgain === false
                      ? 'Capaian kamera telah ditolak. Benarkannya dalam tetapan peranti, atau muat naik gambar kod QR dari galeri.'
                      : 'Kamera diperlukan untuk mengimbas kod QR program.'}
                  </Text>
                  {permission?.canAskAgain === false ? null : (
                    <Button
                      label="Benarkan Kamera"
                      className="w-full"
                      onPress={() => void requestPermission()}
                    />
                  )}
                </View>
              </Card>
            )}

            <Button
              label="Upload dari Galeri"
              variant="secondary"
              loading={picking}
              disabled={picking}
              icon={<Ionicons name="images-outline" size={18} color={Colors.ink} />}
              onPress={() => void uploadFromGallery()}
            />

            <Text className="text-center text-xs leading-5 text-ink-muted">
              Kehadiran hanya diterima di dalam kawasan program dan sebelum tempohnya tamat. Pastikan GPS
              dihidupkan.
            </Text>
          </>
        ) : null}

        {phase.step === 'proses' ? (
          <Card>
            <View className="items-center gap-3 py-6">
              <Ionicons name="sync-outline" size={28} color={Colors.primary} />
              <Text className="text-base font-semibold text-ink">{phase.note}</Text>
            </View>
          </Card>
        ) : null}

        {phase.step === 'berjaya' ? (
          <>
            <Card tone="primary">
              <View className="items-center gap-3">
                <Ionicons name="checkmark-circle" size={44} color={Colors.white} />
                <Text className="text-lg font-bold text-white">Kehadiran Direkodkan</Text>
                <Text className="text-center text-base text-white/90">{phase.result.event_name}</Text>
                <Text className="text-sm text-white/70">
                  {EVENT_TYPE_LABEL[phase.result.event_type] +
                    ' · ' +
                    dateRangeLabel(phase.result.start_date, phase.result.end_date) +
                    ' · ' +
                    timeRangeLabel(phase.result.start_time, phase.result.end_time)}
                </Text>
                {phase.result.distance_meters !== null ? (
                  <Text className="text-sm text-white/70">
                    {'Jarak dari lokasi program: ' + Math.round(phase.result.distance_meters) + 'm'}
                  </Text>
                ) : null}
              </View>
            </Card>

            <Button label="Kembali ke Utama" onPress={goHome} />
            <Button label="Imbas Lagi" variant="secondary" onPress={scanAgain} />
          </>
        ) : null}

        {phase.step === 'gagal' ? (
          <>
            <Notice tone={phase.tone} message={phase.message} />
            <Button label="Cuba Lagi" onPress={scanAgain} />
            <Button label="Kembali ke Utama" variant="secondary" onPress={goHome} />
          </>
        ) : null}

        {Platform.OS === 'web' ? (
          <Notice
            tone="info"
            message="Di pelayar, kamera dan lokasi hanya berfungsi melalui HTTPS atau localhost, dan ketepatan GPS jauh lebih rendah daripada telefon. Gunakan app telefon untuk kehadiran sebenar."
          />
        ) : null}
      </View>
    </Screen>
  );
}
