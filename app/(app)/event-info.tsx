import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { SaveShareButtons } from '@/components/save-share-buttons';
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
import type { DeliveryMode } from '@/lib/file-delivery';
import { deliverImage, fileSlug, imageDeliveryMessage } from '@/lib/image-share';
import { useGoBack } from '@/lib/navigation';
import { RSVP_LABEL, fetchMyRsvp, rsvpOpen, setMyRsvp, type RsvpResponse } from '@/lib/rsvp';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import {
  EVENT_TYPE_LABEL,
  dateRangeLabel,
  mytDateTimeLabel,
  timeRangeLabel,
  type UpcomingEvent,
} from '@/types/database';

const QR_SIZE = 220;

/** Lebar imej kod QR yang disimpan — cukup tajam untuk diimbas semula dari galeri. */
const QR_IMAGE_WIDTH = 1080;

/**
 * Satu kad kod QR dengan butang Simpan/Kongsi sendiri.
 *
 * Acara hibrid memapar DUA kad ini; setiap satu menangkap imejnya sendiri,
 * jadi keadaan simpan (spinner, mesej) tidak dikongsi antara keduanya.
 * `imageLabel` ('Bersemuka'/'Online') ikut dalam imej supaya dua kod dalam
 * galeri boleh dibezakan — acara bersemuka sahaja tidak memberinya, jadi
 * imejnya kekal sama seperti sebelum ini.
 */
function QrCard({
  title,
  token,
  eventName,
  imageLabel,
  caption,
}: {
  title: string;
  token: string;
  eventName: string;
  imageLabel?: string;
  caption: string;
}) {
  const [saving, setSaving] = useState<DeliveryMode | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Hanya kad putih kod QR yang ditangkap — bukan poster, bukan butang. */
  const qrRef = useRef<View>(null);
  const saveQr = useCallback(
    async (mode: DeliveryMode) => {
      const view = qrRef.current;
      if (saving || !view) return;

      setSaveError(null);
      setSaveNotice(null);
      setSaving(mode);
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
        const suffix = imageLabel ? imageLabel.toLowerCase() + '-' : '';
        const result = await deliverImage(
          uri,
          'kod-qr-' + suffix + fileSlug(eventName) + '.jpg',
          'Kod QR ' + (imageLabel ? imageLabel + ' ' : '') + eventName,
          mode,
        );
        setSaveNotice(imageDeliveryMessage(result));
      } catch (caught) {
        // Mesej di bawah umum — butiran sebenar (tangkapan skrin atau simpan native) hanya kelihatan di log Metro.
        console.warn('[event-info] simpan kod QR gagal:', caught);
        setSaveError(toMalayError(caught, 'Gagal menyimpan kod QR. Cuba ambil screenshot skrin ini.'));
      } finally {
        setSaving(null);
      }
    },
    [eventName, imageLabel, saving],
  );

  return (
    <View>
      <SectionTitle title={title} />
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
              collapsable={false}
              style={{ backgroundColor: Colors.white, padding: 20, alignItems: 'center', maxWidth: QR_SIZE + 40 }}>
              <QRCode value={token} size={QR_SIZE} color={Colors.ink} backgroundColor={Colors.white} />
              {/* Nama acara ikut dalam imej supaya kod dalam galeri boleh dikenal pasti. */}
              <Text
                style={{ marginTop: 12, color: Colors.ink }}
                className="text-center text-sm font-semibold"
                numberOfLines={2}>
                {eventName}
              </Text>
              {imageLabel ? (
                <Text style={{ marginTop: 2, color: Colors.ink }} className="text-center text-xs font-bold tracking-wide">
                  {'KOD QR ' + imageLabel.toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>

          <Text className="text-center text-xs text-ink-muted">{caption}</Text>
        </View>
      </Card>

      <View className="gap-3 pt-3">
        <SaveShareButtons
          kind="image"
          webLabel={'Simpan/Screenshot Kod QR' + (imageLabel ? ' ' + imageLabel : '')}
          busy={saving}
          onPress={(mode) => void saveQr(mode)}
        />
        {saveNotice ? <Notice tone="positive" message={saveNotice} /> : null}
        {saveError ? <Notice tone="negative" message={saveError} /> : null}
      </View>
    </View>
  );
}

/**
 * Butiran acara seperti dilihat oleh AHLI.
 *
 * Poster dan kod QR dipapar BERASINGAN. Kod QR boleh disimpan sebagai imej dan
 * diimbas kemudian melalui "Upload dari Galeri" di tab Scan — keputusan produk
 * yang sengaja, dengan akibat yang dicatat dalam
 * `20260913000025_event_qr_for_members.sql`: geofence dan tetingkap masa ialah
 * halangan kehadiran jarak jauh.
 *
 * Acara hibrid memapar dua kod: bersemuka (geofence) dan online (tempoh sahaja).
 * Ahli memilih cara hadir dengan memilih kod yang diambil — tiada toggle; mod
 * ditentukan pelayan mengikut kod yang diimbas.
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

  const hybrid =
    event.event_mode === 'hibrid' && event.online_qr_token && event.online_valid_from && event.online_valid_until;

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

        {/* --- Kod QR -------------------------------------------------------- */}
        {hybrid ? (
          <>
            <QrCard
              title="Kod QR Bersemuka"
              token={event.qr_token}
              eventName={event.name}
              imageLabel="Bersemuka"
              caption="Untuk ahli yang hadir fizikal ke lokasi program. Lokasi anda disemak semasa imbasan."
            />
            <QrCard
              title="Kod QR Online"
              token={event.online_qr_token as string}
              eventName={event.name}
              imageLabel="Online"
              caption={
                'Untuk ahli yang sertai secara maya. Sah dari ' +
                mytDateTimeLabel(event.online_valid_from as string) +
                ' hingga ' +
                mytDateTimeLabel(event.online_valid_until as string) +
                ', boleh diimbas dari mana-mana lokasi.'
              }
            />
          </>
        ) : (
          <QrCard
            title="Kod QR Kehadiran"
            token={event.qr_token}
            eventName={event.name}
            caption="Screenshot atau muat turun kod ni untuk scan semasa program."
          />
        )}

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
              {hybrid ? <Row icon="globe-outline" label="Kehadiran" value="Hibrid — bersemuka atau online" /> : null}
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
