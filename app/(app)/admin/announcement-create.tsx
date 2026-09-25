import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { OptionalDateField } from '@/components/ui/optional-date-field';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { ToastBanner } from '@/components/ui/toast';
import { useProgramAccess } from '@/lib/department-access';
import { createAnnouncement, uploadAnnouncementPoster } from '@/lib/announcements';
import { toMalayError } from '@/lib/errors';
import { pickImage } from '@/lib/image-upload';
import { useGoBack } from '@/lib/navigation';

/**
 * Cipta pengumuman.
 *
 * Poster WAJIB dan bukan pilihan, tidak seperti poster program. Carousel
 * pengumuman dibina sepenuhnya daripada imej — pengumuman tanpa poster akan
 * menjadi kotak kosong di skrin Utama setiap ahli.
 */
export default function AnnouncementCreateScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { loading: accessLoading, canEdit } = useProgramAccess();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [posterUri, setPosterUri] = useState<string | null>(null);

  /*
    Kosong bermakna "tiada had", dan itu default bagi kedua-duanya. Kebanyakan
    pengumuman hidup sehingga dimatikan; memaksa admin memilih dua tarikh untuk
    kes yang paling lazim menjadikan borang lebih panjang tanpa menjadikannya
    lebih berguna.
  */
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startValid = startDate === '' || datePattern.test(startDate);
  const endValid = endDate === '' || datePattern.test(endDate);
  const rangeValid = !startValid || !endValid || startDate === '' || endDate === '' || endDate >= startDate;

  const ready = title.trim().length > 0 && posterUri !== null && startValid && endValid && rangeValid;

  const choosePoster = useCallback(async () => {
    setBanner(null);
    try {
      const uri = await pickImage();
      if (uri) setPosterUri(uri);
    } catch (caught) {
      setBanner(toMalayError(caught, 'Gagal memilih poster.'));
    }
  }, []);

  const create = useCallback(async () => {
    if (!ready || saving || !posterUri) return;

    setBanner(null);
    setSaving(true);
    try {
      /*
        Poster dimuat naik SEBELUM baris dicipta, terbalik daripada aliran
        program. `poster_url` ialah kolum NOT NULL di sini, jadi tiada baris
        untuk dilampirkan fail kemudian — failnya perlu wujud dahulu.
      */
      const posterUrl = await uploadAnnouncementPoster(posterUri);

      await createAnnouncement({
        title: title.trim(),
        description: description.trim() || null,
        poster_url: posterUrl,
        is_active: isActive,
        start_date: startDate || null,
        end_date: endDate || null,
      });

      // `created=1`: senarai memapar notis "Pengumuman berjaya dicipta." — banner di
      // skrin INI tidak berguna kerana `router.replace` menutupnya serta-merta.
      router.replace({ pathname: '/(app)/admin/announcements', params: { created: '1' } });
    } catch (caught) {
      setBanner(toMalayError(caught, 'Gagal mencipta pengumuman.'));
    } finally {
      setSaving(false);
    }
  }, [description, endDate, isActive, posterUri, ready, router, saving, startDate, title]);

  if (accessLoading) return <LoadingScreen />;

  if (!canEdit) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Cipta Pengumuman" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="lock-closed-outline"
            title="Tiada akses"
            description="Mencipta pengumuman memerlukan kebenaran menyunting pada department JABATAN SETIAUSAHA."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Panel Admin"
        title="Cipta Pengumuman"
        subtitle="Dipapar di skrin Utama setiap ahli"
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6">
        {banner ? <ToastBanner tone="negative" message={banner} /> : null}

        <View>
          <SectionTitle title="Poster" />
          <View className="gap-3">
            {posterUri ? (
              <Image
                source={{ uri: posterUri }}
                style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 20 }}
                contentFit="contain"
                accessibilityLabel="Pratonton poster"
              />
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
          <SectionTitle title="Kandungan" />
          <View className="gap-4">
            <TextField
              label="Tajuk"
              value={title}
              onChangeText={setTitle}
              editable={!saving}
              autoCapitalize="sentences"
              autoCorrect={false}
            />
            <TextField
              label="Penerangan (pilihan)"
              value={description}
              onChangeText={setDescription}
              editable={!saving}
              autoCapitalize="sentences"
              multiline
              numberOfLines={6}
            />
          </View>
        </View>

        <View>
          <SectionTitle title="Tempoh Paparan" />
          <View className="gap-4">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <OptionalDateField label="Tarikh mula" value={startDate} onChange={setStartDate} disabled={saving} />
              </View>
              <View className="flex-1">
                <OptionalDateField label="Tarikh tamat" value={endDate} onChange={setEndDate} disabled={saving} />
              </View>
            </View>

            {!rangeValid ? (
              <Notice tone="negative" message="Tarikh tamat tidak boleh lebih awal daripada tarikh mula." />
            ) : null}
          </View>
        </View>

        <View className="pb-8 gap-4">
          <ToggleRow
            icon="eye-outline"
            title="Aktif"
            subtitle="Pengumuman aktif dipapar di skrin Utama setiap ahli."
            value={isActive}
            onValueChange={setIsActive}
            disabled={saving}
          />

          {!ready ? <Notice tone="negative" message="Poster dan tajuk diperlukan sebelum pengumuman boleh dicipta." /> : null}

          <Button
            label="Cipta Pengumuman"
            loading={saving}
            disabled={saving || !ready}
            onPress={() => void create()}
          />
        </View>
      </View>
    </Screen>
  );
}
