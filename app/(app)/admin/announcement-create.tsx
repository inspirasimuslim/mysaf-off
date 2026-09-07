import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
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

  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = title.trim().length > 0 && posterUri !== null;

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
      });

      router.replace('/(app)/admin/announcements');
    } catch (caught) {
      setBanner(toMalayError(caught, 'Gagal mencipta pengumuman.'));
    } finally {
      setSaving(false);
    }
  }, [description, isActive, posterUri, ready, router, saving, title]);

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
        {banner ? <Notice tone="negative" message={banner} /> : null}

        <View>
          <SectionTitle title="Poster" caption="Wajib. Dikecilkan kepada 1080px sebelum dimuat naik." />
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
