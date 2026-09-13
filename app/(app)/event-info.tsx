import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
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

/**
 * Butiran acara seperti dilihat oleh AHLI.
 *
 * Kod QR tidak dipapar sebagai kod hidup di sini. Bila admin menjana poster
 * ber-QR (`poster_with_qr_url`), ahli boleh MENYIMPAN imej itu dan mengimbasnya
 * kemudian melalui "Upload dari Galeri" di tab Scan — keputusan produk yang
 * sengaja, dengan akibat yang dicatat dalam `20260913000022_poster_with_qr.sql`:
 * geofence menjadi halangan utama kehadiran jarak jauh bagi acara itu.
 *
 * Data datang daripada `event_upcoming_directory()`, jadi skrin ini tidak
 * pernah memegang `qr_token` sebagai teks mahupun koordinat pin.
 */
export default function EventInfoScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [event, setEvent] = useState<UpcomingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savePosterWithQr = useCallback(async () => {
    if (!event?.poster_with_qr_url || saving) return;

    setSaveError(null);
    setSaving(true);
    try {
      await shareImage(event.poster_with_qr_url, 'poster-qr-' + fileSlug(event.name) + '.jpg', 'Simpan poster ' + event.name);
    } catch (caught) {
      setSaveError(toMalayError(caught, 'Gagal menyimpan poster.'));
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
        {event.poster_url ? (
          <Image
            source={{ uri: event.poster_url }}
            style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 20 }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={'Poster ' + event.name}
          />
        ) : null}

        {event.poster_with_qr_url ? (
          <View className="gap-2">
            <Button
              label="Simpan Poster (dengan QR)"
              variant="secondary"
              loading={saving}
              disabled={saving}
              onPress={() => void savePosterWithQr()}
            />
            <Text className="text-center text-xs text-ink-muted">
              Simpan ke galeri, kemudian imbas melalui tab Scan → Upload dari Galeri.
            </Text>
            {saveError ? <Notice tone="negative" message={saveError} /> : null}
          </View>
        ) : null}

        <View>
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

        <View className="pb-8">
          <Badge label="Imbas kod QR di lokasi untuk merekod kehadiran" tone="primary" />
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
