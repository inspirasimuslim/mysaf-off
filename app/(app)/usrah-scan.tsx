import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

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
  findNearbyEvents,
  recordAttendance,
  recordProximityAttendance,
  type NearbyEvent,
  type AttendanceResult,
  type ScanMethod,
  type ScannedEvent,
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

const WEB_CAMERA_BLOCKED =
  'Kamera tidak dapat dibuka — sama ada disekat oleh pelayar, atau tiada kamera pada peranti ini. Benarkan Kamera melalui ikon gembok/tetapan laman di sebelah alamat dan muat semula halaman, atau ambil gambar kod QR dan tekan Upload dari Galeri di bawah.';

/** Bingkai sasaran di tengah suapan kamera. */
const FRAME = 240;

/** Kod yang sudah dipadankan dengan acara, menunggu lokasi. */
type PendingScan = { event: ScannedEvent; token: string; method: ScanMethod };

type Phase =
  /** Kamera hidup, menunggu kod QR. */
  | { step: 'imbas' }
  /** Kod sudah dibaca; program dicari, GPS dibaca, kehadiran direkod. */
  /** `hint`: peraturan lokasi acara yang baru dipadankan — hanya bila acara berpin. */
  | { step: 'proses'; note: string; hint?: string }
  | { step: 'berjaya'; result: AttendanceResult }
  /** Acara berpin tetapi lokasi gagal dibaca — ahli memilih langkah seterusnya. */
  | { step: 'lokasi'; target: PendingScan; message: string }
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
    Web: pelayar tidak membuka dialog kamera kali kedua selepas ditolak, dan
    expo-camera web sentiasa melapor `canAskAgain: true`. Tanpa ini butang
    "Benarkan Kamera" diam sahaja bila ditekan semula. `cameraError` juga
    menangkap kamera yang gagal dibuka (tiada kamera, digunakan app lain).
  */
  const [cameraAsked, setCameraAsked] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const askCamera = useCallback(async () => {
    setCameraError(null);
    const response = await requestPermission();
    setCameraAsked(true);
    if (!response.granted && Platform.OS === 'web') {
      setCameraError(WEB_CAMERA_BLOCKED);
    }
  }, [requestPermission]);

  /*
    `onBarcodeScanned` menembak berkali-kali sesaat selagi kod berada dalam
    bingkai. Tanpa pengadang ini, satu kod menghasilkan berpuluh permintaan
    serentak — dan yang kedua akan ditolak sebagai "sudah hadir" walaupun yang
    pertama baru sahaja berjaya. `useRef` dan bukan state kerana ia perlu benar
    SERTA-MERTA, sebelum render seterusnya.
  */
  const busy = useRef(false);

  /*
    Tekan Hadir (proximity): TAMBAHAN kepada imbasan QR. Lokasi dibaca SEKALI
    semasa skrin dibuka; jika ada program berdekatan, kad ditawarkan di atas
    kamera. Lokasi ditolak/gagal, atau tiada program sepadan = senyap sepenuhnya
    — tiada mesej, tiada ruang kosong. Pelayan mengesahkan semula geofence bila
    "Hadir" ditekan (`record_attendance_proximity`).
  */
  const [nearby, setNearby] = useState<{
    events: NearbyEvent[];
    coords: { latitude: number; longitude: number };
  } | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const coords = await currentCoords();
        const events = await findNearbyEvents(coords);
        if (active && events.length > 0) setNearby({ events, coords });
      } catch {
        // Senyap: imbasan QR biasa kekal seperti sedia ada.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Lokasi → rekod, bagi acara yang sudah dipadankan.
   *
   * `allowNoLocation` hanya benar bila ahli sendiri memilih "Teruskan sebagai
   * Online" selepas lokasi gagal dibaca pada acara hibrid.
   */
  const submit = useCallback(async (target: PendingScan, allowNoLocation: boolean) => {
    const { event, token, method } = target;

    // Program tanpa pin lokasi tidak boleh disemak jaraknya, jadi GPS
    // langsung tidak diminta — meminta kebenaran yang tidak akan digunakan
    // hanya melatih pengguna menolaknya.
    //
    // Bagi program berpin, `event_mode` menentukan peranan lokasi: acara
    // bersemuka MENOLAK luar kawasan, hibrid melabelnya online. Petunjuk
    // dipapar sebelum GPS dibaca.
    const hint = event.has_pin
      ? event.event_mode === 'hibrid'
        ? 'Kehadiran dari luar kawasan akan direkod sebagai Online.'
        : 'Anda mesti berada dalam kawasan program untuk rekod kehadiran.'
      : undefined;

    let coords: { latitude: number; longitude: number } | null = null;
    if (event.has_pin && !allowNoLocation) {
      setPhase({ step: 'proses', note: 'Membaca lokasi anda...', hint });
      try {
        coords = await currentCoords();
      } catch (caught) {
        /*
          Lokasi gagal TIDAK lagi dihantar senyap sebagai "tiada lokasi". Dahulu
          acara hibrid terus merekod Online — ahli yang berdiri dalam dewan
          (lazim di pelayar: kebenaran lokasi ditolak) tidak tahu kenapa.
          Kini sebabnya dipapar, dan ahli memilih: cuba lagi, atau (hibrid
          sahaja) teruskan sebagai Online.
        */
        setPhase({
          step: 'lokasi',
          target,
          message: caught instanceof ScanError ? caught.message : 'Gagal membaca lokasi semasa.',
        });
        return;
      }
    }

    setPhase({ step: 'proses', note: 'Merekod kehadiran...', hint });
    const result = await recordAttendance(event.id, token, coords, method);
    setPhase({ step: 'berjaya', result });
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;

    try {
      await work();
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

  const handleToken = useCallback(
    (rawToken: string, method: ScanMethod) =>
      run(async () => {
        const token = rawToken.trim();
        setPhase({ step: 'proses', note: 'Mencari program...' });

        const event = await findEventByQrToken(token);
        if (!event) {
          setPhase({
            step: 'gagal',
            tone: 'negative',
            message: 'Kod QR ini bukan kod kehadiran yang sah.',
          });
          return;
        }

        await submit({ event, token, method }, false);
      }),
    [run, submit],
  );

  const markPresent = useCallback(
    (eventId: string, coords: { latitude: number; longitude: number }) =>
      run(async () => {
        setPhase({ step: 'proses', note: 'Merekod kehadiran...' });
        const result = await recordProximityAttendance(eventId, coords);
        /*
          Buang HANYA program yang baru direkod — program lain kekal ditawarkan.
          Dahulu `run` mengosongkan keseluruhan senarai pada setiap tindakan,
          jadi selepas satu Hadir semua program lain hilang sehingga skrin dibuka semula.
        */
        setNearby((current) => {
          const events = current?.events.filter((item) => item.event_id !== eventId) ?? [];
          return current && events.length > 0 ? { ...current, events } : null;
        });
        setPhase({ step: 'berjaya', result });
      }),
    [run],
  );

  const nearbyCoords = nearby?.coords ?? null;

  const scanAgain = useCallback(() => {
    busy.current = false;
    setPhase({ step: 'imbas' });

    // Segarkan senarai daripada pelayan (ia sudah menapis program yang telah dihadiri,
    // termasuk melalui QR). Hasil kosong TIDAK menimpa senarai sedia ada: `findNearbyEvents`
    // memulangkan [] juga bila panggilan gagal, dan senarai tidak patut hilang kerana itu.
    if (nearbyCoords) {
      void findNearbyEvents(nearbyCoords).then((events) => {
        if (events.length > 0) setNearby((latest) => (latest ? { ...latest, events } : latest));
      });
    }
  }, [nearbyCoords]);

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
            {nearby ? (
              <View className="rounded-card border border-line bg-surface px-4 py-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="location" size={16} color={Colors.primary} />
                  <Text className="flex-1 text-sm font-semibold text-ink-muted">Anda berada berdekatan:</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tutup"
                    hitSlop={10}
                    onPress={() => setNearby(null)}
                    className="active:opacity-60">
                    <Ionicons name="close" size={18} color={Colors.inkFaint} />
                  </Pressable>
                </View>

                {nearby.events.map((item) => (
                  <View key={item.event_id} className="mt-2 flex-row items-center gap-3">
                    <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Hadir: ' + item.name}
                      onPress={() => void markPresent(item.event_id, nearby.coords)}
                      className="rounded-pill bg-primary px-4 py-1.5 active:opacity-80">
                      <Text className="text-sm font-bold text-white">Hadir</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {permission?.granted && !cameraError ? (
              <View
                className="overflow-hidden rounded-card border border-line bg-ink"
                style={{ height: 340 }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => void handleToken(data, 'scan')}
                  onMountError={() =>
                    setCameraError(
                      Platform.OS === 'web'
                        ? WEB_CAMERA_BLOCKED
                        : 'Kamera gagal dibuka. Tutup app lain yang menggunakan kamera, atau muat naik gambar kod QR dari galeri.',
                    )
                  }
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
                    {cameraError ??
                      (permission?.canAskAgain === false
                        ? 'Capaian kamera telah ditolak. Benarkannya dalam tetapan peranti, atau muat naik gambar kod QR dari galeri.'
                        : 'Kamera diperlukan untuk mengimbas kod QR program.')}
                  </Text>
                  {permission?.canAskAgain === false ? null : (
                    <Button
                      label={cameraAsked || cameraError ? 'Cuba Buka Kamera Lagi' : 'Benarkan Kamera'}
                      variant={cameraError ? 'secondary' : 'primary'}
                      className="w-full"
                      onPress={() => void askCamera()}
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

            {/* Jenis kehadiran acara belum diketahui di sini — jangan buat andaian. */}
            <Text className="text-center text-xs leading-5 text-ink-muted">
              Imbas atau muat naik kod QR untuk rekod kehadiran.
            </Text>
          </>
        ) : null}

        {phase.step === 'proses' ? (
          <Card>
            <View className="items-center gap-3 py-6">
              <Ionicons name="sync-outline" size={28} color={Colors.primary} />
              <Text className="text-base font-semibold text-ink">{phase.note}</Text>
              {phase.hint ? (
                <Text className="text-center text-sm leading-5 text-ink-muted">{phase.hint}</Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {phase.step === 'berjaya' ? (
          <>
            <Card tone="primary">
              <View className="items-center gap-3">
                <Ionicons name="checkmark-circle" size={44} color={Colors.white} />
                {/* Mod ialah label pelayan mengikut jarak dari pin — bukan pilihan ahli. */}
                <Text className="text-lg font-bold text-white">
                  {phase.result.attendance_mode === 'online'
                    ? 'Kehadiran Online Direkodkan'
                    : 'Kehadiran Bersemuka Direkodkan'}
                </Text>
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

        {phase.step === 'lokasi' ? (
          <>
            <Card>
              <View className="gap-2">
                <Text className="text-base font-semibold text-ink">{phase.target.event.name}</Text>
                <Text className="text-sm leading-5 text-ink-muted">
                  {phase.target.event.event_mode === 'hibrid'
                    ? 'Lokasi anda tidak dapat dibaca. Tanpa lokasi, kehadiran hanya boleh direkod sebagai Online.'
                    : 'Program ini memerlukan lokasi anda untuk mengesahkan anda berada dalam kawasan.'}
                </Text>
              </View>
            </Card>
            <Notice tone="warn" message={phase.message} />
            <Button label="Cuba Baca Lokasi Lagi" onPress={() => void run(() => submit(phase.target, false))} />
            {phase.target.event.event_mode === 'hibrid' ? (
              <Button
                label="Teruskan sebagai Online"
                variant="secondary"
                onPress={() => void run(() => submit(phase.target, true))}
              />
            ) : null}
            <Button label="Batal" variant="ghost" onPress={scanAgain} />
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
            message="Di pelayar, benarkan Kamera dan Lokasi bila diminta. Jika kamera tidak dapat dibuka, ambil gambar kod QR dan tekan Upload dari Galeri. Ketepatan lokasi pelayar komputer riba lebih rendah daripada telefon."
          />
        ) : null}
      </View>
    </Screen>
  );
}
