import { Image } from 'expo-image';
import { LinkifiedText } from '@/components/linkified-text';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { fetchAnnouncement } from '@/lib/announcements';
import { useGoBack } from '@/lib/navigation';
import type { Announcement } from '@/types/database';

/**
 * Satu pengumuman, penuh.
 *
 * Poster dipapar dengan `contentFit="contain"` dan bukan `cover`: kad carousel
 * memotong poster untuk mengekalkan barisan yang kemas, tetapi skrin ini ialah
 * tempat pengguna datang untuk MEMBACA apa yang tertulis di dalamnya, dan teks
 * yang terpotong menjadikan seluruh skrin ini tidak berguna.
 */
export default function AnnouncementInfoScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const row = await fetchAnnouncement(id);
        if (active) setAnnouncement(row);
      } catch {
        if (active) setAnnouncement(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <LoadingScreen />;

  if (!announcement) {
    return (
      <Screen padTop={false}>
        <ScreenHeader title="Pengumuman" onBackPress={goBack} />
        <View className="px-gutter">
          <EmptyState
            icon="megaphone-outline"
            title="Pengumuman tidak dijumpai"
            description="Pengumuman ini mungkin telah dipadam atau dimatikan. Kembali ke Utama dan cuba lagi."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Pengumuman"
        title={announcement.title}
        subtitle={new Date(announcement.created_at).toLocaleDateString('ms-MY')}
        onBackPress={goBack}
      />

      <View className="gap-6 px-gutter pt-6 pb-8">
        <Image
          source={{ uri: announcement.poster_url }}
          style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 20 }}
          contentFit="contain"
          transition={150}
          accessibilityLabel={'Poster ' + announcement.title}
        />

        {announcement.description ? (
          <LinkifiedText className="text-base leading-6 text-ink">{announcement.description}</LinkifiedText>
        ) : null}
      </View>
    </Screen>
  );
}
