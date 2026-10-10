import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { ToggleRow } from '@/components/ui/toggle-row';
import { ToastBanner } from '@/components/ui/toast';
import { useProgramAccess, useUsrahKawasanAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { EventExtraInfoEditor } from '@/components/event-extra-info-editor';
import { EMPTY_EXTRA_DRAFT, saveEventExtraInfo, type ExtraInfoDraft } from '@/lib/event-extra-info';
import { createUsrahEvent, uploadEventPoster } from '@/lib/usrah-events';
import {
  EVENT_MODE_OPTIONS,
  MONTH_NAMES,
  MONTH_OPTIONS,
  usrahEventName,
  type EventMode,
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
 * Jenis DITENTUKAN oleh LALUAN MASUK (parameter `type`), BUKAN pilihan dalam
 * borang — usrah-events.tsx menghantar 'usrah', program-events.tsx menghantar
 * 'program'. Tiada toggle di sini: admin yang memegang KEDUA-DUA department
 * nampak DUA butang berasingan di skrin senarai masing-masing, bukan satu
 * borang dengan pilihan — menghalang acara jenis 'salah' dicipta dari laluan
 * yang salah.
 */
export default function UsrahEventCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  /** `?type=program` daripada senarai Program; usrah bila tiada — lihat nota di atas. */
  const params = useLocalSearchParams<{ type?: string }>();
  const eventType = params.type === 'program' ? 'program' : 'usrah';

  const usrahAccess = useUsrahKawasanAccess();
  const programAccess = useProgramAccess();
  const accessLoading = eventType === 'usrah' ? usrahAccess.loading : programAccess.loading;

  // --- Nama -----------------------------------------------------------------
  const [programName, setProgramName] = useState('');
  const [kawasan, setKawasan] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string | null>(String(new Date().getMonth() + 1));

  // --- Sama untuk kedua-dua jenis -------------------------------------------
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  /** Lalai Bersemuka Sahaja — lebih ketat; admin sengaja memilih Hibrid bila perlu. */
  const [eventMode, setEventMode] = useState<EventMode>('bersemuka');
  /** Program sahaja. Lalai OFF — admin sengaja menandanya. */
  const [gantiUsrah, setGantiUsrah] = useState(false);
  const [bermalam, setBermalam] = useState(false);
  /** Bulan usrah yang diganti — dipilih eksplisit, kosong sehingga admin memilih. */
  const [gantiYear, setGantiYear] = useState('');
  const [gantiMonth, setGantiMonth] = useState<string | null>(null);

  /** URI tempatan; poster hanya dimuat naik SELEPAS acara wujud. */
  const [posterUri, setPosterUri] = useState<string | null>(null);
  /** Maklumat tambahan (penerangan + poster lain) — togel, lalai tutup; disimpan selepas acara wujud. */
  const [extra, setExtra] = useState<ExtraInfoDraft>(EMPTY_EXTRA_DRAFT);

  const [banner, setBanner] = useState<{ tone: 'negative' | 'info' } & { message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = eventType === 'usrah' ? usrahAccess.canEdit : programAccess.canEdit;

  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = month ? Number.parseInt(month, 10) : null;
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;

  const generatedName = usrahEventName(kawasan, parsedMonth, yearValid ? parsedYear : null);
  const name = eventType === 'usrah' ? generatedName : programName.trim();

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  const rangeValid = dateValid && endDate >= startDate;
  const timeValid = /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime);

  const nameValid = eventType === 'usrah' ? Boolean(kawasan) && yearValid && parsedMonth !== null : name.length > 0;
  // Program ganti usrah wajib memilih tahun DAN bulan — kekangan pangkalan data yang sama.
  const parsedGantiYear = Number.parseInt(gantiYear, 10);
  const gantiYearValid = Number.isFinite(parsedGantiYear) && parsedGantiYear >= 2000 && parsedGantiYear <= 2100;
  const gantiValid = eventType !== 'program' || !gantiUsrah || (gantiYearValid && gantiMonth !== null);
  const ready = nameValid && rangeValid && timeValid && gantiValid;

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
        event_mode: eventMode,
        // Usrah sendiri memang usrah — penanda ini bermakna untuk program sahaja.
        bermalam,
        ganti_usrah: eventType === 'program' && gantiUsrah,
        // Bulan yang diganti dipilih admin — tiada kaitan dengan tarikh mula program.
        ganti_usrah_year: eventType === 'program' && gantiUsrah ? parsedGantiYear : null,
        ganti_usrah_month:
          eventType === 'program' && gantiUsrah && gantiMonth ? Number.parseInt(gantiMonth, 10) : null,
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

      // Maklumat tambahan: langkah berasingan juga — kegagalannya tidak membatalkan acara.
      let extraError: string | null = null;
      if (extra.enabled && (extra.description.trim() || extra.posters.length > 0)) {
        try {
          await saveEventExtraInfo(event.id, extra);
        } catch (caught) {
          extraError = toMalayError(caught, 'Ralat tidak diketahui.');
        }
      }

      router.replace({
        pathname: '/(app)/admin/usrah-event-detail',
        params: {
          id: event.id,
          ...(posterError ? { posterError } : {}),
          ...(extraError ? { extraError } : {}),
        },
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
    eventMode,
    extra,
    eventType,
    gantiMonth,
    gantiUsrah,
    bermalam,
    kawasan,
    parsedGantiYear,
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

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title={eventType === 'usrah' ? 'Cipta Usrah' : 'Cipta Program'} onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description={
              eventType === 'usrah'
                ? 'Mencipta usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.'
                : 'Mencipta program memerlukan kebenaran menyunting pada JABATAN SETIAUSAHA.'
            }
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
        {banner ? <ToastBanner tone={banner.tone} message={banner.message} /> : null}

        {/* --- Nama: dijana untuk usrah, ditaip untuk program ------------------ */}
        <View>
          <SectionTitle title={eventType === 'usrah' ? 'Sesi Usrah' : 'Maklumat Program'} />
          <View className="gap-3">
            {eventType === 'usrah' ? (
              <>
                <PickerField
                  label="Kawasan usrah"
                  value={kawasan}
                  options={usrahAccess.kawasanOptions}
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
              <>
                <TextField
                  label="Nama program"
                  value={programName}
                  onChangeText={setProgramName}
                  editable={!saving}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                />
                <ToggleRow
                  icon="bed-outline"
                  title="Bermalam"
                  subtitle={
                    bermalam
                      ? 'Bermalam: ahli yang mengesahkan hadir diwajibkan bermalam.'
                      : 'Tidak bermalam. Tukar ke bermalam jika ahli perlu menginap.'
                  }
                  value={bermalam}
                  onValueChange={setBermalam}
                  disabled={saving}
                />
                {/*
                  Program sahaja. Bulan yang diganti DIPILIH admin — tiada kaitan
                  dengan Tarikh Mula, yang kekal tarikh sebenar program (QR,
                  geofence, tempoh sah). Ayat di bawah mengikut pilihan itu.
                */}
                <ToggleRow
                  icon="swap-horizontal-outline"
                  title="Ganti Usrah"
                  subtitle={
                    !gantiUsrah
                      ? 'Kehadiran program ini boleh dikira sebagai kehadiran Usrah bagi bulan yang dipilih.'
                      : gantiYearValid && gantiMonth
                        ? 'Kehadiran program ini akan dikira sebagai kehadiran Usrah bulan ' +
                          (MONTH_NAMES[Number.parseInt(gantiMonth, 10) - 1] ?? '') +
                          ' ' +
                          parsedGantiYear +
                          '.'
                        : 'Pilih tahun dan bulan usrah yang digantikan.'
                  }
                  value={gantiUsrah}
                  onValueChange={setGantiUsrah}
                  disabled={saving}
                />
                {gantiUsrah ? (
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1">
                      <TextField
                        label="Tahun"
                        placeholder="Contoh: 2026"
                        value={gantiYear}
                        onChangeText={(value) => setGantiYear(value.replace(/[^\d]/g, '').slice(0, 4))}
                        editable={!saving}
                        keyboardType="number-pad"
                        error={gantiYear.length > 0 && !gantiYearValid ? 'Antara 2000 dan 2100.' : null}
                      />
                    </View>
                    <View className="flex-1">
                      <PickerField
                        label="Bulan"
                        value={gantiMonth}
                        options={MONTH_OPTIONS}
                        onChange={setGantiMonth}
                        disabled={saving}
                        clearable={false}
                      />
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>

        <View>
          <SectionTitle title="Poster" caption="Pilihan. Dikecilkan kepada 1080px sebelum dimuat naik." />
          <View className="gap-3">
            {/*
              Pratonton gambar yang BENAR-BENAR akan dimuat naik, sebelum acara
              dicipta. `contain` dan bukan `cover`: poster mesti kelihatan penuh
              supaya admin nampak jika tersilap pilih gambar atau terpotong.
              Kotak tinggi tetap supaya poster potret yang panjang tidak menolak
              baki borang jauh ke bawah.
            */}
            {posterUri ? (
              <View className="overflow-hidden rounded-card border border-line bg-surface">
                <Image
                  source={{ uri: posterUri }}
                  style={{ width: '100%', height: 320 }}
                  contentFit="contain"
                  transition={150}
                  accessibilityLabel="Pratonton poster"
                />
              </View>
            ) : null}
            <Button
              label={posterUri ? 'Tukar Poster' : 'Pilih Poster'}
              variant="secondary"
              disabled={saving}
              onPress={() => void choosePoster()}
            />
          </View>
        </View>

        <View>
          <SectionTitle title="Maklumat Tambahan" />
          <EventExtraInfoEditor value={extra} onChange={setExtra} disabled={saving} />
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
              onPlaceSelected={setLocationText}
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

        {/*
          --- Jenis kehadiran --------------------------------------------------
          Masih SATU kod QR. Pilihan ini hanya menentukan peranan geofence di
          atas: menghalang imbasan dari luar radius, atau menerimanya dan
          melabelnya online.
        */}
        <View>
          <SectionTitle
            title="Jenis Kehadiran"
            caption={
              eventMode === 'bersemuka'
                ? 'Imbasan dari luar radius geofence DITOLAK.'
                : 'Imbasan dari mana-mana lokasi diterima; luar radius dilabel Online.'
            }
          />
          <Segmented value={eventMode} options={EVENT_MODE_OPTIONS} onChange={setEventMode} disabled={saving} />
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
          {!ready ? (
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
            disabled={saving || !ready}
            onPress={() => void create()}
          />
        </View>
      </View>
    </Screen>
  );
}
