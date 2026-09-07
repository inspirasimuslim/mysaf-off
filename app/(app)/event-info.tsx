import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Colors } from '@/constants/theme';
import { useGoBack } from '@/lib/navigation';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import {
  EVENT_TYPE_LABEL,
  dateRangeLabel,
  timeRangeLabel,
  type UpcomingEvent,
} from '@/types/database';

/**
 * Butiran acara seperti dilihat oleh AHLI — paparan sahaja.
 *
 * TIADA kod QR di sini, dan itu keputusan keselamatan dan bukan kekurangan
 * ciri. Kod QR ialah bukti kehadiran: jika setiap ahli boleh membukanya dari
 * telefon sendiri, geofence menjadi satu-satunya halangan yang tinggal dan
 * sesiapa dalam radius boleh menandakan hadir tanpa datang ke majlis. Kod itu
 * dipegang admin, dipaparkan di lokasi, dan diimbas melalui tab Scan.
 *
 * Data datang daripada `event_upcoming_directory()`, jadi skrin ini tidak
 * pernah memegang `qr_token` mahupun koordinat pin — bukan sekadar tidak
 * memaparkannya.
 */
export default function EventInfoScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [event, setEvent] = useState<UpcomingEvent | null>(null);
  const [loading, setLoading] = useState(true);

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
