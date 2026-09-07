import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { LocationPicker } from '@/components/location-picker';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { useUsrahAccess } from '@/lib/department-access';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';
import { createUsrahEvent, uploadEventPoster } from '@/lib/usrah-events';

const DEFAULT_RADIUS = 100;
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

export default function UsrahEventCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useUsrahAccess();

  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState(today());
  const [eventTime, setEventTime] = useState('20:00');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS));

  /** URI tempatan; poster hanya dimuat naik SELEPAS program wujud. */
  const [posterUri, setPosterUri] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ tone: 'negative' | 'info'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedRadius = Number.parseInt(radius, 10);
  const radiusValid = Number.isFinite(parsedRadius) && parsedRadius >= MIN_RADIUS && parsedRadius <= MAX_RADIUS;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(eventDate);
  const timeValid = /^\d{2}:\d{2}$/.test(eventTime);
  const ready = name.trim().length > 0 && dateValid && timeValid && radiusValid;

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
        name: name.trim(),
        event_date: eventDate,
        event_time: eventTime,
        location_text: locationText.trim() || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        geofence_radius_meters: parsedRadius,
      });

      /*
        Poster dimuat naik selepas program wujud kerana nama objeknya ialah
        '<event_id>.jpg'. Kegagalan muat naik TIDAK membatalkan program yang
        sudah tercipta — admin dibawa ke skrin butiran dan boleh mencuba
        posternya semula di sana.
      */
      if (posterUri) {
        try {
          await uploadEventPoster(event.id, posterUri);
        } catch (caught) {
          setBanner({
            tone: 'info',
            message: toMalayError(caught, 'Program dicipta, tetapi poster gagal dimuat naik.'),
          });
        }
      }

      router.replace({ pathname: '/(app)/admin/usrah-event-detail', params: { id: event.id } });
    } catch (caught) {
      setBanner({ tone: 'negative', message: toMalayError(caught, 'Gagal mencipta program.') });
    } finally {
      setSaving(false);
    }
  }, [coords, eventDate, eventTime, locationText, name, parsedRadius, posterUri, ready, router, saving]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Cipta Program" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Mencipta program memerlukan kebenaran menyunting pada department LAJNAH TARBIAH."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Cipta Program"
        subtitle="Kod QR dijana automatik selepas program disimpan"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        <View>
          <SectionTitle title="Maklumat Program" />
          <View className="gap-4">
            <TextField
              label="Nama program"
              value={name}
              onChangeText={setName}
              editable={!saving}
              autoCapitalize="sentences"
              autoCorrect={false}
            />
            <DateTimeField label="Tarikh" mode="date" value={eventDate} onChange={setEventDate} disabled={saving} />
            <DateTimeField label="Masa" mode="time" value={eventTime} onChange={setEventTime} disabled={saving} />
            <TextField
              label="Lokasi"
              value={locationText}
              onChangeText={setLocationText}
              editable={!saving}
              autoCapitalize="sentences"
              autoCorrect={false}
            />
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

        <View>
          <SectionTitle
            title="Lokasi Peta"
            caption="Pin menentukan pusat geofence yang menyemak jarak semasa ahli mengimbas QR."
          />
          <LocationPicker
            latitude={coords?.latitude ?? null}
            longitude={coords?.longitude ?? null}
            radiusMeters={radiusValid ? parsedRadius : DEFAULT_RADIUS}
            onChange={setCoords}
            disabled={saving}
          />
        </View>

        <View>
          <SectionTitle title="Radius Geofence" />
          <TextField
            label={'Radius (meter, ' + MIN_RADIUS + '–' + MAX_RADIUS + ')'}
            value={radius}
            onChangeText={(value) => setRadius(value.replace(/[^\d]/g, '').slice(0, 4))}
            editable={!saving}
            keyboardType="number-pad"
          />
        </View>

        <View className="pb-8">
          {!ready ? (
            <View className="pb-3">
              <Notice
                tone="negative"
                message="Nama, tarikh (YYYY-MM-DD), masa (HH:MM) dan radius yang sah diperlukan sebelum program boleh dicipta."
              />
            </View>
          ) : null}

          <Button label="Cipta Program" loading={saving} disabled={saving || !ready} onPress={() => void create()} />
        </View>
      </View>
    </Screen>
  );
}
