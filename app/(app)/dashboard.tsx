import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { PosterCarousel, type PosterItem } from '@/components/poster-carousel';
import { ScreenHeader } from '@/components/screen-header';
import { UsrahStrip } from '@/components/usrah-strip';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { displayName, useAuth } from '@/lib/auth-context';
import { fetchVisibleAnnouncements } from '@/lib/announcements';
import { usePermissions } from '@/lib/permissions';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import { shortDateRangeLabel, type Announcement, type UpcomingEvent } from '@/types/database';

/** Em dash sebagai placeholder nilai yang belum ada. */
const DASH = '—';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isAdmin } = usePermissions();

  const [banner, setBanner] = useState<Banner>(null);

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  /*
    Dibaca semula setiap kali skrin mendapat fokus, sama seperti `UsrahStrip`:
    program dicipta dan pengumuman dihidupkan dari skrin lain dalam sesi yang
    sama, jadi bacaan sekali semasa dipasang akan membekukan skrin Utama pada
    keadaan lama sehingga app dimulakan semula.

    Kegagalan bacaan MENYEMBUNYIKAN seksyen dan bukan memaparkan ralat. Kedua-dua
    carousel ialah maklumat tambahan; ralat merah di atas sapaan pengguna
    memberitahunya tentang masalah yang dia tidak boleh selesaikan.
  */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        try {
          const rows = await fetchUpcomingEvents();
          if (active) setEvents(rows);
        } catch {
          if (active) setEvents([]);
        }
      })();

      void (async () => {
        try {
          // Penapisan tetingkap tarikh berlaku dalam pertanyaan, bukan di sini:
          // menarik semua pengumuman untuk membuang kebanyakannya bermakna app
          // memuat turun poster yang tidak akan dipapar.
          const rows = await fetchVisibleAnnouncements();
          if (active) setAnnouncements(rows);
        } catch {
          if (active) setAnnouncements([]);
        }
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  const eventItems: PosterItem[] = events.map((event) => ({
    id: event.id,
    title: event.name,
    caption: shortDateRangeLabel(event.start_date, event.end_date),
    posterUrl: event.poster_url,
  }));

  const announcementItems: PosterItem[] = announcements.map((row) => ({
    id: row.id,
    title: row.title,
    caption: new Date(row.created_at).toLocaleDateString('ms-MY'),
    posterUrl: row.poster_url,
  }));

  return (
    <Screen padTop={false}>
      <ScreenHeader
        eyebrow="Assalamualaikum,"
        title={displayName(user)}
        subtitle={user?.email ?? undefined}
        /*
          Pintu masuk pentadbiran tidak wujud langsung dalam pokok komponen
          untuk ahli biasa — bukan sekadar disembunyikan. Ikon perisai sengaja
          berbeza daripada gear Tetapan di Profil supaya dua pintu itu tidak
          dikelirukan.
        */
        action={
          isAdmin()
            ? { icon: 'shield-half-outline', label: 'Hub Admin', onPress: () => router.push('/(app)/admin') }
            : undefined
        }
        onBellPress={() => setBanner({ tone: 'info', message: 'Tiada notifikasi baharu buat masa ini.' })}
      />

      <View className="gap-8 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/* Ringkasan utama - satu maklumat besar sahaja. */}
        <Card tone="primary">
          <Text className="text-sm text-white/70">Kehadiran bulan ini</Text>
          <Text className="mt-2 text-stat-lg font-bold text-white/50">{DASH}</Text>
          <Text className="mt-2 text-sm text-white/70">Modul kehadiran belum disambung ke pangkalan data.</Text>
        </Card>

        <UsrahStrip userId={user?.id ?? null} />

        {/*
          Dua carousel, kedua-duanya hilang sepenuhnya bila kosong. Skrin Utama
          bagi ahli yang tiada program dan tiada pengumuman patut kelihatan
          sengaja pendek, bukan seperti skrin yang gagal memuatkan.
        */}
        <PosterCarousel
          title="Program & Usrah"
          caption="Ketuk poster untuk melihat butiran penuh."
          items={eventItems}
          onPress={(id) => router.push({ pathname: '/(app)/event-info', params: { id } })}
        />

        <PosterCarousel
          title="Pengumuman"
          items={announcementItems}
          onPress={(id) => router.push({ pathname: '/(app)/announcement-info', params: { id } })}
        />
      </View>
    </Screen>
  );
}
