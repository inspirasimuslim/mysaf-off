import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationPicker } from '@/components/location-picker';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { PickerField } from '@/components/ui/picker-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { Segmented } from '@/components/ui/segmented';
import { StepperField } from '@/components/ui/stepper-field';
import { TextField } from '@/components/ui/text-field';
import { useProgramAccess, useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { createUsrahEvent, uploadEventPoster } from '@/lib/usrah-events';
import {
  EVENT_TYPE_OPTIONS,
  KAWASAN_USRAH_OPTIONS,
  MONTH_OPTIONS,
  usrahEventName,
  type EventType,
} from '@/types/database';

const DEFAULT_RADIUS = 100;
const RADIUS_STEP = 10;
const MIN_RADIUS = 10;
const MAX_RADIUS = 5000;

function today(): string {
  const now = new Date();
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  );
}

/**
 * Cipta acara berkod QR — usrah bulanan atau program am.
 *
 * Satu skrin dan bukan dua kerana segala-galanya selepas bahagian pertama
 * adalah sama: poster, lokasi, julat tarikh dan masa, geofence. Yang berbeza
 * hanyalah bagaimana acara itu DINAMAKAN, dan itu satu bahagian borang, bukan
 * satu skrin.
 *
 * Kebenaran diambil daripada KEDUA-DUA department, kerana jenis yang dipilih
 * menentukan yang mana berkuasa. Admin yang hanya memegang satu daripadanya
 * mendapat toggle yang terkunci pada jenis miliknya.
 */
