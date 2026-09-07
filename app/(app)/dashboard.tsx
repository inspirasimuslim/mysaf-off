import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PosterCarousel, type PosterItem } from '@/components/poster-carousel';
import { ScreenHeader } from '@/components/screen-header';
import { UsrahStrip } from '@/components/usrah-strip';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { fetchVisibleAnnouncements } from '@/lib/announcements';
import { displayName, useAuth } from '@/lib/auth-context';
import { fetchMyMemberLinked } from '@/lib/members';
import { usePermissions } from '@/lib/permissions';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import { fetchYuranSummary, ringgit, type YuranSummary } from '@/lib/yuran';
import { shortDateRangeLabel, type Announcement, type UpcomingEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isAdmin } = usePermissions();

  const [banner, setBanner] = useState<Banner>(null);

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [yuran, setYuran] = useState<YuranSummary | null>(null);

  /*
    Dibaca semula setiap kali skrin mendapat fokus, sama seperti `UsrahStrip`:
    program dicipta, pengumuman dihidupkan dan bayaran direkod dari skrin lain
    dalam sesi yang sama, jadi bacaan sekali semasa dipasang akan membekukan
    skrin Utama pada keadaan lama sehingga app dimulakan semula.

    Kegagalan bacaan MENYEMBUNYIKAN bahagiannya dan bukan memaparkan ralat.
    Semuanya di sini maklumat tambahan; ralat merah di atas sapaan pengguna
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
          const rows = await fetchVisibleAnnouncements();
          if (active) setAnnouncements(rows);
        } catch {
          if (active) setAnnouncements([]);
        }
      })();

      void (async () => {
        const userId = user?.id ?? null;
        if (!userId) return;

        try {
          const member = await fetchMyMemberLinked(userId);
          if (!active || !member) return;
          const summary = await fetchYuranSummary(member.id);
          if (active) setYuran(summary);
        } catch {
          if (active) setYuran(null);
        }
      })();

      return () => {
        active = false;
      };
    }, [user?.id]),
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

        {/*
          Dua kad separuh lebar. Yuran ialah satu-satunya perkara di skrin ini
          yang menuntut tindakan daripada ahli, jadi ia mengambil tempat kiri —
          di mana mata jatuh dahulu — dan Pip menunggu di sebelahnya sebagai
          ruang yang sudah ditempah, supaya susun atur tidak beralih bila ia tiba.
        */}
        <View className="flex-row gap-4">
          <YuranCard summary={yuran} onPress={() => router.push('/(app)/yuran')} />
          <ComingSoonCard icon="ribbon-outline" title="Status Pip" />
        </View>

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

/**
 * Status yuran — hijau bila tiada apa yang perlu dibuat, merah bila ada.
 *
 * Keadaan "belum dibaca" memaparkan em dash dan BUKAN sifar. Sifar bermakna
 * "anda tidak berhutang", dan itu jawapan yang tidak boleh diberikan sebelum
 * bacaan selesai.
 */
function YuranCard({ summary, onPress }: { summary: YuranSummary | null; onPress: () => void }) {
  const settled = summary !== null && summary.tertunggak === 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Status yuran"
      onPress={onPress}
      className="flex-1 active:opacity-70">
      <Card tone={settled ? 'primary' : 'surface'} className="min-h-[132px]">
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="wallet-outline"
            size={16}
            color={settled ? 'rgba(255,255,255,0.7)' : '#6B7280'}
          />
          <Text className={`text-sm ${settled ? 'text-white/70' : 'text-ink-muted'}`}>Status Yuran</Text>
        </View>

        {summary === null ? (
          <Text className="mt-3 text-stat font-bold text-ink-faint">—</Text>
        ) : settled ? (
          <>
            <Text className="mt-3 text-stat font-bold text-white">Lunas</Text>
            <Text className="mt-1 text-xs text-white/70">
              {summary.kredit > 0 ? 'Kredit ' + ringgit(summary.kredit) : 'Tiada tunggakan'}
            </Text>
          </>
        ) : (
          <>
            <Text className="mt-3 text-stat font-bold text-negative">{ringgit(summary.tertunggak)}</Text>
            <Text className="mt-1 text-xs text-ink-muted">Tertunggak</Text>
          </>
        )}
      </Card>
    </Pressable>
  );
}

/**
 * Ruang yang sudah ditempah untuk modul yang belum ada.
 *
 * Sengaja tidak boleh diketuk dan sengaja pudar: kad yang kelihatan hidup
 * tetapi tidak membuka apa-apa dibaca sebagai pepijat, bukan sebagai janji.
 */
function ComingSoonCard({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View className="flex-1 opacity-60">
      <Card className="min-h-[132px]">
        <View className="flex-row items-center gap-2">
          <Ionicons name={icon} size={16} color="#6B7280" />
          <Text className="text-sm text-ink-muted">{title}</Text>
        </View>
        <Text className="mt-3 text-stat font-bold text-ink-faint">—</Text>
        <Text className="mt-1 text-xs text-ink-muted">Akan Datang</Text>
      </Card>
    </View>
  );
}
