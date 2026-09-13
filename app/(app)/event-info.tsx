import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { fileSlug, shareImage } from '@/lib/image-share';
import { useGoBack } from '@/lib/navigation';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import {
  EVENT_TYPE_LABEL,
  dateRangeLabel,
  timeRangeLabel,
  type UpcomingEvent,
} from '@/types/database';

const QR_SIZE = 220;

/** Lebar imej kod QR yang disimpan — cukup tajam untuk diimbas semula dari galeri. */
const QR_IMAGE_WIDTH = 1080;

/**
 * Butiran acara seperti dilihat oleh AHLI.
 *
 * Poster dan kod QR dipapar BERASINGAN. Kod QR boleh disimpan sebagai imej dan
 * diimbas kemudian melalui "Upload dari Galeri" di tab Scan — keputusan produk
 * yang sengaja, dengan akibat yang dicatat dalam
 * `20260913000025_event_qr_for_members.sql`: geofence dan tetingkap masa ialah
 * halangan kehadiran jarak jauh.
 *
 * Data datang daripada `event_upcoming_directory()`: acara aktif sahaja, tanpa
 * koordinat pin atau tetapan geofence.
 */
export default function EventInfoScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [event, setEvent] = useState<UpcomingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Hanya kad putih kod QR yang ditangkap — bukan poster, bukan butang. */
  const qrRef = useRef<View>(null);
  const saveQr = useCallback(async () => {
    const view = qrRef.current;
    if (!event || saving || !view) return;

    setSaveError(null);
    setSaving(true);
    try {
      /*
        `captureRef` di web MENGABAIKAN `width` bila `height` tiada — imej keluar
        pada saiz skrin (~260px), terlalu kecil untuk diimbas semula dengan
        yakin. Kedua-duanya dihantar, mengikut nisbah kad sebenar.

        Diukur pada saat tangkapan dan bukan melalui `onLayout`: `onLayout`
        tidak dijamin sudah berjalan (contoh: tab pelayar di latar belakang),
        dan tanpa ukuran imej kembali ke saiz skrin tanpa sebarang ralat.
      */
      const measured = await new Promise<{ width: number; height: number }>((resolve) =>
        view.measure((_x, _y, width, height) => resolve({ width, height })),
      );
      const size = measured.width
        ? { width: QR_IMAGE_WIDTH, height: Math.round((QR_IMAGE_WIDTH * measured.height) / measured.width) }
        : {};
      const uri = await captureRef(qrRef, {
        format: 'jpg',
        quality: 1,
        ...size,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      await shareImage(uri, 'kod-qr-' + fileSlug(event.name) + '.jpg', 'Simpan kod QR ' + event.name);
    } catch (caught) {
      setSaveError(toMalayError(caught, 'Gagal menyimpan kod QR. Cuba ambil screenshot skrin ini.'));
    } finally {
      setSaving(false);
    }
  }, [event, saving]);

  useEffect(() => {
    if (!id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        /*
          Direktori dibaca semula dan bukan diserahkan melalui parameter
          navigasi: pautan dalam yang dibuka terus (contoh: refresh halaman di
          web) tidak membawa apa-apa selain `id`, dan skrin yang bergantung pada
          parameter yang dihantar akan kosong di situ.
        */
        const rows = await fetchUpcomingEvents();
        if (active) setEvent(rows.find((row) => row.id === id) ?? null);
      } catch {
        if (active) setEvent(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <LoadingScreen />;

  if (!event) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Butiran Acara" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="calendar-outline"
            title="Acara tidak dijumpai"
            description="Acara ini mungkin telah tamat atau dimatikan. Kembali ke Utama dan cuba lagi."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow={EVENT_TYPE_LABEL[event.event_type]}
        title={event.name}
        subtitle={dateRangeLabel(event.start_date, event.end_date)}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {/* --- Poster: tiada poster, tiada bahagian ------------------------------ */}
        {event.poster_url ? (
          <Image
            source={{ uri: event.poster_url }}
            style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 20 }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={'Poster ' + event.name}
          />
        ) : null}

        {/* --- Kod QR Kehadiran ---------------------------------------------- */}
        <View>
          <SectionTitle title="Kod QR Kehadiran" />
          <Card>
            <View className="items-center gap-3">
              {/*
                Sudut bulat pada pembalut SAHAJA: View yang ditangkap mesti segi
                empat tepat, kerana JPEG tiada ketelusan dan sudut bulat menjadi
                hitam atau putih dalam imej.
              */}
              <View style={{ borderRadius: 16, overflow: 'hidden' }}>
                <View
                  ref={qrRef}
                  collapsable={false}                  style={{ backgroundColor: Colors.white, padding: 20, alignItems: 'center', maxWidth: QR_SIZE + 40 }}>
                  <QRCode value={event.qr_token} size={QR_SIZE} color={Colors.ink} backgroundColor={Colors.white} />
                  {/* Nama acara ikut dalam imej supaya kod dalam galeri boleh dikenal pasti. */}
                  <Text
                    style={{ marginTop: 12, color: Colors.ink }}
                    className="text-center text-sm font-semibold"
                    numberOfLines={2}>
                    {event.name}
                  </Text>
                </View>
              </View>

              <Text className="text-center text-xs text-ink-muted">
                Screenshot atau muat turun kod ni untuk scan semasa program.
              </Text>
            </View>
          </Card>

          <View className="gap-3 pt-3">
            <Button
              label="Simpan/Screenshot Kod QR"
              loading={saving}
              disabled={saving}
              icon={<Ionicons name="download-outline" size={18} color={Colors.white} />}
              onPress={() => void saveQr()}
            />
            {saveError ? <Notice tone="negative" message={saveError} /> : null}
            <Button
              label="Ada Kod QR Lain? Upload dari Galeri"
              variant="secondary"
              icon={<Ionicons name="images-outline" size={18} color={Colors.ink} />}
              onPress={() => router.navigate('/(app)/usrah-scan')}
            />
          </View>
        </View>

        <View className="pb-8">
          <SectionTitle title="Maklumat" />
          <Card>
            <View className="gap-4">
              <Row icon="pricetag-outline" label="Jenis" value={EVENT_TYPE_LABEL[event.event_type]} />
              <Row
                icon="calendar-outline"
                label="Tarikh"
                value={dateRangeLabel(event.start_date, event.end_date)}
              />
              <Row
                icon="time-outline"
                label="Masa"
                value={timeRangeLabel(event.start_time, event.end_time)}
              />
              <Row icon="location-outline" label="Lokasi" value={event.location_text ?? 'Belum ditetapkan'} />
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <Ionicons name={icon} size={18} color={Colors.primary} />
      <View className="flex-1">
        <Text className="text-xs text-ink-muted">{label}</Text>
        <Text className="mt-0.5 text-base font-semibold text-ink">{value}</Text>
      </View>
    </View>
  );
}