export default function UsrahEventCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  /** `?type=program` daripada senarai Program; usrah bila tiada. */
  const params = useLocalSearchParams<{ type?: string }>();

  const usrahAccess = useUsrahAccess();
  const programAccess = useProgramAccess();
  const accessLoading = usrahAccess.loading || programAccess.loading;

  const [eventType, setEventType] = useState<EventType>(params.type === 'program' ? 'program' : 'usrah');

  // --- Nama -----------------------------------------------------------------
  const [programName, setProgramName] = useState('');
  const [kawasan, setKawasan] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string | null>(String(new Date().getMonth() + 1));

  // --- Sama untuk kedua-dua jenis -------------------------------------------
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [startTime, setStartTime] = useState('20:00');
  const [endTime, setEndTime] = useState('22:00');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);

  /** URI tempatan; poster hanya dimuat naik SELEPAS acara wujud. */
  const [posterUri, setPosterUri] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ tone: 'negative' | 'info' } & { message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = eventType === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit;

  /*
    Toggle disembunyikan apabila admin hanya memegang satu department: menawarkan
    pilihan yang pasti ditolak oleh RLS hanya menghasilkan kegagalan selepas
    borang siap diisi.
  */
  const typeOptions = useMemo(
    () => EVENT_TYPE_OPTIONS.filter((option) => (option.value === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit)),
    [programAccess.canEdit, usrahAccess.canEdit],
  );

  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = month ? Number.parseInt(month, 10) : null;
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;

  const generatedName = usrahEventName(kawasan, parsedMonth, yearValid ? parsedYear : null);
  const name = eventType === 'usrah' ? generatedName : programName.trim();

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  const rangeValid = dateValid && endDate >= startDate;
  const timeValid = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime);

  const nameValid = eventType === 'usrah' ? Boolean(kawasan) && yearValid && parsedMonth !== null : name.length > 0;
  const ready = nameValid && rangeValid && timeValid;

  const choosePoster = useCallback(async () => {
    setBanner(null);
    try {
      const uri = await pickImage();
      if (uri) setPosterUri(uri);
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal memilih poster.') });
    }
  }, []);

  const create = useCallback(async () => {
    if (!ready || saving) return;

    setBanner(null);
    setSaving(true);
    try {
      const event = await createUsrahEvent({
        name,
        event_type: eventType,
        // Kawasan, tahun dan bulan ialah bahasa usrah sahaja; kekangan
        // pangkalan data menolak baris 'program' yang membawanya.
        kawasan_usrah: eventType === 'usrah' ? kawasan : null,
        year: eventType === 'usrah' ? parsedYear : null,
        month: eventType === 'usrah' ? parsedMonth : null,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        location_text: locationText.trim() || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        geofence_radius_meters: radius,
      });

      /*
        Pada titik ini acara SUDAH wujud dengan kod QR yang sah — token dijana
        dalam INSERT di atas. Poster langkah berasingan dan opsyenal: nama
        objeknya '<event_id>.jpg', jadi ia hanya boleh dimuat naik selepas itu,
        dan kegagalannya tidak membatalkan acara.

        Status kegagalan dibawa ke skrin butiran sebagai parameter. Banner di
        skrin ini tidak berguna: `router.replace` menutup skrin ini serta-merta,
        jadi admin tidak pernah melihatnya dan menyangka semuanya berjaya.
      */
      let posterError: string | null = null;
      if (posterUri) {
        try {
          await uploadEventPoster(event.id, posterUri);
        } catch (caught) {
          posterError = toMalayError(caught, 'Ralat tidak diketahui.');
        }
      }

      router.replace({
        pathname: '/(app)/admin/usrah-event-detail',
        params: posterError ? { id: event.id, posterError } : { id: event.id },
      });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mencipta acara.') });
    } finally {
      setSaving(false);
    }
  }, [
    coords,
    endDate,
    endTime,
    eventType,
    kawasan,
    locationText,
    name,
    parsedMonth,
    parsedYear,
    posterUri,
    radius,
    ready,
    router,
    saving,
    startDate,
    startTime,
  ]);

  if (accessLoading) return <LoadingScreen />;

  if (typeOptions.length === 0) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Cipta Acara" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Mencipta acara memerlukan kebenaran menyunting pada LAJNAH TARBIAH (usrah) atau JABATAN SETIAUSAHA (program)."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title={eventType === 'usrah' ? 'Cipta Usrah' : 'Cipta Program'}
        subtitle="Kod QR dijana automatik selepas acara disimpan"
        onBackPress={goBack}
      />

      <View className="gap-5 px-gutter pt-5">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <View>
          <SectionTitle title="Jenis Acara" caption="Usrah masuk ke grid dua belas bulan; program tidak." />
          {typeOptions.length > 1 ? (
            <Segmented value={eventType} options={typeOptions} onChange={setEventType} disabled={saving} />
          ) : (
            <Notice
              tone="info"
              message={
                'Kebenaran anda membolehkan jenis "' +
                (typeOptions[0]?.label ?? '') +
                '" sahaja, jadi jenis itu dipilih secara automatik.'
              }
            />
          )}
        </View>

        {/* --- Nama: dijana untuk usrah, ditaip untuk program ------------------ */}
        <View>
          <SectionTitle title={eventType === 'usrah' ? 'Sesi Usrah' : 'Maklumat Program'} />
          <View className="gap-3">
            {eventType === 'usrah' ? (
              <>
                <PickerField
                  label="Kawasan usrah"
                  value={kawasan}
                  options={KAWASAN_USRAH_OPTIONS}
                  onChange={setKawasan}
                  disabled={saving}
                  clearable={false}
                />

                {/* Tahun dan bulan dibaca sebagai satu nilai, jadi ia duduk sebaris. */}
                <View className="flex-row items-start gap-3">
                  <View className="flex-1">
                    <TextField
                      label="Tahun"
                      value={year}
                      onChangeText={(value) => setYear(value.replace(/[^\d]/g, '').slice(0, 4))}
                      editable={!saving}
                      keyboardType="number-pad"
                      error={year.length > 0 && !yearValid ? 'Antara 2000 dan 2100.' : null}
                    />
                  </View>
                  <View className="flex-1">
                    <PickerField
                      label="Bulan"
                      value={month}
                      options={MONTH_OPTIONS}
                      onChange={setMonth}
                      disabled={saving}
                      clearable={false}
                    />
                  </View>
                </View>

                {/*
                  Nama dipapar dan bukan disunting: ia dijana daripada tiga medan
                  di atas, jadi membenarkannya ditaip bermakna nama dan kolum
                  boleh bercanggah — dan nama itulah yang dilihat ahli.
                */}
                <View className="rounded-field bg-primary-soft px-4 py-2.5">
                  <Text className="text-xs font-medium text-ink-muted">Nama sesi (dijana automatik)</Text>
                  <Text className="mt-0.5 text-base font-semibold text-ink">
                    {nameValid ? generatedName : 'Pilih kawasan, tahun dan bulan'}
                  </Text>
                </View>
              </>
            ) : (
              <TextField
                label="Nama program"
                value={programName}
                onChangeText={setProgramName}
                editable={!saving}
                autoCapitalize="sentences"
                autoCorrect={false}
              />
            )}
          </View>
        </View>

        <View>
          <SectionTitle title="Poster" caption="Pilihan. Dikecilkan kepada 1080px sebelum dimuat naik." />
          <Button
            label={posterUri ? 'Tukar Poster' : 'Pilih Poster'}
            variant="secondary"
            disabled={saving}
            onPress={() => void choosePoster()}
          />
        </View>

        {/*
          Nama tempat, pin dan radius dalam SATU bahagian: ketiga-tiganya
          menjawab soalan yang sama — di mana ahli mesti berada — dan radius
          dilaraskan sambil memandang bulatannya pada peta, jadi stepper duduk
          terus di bawah peta itu.
        */}
        <View>
          <SectionTitle
            title="Lokasi"
            caption="Pin menentukan pusat geofence yang menyemak jarak semasa ahli mengimbas QR."
          />
          <View className="gap-3">
            <TextField
              label="Nama tempat"
              value={locationText}
              onChangeText={setLocationText}
              editable={!saving}
              autoCapitalize="sentences"
              autoCorrect={false}
            />
            <LocationPicker
              latitude={coords?.latitude ?? null}
              longitude={coords?.longitude ?? null}
              radiusMeters={radius}
              onChange={setCoords}
              disabled={saving}
            />
            <StepperField
              label={'Radius geofence (' + MIN_RADIUS + '–' + MAX_RADIUS + ' m)'}
              value={radius}
              onChange={setRadius}
              step={RADIUS_STEP}
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              suffix="m"
              disabled={saving}
              caption="Kehadiran ditolak di luar bulatan. Longgarkan untuk dewan besar atau GPS lemah."
            />
          </View>
        </View>

        {/* --- Julat tarikh & masa: mula di kiri, tamat di kanan -------------- */}
        <View>
          <SectionTitle title="Tarikh & Masa" caption="Acara satu hari: tarikh mula dan tamat yang sama." />
          <View className="gap-3">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <DateTimeField label="Tarikh mula" mode="date" value={startDate} onChange={setStartDate} disabled={saving} />
              </View>
              <View className="flex-1">
                <DateTimeField label="Tarikh tamat" mode="date" value={endDate} onChange={setEndDate} disabled={saving} />
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <DateTimeField label="Masa mula" mode="time" value={startTime} onChange={setStartTime} disabled={saving} />
              </View>
              <View className="flex-1">
                <DateTimeField label="Masa tamat" mode="time" value={endTime} onChange={setEndTime} disabled={saving} />
              </View>
            </View>

            {dateValid && !rangeValid ? (
              <Notice tone="negative" message="Tarikh tamat tidak boleh lebih awal daripada tarikh mula." />
            ) : null}
          </View>
        </View>

        <View className="pb-8">
          {!canEdit ? (
            <View className="pb-3">
              <Notice
                tone="negative"
                message={
                  eventType === 'usrah'
                    ? 'Mencipta usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.'
                    : 'Mencipta program memerlukan kebenaran menyunting pada JABATAN SETIAUSAHA.'
                }
              />
            </View>
          ) : !ready ? (
            <View className="pb-3">
              <Notice
                tone="negative"
                message={
                  eventType === 'usrah'
                    ? 'Kawasan, tahun, bulan, julat tarikh dan masa yang sah diperlukan sebelum sesi boleh dicipta.'
                    : 'Nama program, julat tarikh dan masa yang sah diperlukan sebelum program boleh dicipta.'
                }
              />
            </View>
          ) : null}

          <Button
            label={eventType === 'usrah' ? 'Cipta Usrah' : 'Cipta Program'}
            loading={saving}
            disabled={saving || !ready || !canEdit}
            onPress={() => void create()}
          />
        </View>
      </View>
    </Screen>
  );
}
