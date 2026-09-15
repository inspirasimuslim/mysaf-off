import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { EventQrCard } from '@/components/event-qr-card';
import { SaveShareButtons } from '@/components/save-share-buttons';
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
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors } from '@/constants/theme';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { deliveryMessage, type DeliveryMode } from '@/lib/file-delivery';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { downloadRsvpList, fetchRsvpSummary, type RsvpSummary } from '@/lib/rsvp';
import { fetchUsrahEvent, updateUsrahEvent, uploadEventPoster } from '@/lib/usrah-events';
import {
  EVENT_MODE_LABEL,
  EVENT_MODE_OPTIONS,
  EVENT_TYPE_LABEL,
  USRAH_EVENT_STATUS_LABEL,
  dateRangeLabel,
  timeLabel,
  timeRangeLabel,
  usrahEventStatus,
  type EventMode,
  type UsrahEvent,
} from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

const STATUS_TONE = { aktif: 'positive', tamat: 'neutral', nonaktif: 'warn' } as const;

export default function UsrahEventDetailScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  /** `posterError`: dihantar oleh skrin cipta bila acara tercipta tetapi posternya gagal dimuat naik. */
  const { id, posterError } = useLocalSearchParams<{ id?: string; posterError?: string }>();
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
  const [eventMode, setEventMode] = useState<EventMode>('bersemuka');

  const hydrate = useCallback((row: UsrahEvent) => {
    setEvent(row);
    setName(row.name);
    setStartDate(row.start_date);
    setEndDate(row.end_date);
    setStartTime(timeLabel(row.start_time));
    setEndTime(timeLabel(row.end_time));
    setLocationText(row.location_text ?? '');
    setEventMode(row.event_mode);
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
          // Pelayan membaca nilai TERKINI pada setiap imbasan — tukar berkesan serta-merta.
          event_mode: eventMode,
        }),
      );
      setBanner({ tone: 'positive', message: 'Perubahan telah disimpan.' });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menyimpan perubahan.') });
    } finally {
      setBusy(false);
    }
  }, [busy, endDate, endTime, event, eventMode, hydrate, locationText, name, startDate, startTime]);

  /** Togol status program (`is_active`) atau kod QR (`qr_enabled`) — satu laluan kemas kini. */
  const toggleFlag = useCallback(
    async (patch: { is_active: boolean } | { qr_enabled: boolean }, failMessage: string) => {
      if (!event || busy) return;

      setBanner(null);
      setBusy(true);
      try {
        hydrate(await updateUsrahEvent(event.id, patch));
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, failMessage) });
      } finally {
        setBusy(false);
      }
    },
    [busy, event, hydrate],
  );

  // --- RSVP -------------------------------------------------------------------
  const [rsvp, setRsvp] = useState<RsvpSummary | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState<DeliveryMode | null>(null);
  const eventId = event?.id;

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    // Ringkasan ialah maklumat tambahan: kegagalannya tidak menghalang skrin.
    fetchRsvpSummary(eventId)
      .then((summary) => active && setRsvp(summary))
      .catch(() => active && setRsvp(null));

    return () => {
      active = false;
    };
  }, [eventId]);

  const downloadRsvp = useCallback(
    async (mode: DeliveryMode) => {
      if (!event || rsvpBusy) return;

      setBanner(null);
      setRsvpBusy(mode);
      try {
        const report = await downloadRsvpList(event.id, event.name, mode);
        setBanner({
          tone: report.result === 'cancelled' ? 'info' : 'positive',
          message: deliveryMessage(report.result, report.fileName, report.rows + ' respon'),
        });
      } catch (caught) {
        setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal menjana senarai RSVP.') });
      } finally {
        setRsvpBusy(null);
      }
    },
    [event, rsvpBusy],
  );

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

        {/* Hilang sendiri sebaik poster berjaya dimuat naik semula. */}
        {posterError && !event.poster_url ? (
          <Notice
            tone="warn"
            message={
              'Poster gagal dimuat naik, tetapi ' +
              EVENT_TYPE_LABEL[event.event_type].toLowerCase() +
              ' berjaya dicipta dan kod QR di bawah sudah sah. Cuba muat naik poster semula di bahagian Poster. Punca: ' +
              posterError
            }
          />
        ) : null}

        {/*
          --- Kod QR --------------------------------------------------------
          Thumbnail padat (ketik untuk besarkan & simpan). Status dan togol
          "Kod QR Aktif" duduk DALAM kad yang sama — bukan seksyen berasingan.
        */}
        <View className="gap-3">
          <EventQrCard
            token={event.qr_token}
            eventName={event.name}
            subtitle={'Sah sehingga ' + new Date(event.valid_until).toLocaleString('ms-MY')}
            dimmed={!event.qr_enabled || status !== 'aktif'}>
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge label={USRAH_EVENT_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
              {/* Jenis kehadiran: menentukan sama ada geofence menghalang atau melabel. */}
              <Badge
                label={EVENT_MODE_LABEL[event.event_mode]}
                tone={event.event_mode === 'hibrid' ? 'info' : 'primary'}
              />
              {!event.qr_enabled ? <Badge label="Kod QR dimatikan" tone="warn" /> : null}
            </View>

            {canEdit ? (
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">Kod QR Aktif</Text>
                  <Text className="text-xs text-ink-muted">
                    {event.qr_enabled
                      ? 'Ahli boleh merekod kehadiran.'
                      : 'Semua imbasan ditolak sehingga dihidupkan semula.'}
                  </Text>
                </View>
                <Switch
                  value={event.qr_enabled}
                  onValueChange={(next) => void toggleFlag({ qr_enabled: next }, 'Gagal menukar status kod QR.')}
                  disabled={busy}
                  trackColor={{ false: Colors.line, true: Colors.primaryMid }}
                  thumbColor={Colors.white}
                  ios_backgroundColor={Colors.line}
                  accessibilityLabel="Kod QR Aktif"
                />
              </View>
            ) : null}
          </EventQrCard>

          {status !== 'aktif' ? (
            <Notice
              tone="warn"
              message="Kod ini tidak lagi menerima kehadiran kerana program sudah tamat tempoh atau dimatikan."
            />
          ) : null}

          {/* Paparan besar untuk laptop/projektor semasa program berlangsung. */}
          <Button
            label="Lihat Kehadiran Live"
            variant="secondary"
            onPress={() => router.push({ pathname: '/(app)/admin/event-attendance-live', params: { id: event.id } })}
          />
        </View>

        {/* --- RSVP ---------------------------------------------------------- */}
        <View>
          <SectionTitle
            title="RSVP Ahli"
            caption="Belum respon dikira terhadap semua ahli aktif yang mempunyai akaun."
          />
          <Card>
            <View className="gap-4">
              <View className="flex-row">
                <RsvpStat value={rsvp?.hadir} label="Akan Hadir" />
                <RsvpStat value={rsvp?.tidak_hadir} label="Tidak Hadir" />
                <RsvpStat value={rsvp?.belum} label="Belum Respon" />
              </View>
              <Text className="text-center text-xs text-ink-muted">
                {rsvp
                  ? rsvp.hadir + ' Akan Hadir · ' + rsvp.tidak_hadir + ' Tidak Hadir · ' + rsvp.belum + ' Belum Respon'
                  : 'Ringkasan RSVP tidak dapat dimuatkan.'}
              </Text>
            </View>
          </Card>
          <View className="pt-3">
            <SaveShareButtons
              kind="file"
              variant="secondary"
              webLabel="Muat Turun Senarai RSVP"
              nativeCaption="Senarai RSVP (.xlsx)"
              busy={rsvpBusy}
              onPress={(mode) => void downloadRsvp(mode)}
            />
          </View>
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

        {/* --- Lokasi -------------------------------------------------------- */}
        <View>
          <SectionTitle
            title="Lokasi & Geofence"
            caption="Imbasan dalam radius dilabel Bersemuka; di luar radius dilabel Online. Geofence tidak menolak kehadiran."
          />
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
                onValueChange={(next) => void toggleFlag({ is_active: next }, 'Gagal menukar status program.')}
                disabled={busy}
              />
            </View>

            <View className="pb-8">
              <SectionTitle
                title="Sunting Maklumat"
                caption="Menukar tarikh atau masa TAMAT mengira semula tetingkap sah."
              />
              <View className="gap-3">
                <TextField
                  label={event.event_type === 'usrah' ? 'Nama sesi' : 'Nama program'}
                  value={name}
                  onChangeText={setName}
                  editable={!busy}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                />
                {/* Mula di kiri, tamat di kanan — sama seperti skrin cipta. */}
                <View className="flex-row items-start gap-3">
                  <View className="flex-1">
                    <DateTimeField label="Tarikh mula" mode="date" value={startDate} onChange={setStartDate} disabled={busy} />
                  </View>
                  <View className="flex-1">
                    <DateTimeField label="Tarikh tamat" mode="date" value={endDate} onChange={setEndDate} disabled={busy} />
                  </View>
                </View>
                <View className="flex-row items-start gap-3">
                  <View className="flex-1">
                    <DateTimeField label="Masa mula" mode="time" value={startTime} onChange={setStartTime} disabled={busy} />
                  </View>
                  <View className="flex-1">
                    <DateTimeField label="Masa tamat" mode="time" value={endTime} onChange={setEndTime} disabled={busy} />
                  </View>
                </View>
                <Segmented
                  label="Jenis kehadiran"
                  value={eventMode}
                  options={EVENT_MODE_OPTIONS}
                  onChange={setEventMode}
                  disabled={busy}
                />
                <Text className="-mt-1 text-xs text-ink-muted">
                  {eventMode === 'bersemuka'
                    ? 'Imbasan dari luar radius geofence ditolak.'
                    : 'Imbasan dari mana-mana lokasi diterima; luar radius dilabel Online.'}
                </Text>
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

function RsvpStat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
        {value ?? '–'}
      </Text>
      <Text className="mt-0.5 text-xs text-ink-muted">{label}</Text>
    </View>
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
