import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PosterQrComposer, type PosterQrComposerHandle } from '@/components/poster-qr-composer';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors } from '@/constants/theme';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { fileSlug, shareImage } from '@/lib/image-share';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { fetchUsrahEvent, updateUsrahEvent, uploadEventPoster, uploadEventPosterWithQr } from '@/lib/usrah-events';
import {
  EVENT_TYPE_LABEL,
  USRAH_EVENT_STATUS_LABEL,
  dateRangeLabel,
  timeLabel,
  timeRangeLabel,
  usrahEventStatus,
  type UsrahEvent,
} from '@/types/database';

const QR_SIZE = 220;

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const STATUS_TONE = { aktif: 'positive', tamat: 'neutral', nonaktif: 'warn' } as const;

export default function UsrahEventDetailScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();
  /*
    Kebenaran diambil daripada KEDUA-DUA department kerana skrin ini melayan
    kedua-dua jenis acara, dan baris yang dimuatkan sendiri yang menentukan yang
    mana terpakai. RLS sudah menghalang bacaan silang jenis, jadi semakan di sini
    hanya menentukan sama ada butang sunting dipapar.
  */
  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const accessLoading = usrahAccess.loading || programAccess.loading;
  const canView = usrahAccess.canView || programAccess.canView;

  const [event, setEvent] = useState<UsrahEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  // --- Suntingan asas ---------------------------------------------------------
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [locationText, setLocationText] = useState('');

  const hydrate = useCallback((row: UsrahEvent) => {
    setEvent(row);
    setName(row.name);
    setStartDate(row.start_date);
    setEndDate(row.end_date);
    setStartTime(timeLabel(row.start_time));
    setEndTime(timeLabel(row.end_time));
    setLocationText(row.location_text ?? '');
  }, []);

  useEffect(() => {
    if (accessLoading || !canView || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const row = await fetchUsrahEvent(id);
        if (active && row) hydrate(row);
        else if (active) setEvent(null);
      } catch (caught) {
        if (active) setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuatkan program.') });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canView, hydrate, id]);

  const save = useCallback(async () => {
    if (!event || busy) return;

    setBanner(null);
    setBusy(true);
    try {
      hydrate(
        await updateUsrahEvent(event.id, {
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          location_text: locationText.trim() || null,
        }),
      );
      setBanner({ tone: 'positive', message: 'Perubahan telah disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
    } finally {
      setBusy(false);
    }
  }, [busy, endDate, endTime, event, hydrate, locationText, name, startDate, startTime]);

  const toggleActive = useCallback(
    async (next: boolean) => {
      if (!event || busy) return;

      setBanner(null);
      setBusy(true);
      try {
        hydrate(await updateUsrahEvent(event.id, { is_active: next }));
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menukar status program.') });
      } finally {
        setBusy(false);
      }
    },
    [busy, event, hydrate],
  );

  // --- Poster + kod QR -------------------------------------------------------
  const composerRef = useRef<PosterQrComposerHandle>(null);
  const [composeReady, setComposeReady] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);

  const generatePosterWithQr = useCallback(async () => {
    if (!event || qrBusy || !composerRef.current) return;

    setBanner(null);
    setQrBusy(true);
    try {
      const uri = await composerRef.current.capture();
      const url = await uploadEventPosterWithQr(event.id, uri);
      setEvent({ ...event, poster_with_qr_url: url });
      setBanner({ tone: 'positive', message: 'Poster dengan kod QR telah dijana dan disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana poster dengan kod QR.') });
    } finally {
      setQrBusy(false);
    }
  }, [event, qrBusy]);

  const sharePosterWithQr = useCallback(async () => {
    if (!event?.poster_with_qr_url) return;

    setBanner(null);
    try {
      await shareImage(event.poster_with_qr_url, 'poster-qr-' + fileSlug(event.name) + '.jpg', 'Poster ' + event.name);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal berkongsi poster.') });
    }
  }, [event]);

  const changePoster = useCallback(async () => {
    if (!event || busy) return;

    setBanner(null);
    setBusy(true);
    try {
      const uri = await pickImage();
      if (!uri) return;

      const url = await uploadEventPoster(event.id, uri);
      setEvent({ ...event, poster_url: url });
      setBanner({ tone: 'positive', message: 'Poster telah dikemas kini.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memuat naik poster.') });
    } finally {
      setBusy(false);
    }
  }, [busy, event]);

  if (accessLoading || loading) return <LoadingScreen />;

  if (!canView) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Butiran Program" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Butiran acara memerlukan kebenaran melihat pada LAJNAH TARBIAH (usrah) atau JABATAN SETIAUSAHA (program)."
          />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Butiran Program" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="alert-circle-outline"
            title="Program tidak dijumpai"
            description="Program ini mungkin telah dipadam. Kembali ke senarai dan cuba lagi."
          />
        </View>
      </Screen>
    );
  }

  const status = usrahEventStatus(event);

  // Jenis baris yang dimuatkan yang menentukan department mana berkuasa ke
  // atasnya — bukan kebenaran yang admin ini kebetulan pegang paling banyak.
  const canEdit = event.event_type === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit;

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title={event.name}
        subtitle={
          EVENT_TYPE_LABEL[event.event_type] +
          ' · ' +
          dateRangeLabel(event.start_date, event.end_date) +
          ' · ' +
          timeRangeLabel(event.start_time, event.end_time)
        }
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/* --- Kod QR -------------------------------------------------------- */}
        <View>
          <SectionTitle
            title="Kod QR Kehadiran"
            caption="Cetak atau kongsi tangkapan skrin kod ini. Ahli mengimbasnya untuk merekod kehadiran."
          />
          <Card>
            <View className="items-center gap-3">
              <View className="rounded-card bg-white p-4">
                <QRCode value={event.qr_token} size={QR_SIZE} color={Colors.ink} backgroundColor={Colors.white} />
              </View>

              <Badge label={USRAH_EVENT_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />

              <Text className="text-center text-xs text-ink-muted">
                Sah sehingga {new Date(event.valid_until).toLocaleString('ms-MY')}
              </Text>
              {status !== 'aktif' ? (
                <Notice
                  tone="warn"
                  message="Kod ini tidak lagi menerima kehadiran kerana program sudah tamat tempoh atau dimatikan."
                />
              ) : null}
            </View>
          </Card>
        </View>

        {/* --- Poster -------------------------------------------------------- */}
        <View>
          <SectionTitle title="Poster" />
          {event.poster_url ? (
            <Image
              source={{ uri: event.poster_url }}
              style={{ width: '100%', height: 200, borderRadius: 12 }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={'Poster ' + event.name}
            />
          ) : (
            <Text className="text-sm text-ink-muted">Tiada poster dimuat naik.</Text>
          )}

          {canEdit ? (
            <View className="pt-3">
              <Button
                label={event.poster_url ? 'Tukar Poster' : 'Muat Naik Poster'}
                variant="secondary"
                loading={busy}
                disabled={busy}
                onPress={() => void changePoster()}
              />
            </View>
          ) : null}
        </View>

        {/* --- Poster + kod QR ----------------------------------------------- */}
        {event.poster_url ? (
          <View>
            <SectionTitle
              title="Poster + Kod QR"
              caption="Satu imej untuk diedar: poster dengan kod QR kehadiran di penjuru. Poster asal di skrin Utama tidak berubah. Jana semula selepas menukar poster."
            />
            <PosterQrComposer
              ref={composerRef}
              posterUrl={event.poster_url}
              qrValue={event.qr_token}
              onReady={setComposeReady}
            />

            <View className="gap-3 pt-3">
              {canEdit ? (
                <Button
                  label={event.poster_with_qr_url ? 'Jana Semula Poster + QR' : 'Jana Poster + QR'}
                  loading={qrBusy}
                  disabled={qrBusy || busy || !composeReady}
                  onPress={() => void generatePosterWithQr()}
                />
              ) : null}
              {event.poster_with_qr_url ? (
                <Button
                  label="Kongsi / Muat Turun Poster + QR"
                  variant="secondary"
                  disabled={qrBusy}
                  onPress={() => void sharePosterWithQr()}
                />
              ) : null}
              {/*
                Imej ini sampai kepada setiap ahli melalui skrin butiran acara,
                dan sesiapa yang memegangnya memegang kod QR. Amaran ini
                kelihatan pada titik keputusan, bukan tersembunyi dalam dokumen.
              */}
              <Notice
                tone="warn"
                message="Ahli boleh menyimpan poster ini dan mengimbas kodnya dari galeri. Untuk program tanpa pin lokasi, kehadiran boleh dituntut dari mana-mana selagi program aktif."
              />
            </View>
          </View>
        ) : null}

        {/* --- Lokasi -------------------------------------------------------- */}
        <View>
          <SectionTitle title="Lokasi & Geofence" />
          <Card>
            <View className="gap-2">
              <Line label="Lokasi" value={event.location_text ?? 'Tiada'} />
              <Line
                label="Koordinat"
                value={
                  event.latitude !== null && event.longitude !== null
                    ? Number(event.latitude).toFixed(6) + ', ' + Number(event.longitude).toFixed(6)
                    : 'Tiada pin'
                }
              />
              <Line label="Radius" value={event.geofence_radius_meters + ' meter'} />
            </View>
          </Card>
        </View>

        {/* --- Suntingan ----------------------------------------------------- */}
        {canEdit ? (
          <>
            <View>
              <SectionTitle
                title="Status"
                caption="Mematikan program menghentikan kehadiran serta-merta, tanpa menunggu tetingkap masa tamat."
              />
              <ToggleRow
                icon="power-outline"
                title="Program aktif"
                subtitle="Matikan untuk menutup kehadiran lebih awal."
                value={event.is_active}
                onValueChange={(next) => void toggleActive(next)}
                disabled={busy}
              />
            </View>

            <View className="pb-8">
              <SectionTitle
                title="Sunting Maklumat"
                caption="Menukar tarikh atau masa TAMAT mengira semula tetingkap sah."
              />
              <View className="gap-4">
                <TextField
                  label={event.event_type === 'usrah' ? 'Nama sesi' : 'Nama program'}
                  value={name}
                  onChangeText={setName}
                  editable={!busy}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                />
                <DateTimeField
                  label="Tarikh mula"
                  mode="date"
                  value={startDate}
                  onChange={setStartDate}
                  disabled={busy}
                />
                <DateTimeField
                  label="Tarikh tamat"
                  mode="date"
                  value={endDate}
                  onChange={setEndDate}
                  disabled={busy}
                />
                <DateTimeField
                  label="Masa mula"
                  mode="time"
                  value={startTime}
                  onChange={setStartTime}
                  disabled={busy}
                />
                <DateTimeField
                  label="Masa tamat"
                  mode="time"
                  value={endTime}
                  onChange={setEndTime}
                  disabled={busy}
                />
                <TextField
                  label="Lokasi"
                  value={locationText}
                  onChangeText={setLocationText}
                  editable={!busy}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                />
                <Button
                  label="Simpan Perubahan"
                  loading={busy}
                  disabled={busy || !name.trim()}
                  onPress={() => void save()}
                />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-sm text-ink-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
