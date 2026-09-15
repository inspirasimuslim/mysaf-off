import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { EventQrCard } from '@/components/event-qr-card';
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
import { useGoBack } from '@/lib/navigation';
import { RSVP_LABEL, fetchMyRsvp, rsvpOpen, setMyRsvp, type RsvpResponse } from '@/lib/rsvp';
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
 * Poster dan kod QR dipapar BERASINGAN. Kod QR dipapar sebagai thumbnail
 * kecil — ketik untuk besarkan, simpan atau kongsi — dan boleh diimbas kemudian
 * melalui "Upload dari Galeri" di tab Scan. Lihat
 * `20260913000025_event_qr_for_members.sql` dan `components/event-qr-card.tsx`.
 *
 * Data datang daripada `event_upcoming_directory()`: acara aktif sahaja, tanpa
 * koordinat pin atau tetapan geofence.
 */
export default function EventInfoScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [event, setEvent] = useState<UpcomingEvent | null>(null);
  const [loading, setLoading] = useState(true);

  // --- RSVP -------------------------------------------------------------------
  const [myRsvp, setMyRsvpState] = useState<RsvpResponse | null>(null);
  /** Jawapan yang sedang disimpan — spinner pada butang itu sahaja. */
  const [rsvpSaving, setRsvpSaving] = useState<RsvpResponse | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  const answerRsvp = useCallback(
    async (response: RsvpResponse) => {
      if (!event || rsvpSaving) return;

      setRsvpError(null);
      setRsvpSaving(response);
      try {
        await setMyRsvp(event.id, response);
        setMyRsvpState(response);
      } catch (caught) {
        setRsvpError(toMalayError(caught, 'Gagal menyimpan respon. Acara mungkin sudah tamat.'));
      } finally {
        setRsvpSaving(null);
      }
    },
    [event, rsvpSaving],
  );

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
        const [rows, mine] = await Promise.all([
          fetchUpcomingEvents(),
          // Jawapan sedia ada tidak kritikal: gagal dibaca bermakna butang tidak disorot, bukan skrin rosak.
          fetchMyRsvp(id).catch(() => null),
        ]);
        if (active) {
          setEvent(rows.find((row) => row.id === id) ?? null);
          setMyRsvpState(mine);
        }
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

        {/* --- Kod QR Kehadiran: thumbnail, ketik untuk besarkan ------------------ */}
        <EventQrCard
          token={event.qr_token}
          eventName={event.name}
          subtitle="Simpan atau screenshot kod ni untuk scan semasa program."
        />

        {/*
          --- RSVP ----------------------------------------------------------------
          Hanya sebelum `valid_until`: selepas itu RLS menolak jawapan, jadi
          butang yang dipapar hanya akan gagal. Direktori sudah menapis acara
          yang dimatikan.
        */}
        {rsvpOpen(event.valid_until) ? (
          <View>
            <SectionTitle title="Adakah anda akan hadir?" />
            <View className="flex-row gap-3">
              {(['hadir', 'tidak_hadir'] as const).map((response) => {
                const selected = myRsvp === response;
                return (
                  <View key={response} className="flex-1">
                    <Button
                      label={RSVP_LABEL[response]}
                      variant={selected ? 'primary' : 'secondary'}
                      className="px-3"
                      accessibilityState={{ selected, disabled: rsvpSaving !== null, busy: rsvpSaving === response }}
                      loading={rsvpSaving === response}
                      disabled={rsvpSaving !== null}
                      icon={selected ? <Ionicons name="checkmark" size={18} color={Colors.white} /> : undefined}
                      onPress={() => void answerRsvp(response)}
                    />
                  </View>
                );
              })}
            </View>
            <Text className="mt-2 text-center text-xs text-ink-muted">
              {myRsvp
                ? 'Respon anda: ' + RSVP_LABEL[myRsvp] + '. Boleh ditukar sehingga acara tamat.'
                : 'Belum memberi respon. Jawapan anda membantu penganjur membuat persediaan.'}
            </Text>
            {rsvpError ? (
              <View className="pt-2">
                <Notice tone="negative" message={rsvpError} />
              </View>
            ) : null}
          </View>
        ) : null}

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
