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
import { fetchPipisSummary, peratusLabel, ringgitBulat, type PipisSummary } from '@/lib/pipis';
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
  const [pipis, setPipis] = useState<PipisSummary | null>(null);

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

      /*
        Satu bacaan rekod ahli untuk dua kad. Yuran dan PIPIS dikunci pada
        `members.id` yang sama, jadi mencarinya dua kali hanya menambah satu
        perjalanan rangkaian untuk jawapan yang sudah ada.
      */
      void (async () => {
        const userId = user?.id ?? null;
        if (!userId) return;

        try {
          const member = await fetchMyMemberLinked(userId);
          if (!active || !member) return;

          const [yuranSummary, pipisSummary] = await Promise.all([
            fetchYuranSummary(member.id),
            fetchPipisSummary(member.id),
          ]);

          if (active) {
            setYuran(yuranSummary);
            setPipis(pipisSummary);
          }
        } catch {
          if (active) {
            setYuran(null);
            setPipis(null);
          }
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
      />

      <View className="gap-8 px-gutter pt-6">
        {banner ? <Notice tone={banner.tone} message={banner.message} /> : null}

        {/*
          Dua kad separuh lebar. Yuran ialah satu-satunya perkara di skrin ini
          yang menuntut tindakan daripada ahli, jadi ia mengambil tempat kiri —
          di mana mata jatuh dahulu — dan PIPIS di sebelahnya melaporkan
          sumbangan yang sudah dibuat, bukan sesuatu yang perlu dilangsaikan.
        */}
        <View className="flex-row gap-4">
          <YuranCard summary={yuran} onPress={() => router.push('/(app)/yuran')} />
          <PipisCard summary={pipis} onPress={() => router.push('/(app)/pipis')} />
        </View>

        <UsrahStrip userId={user?.id ?? null} />

        {/*
          Dua carousel, kedua-duanya hilang sepenuhnya bila kosong. Skrin Utama
          bagi ahli yang tiada program dan tiada pengumuman patut kelihatan
          sengaja pendek, bukan seperti skrin yang gagal memuatkan.
        */}
        <PosterCarousel
          title="Program & Usrah"
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
 * Sumbangan PIPIS ASET — peratus daripada sasaran RM5,000.
 *
 * Struktur kad sengaja SAMA seperti `YuranCard` di sebelahnya: ikon dan label
 * kecil di atas, satu angka besar, satu baris keterangan. Dua kad bersebelahan
 * yang membaca dengan cara berbeza menjadikan barisan itu kelihatan seperti dua
 * skrin yang bertindih.
 *
 * Keadaan "belum dibaca" memaparkan em dash dan BUKAN 0%. Sifar bermakna
 * "anda belum menyumbang", dan itu jawapan yang tidak boleh diberikan sebelum
 * bacaan selesai.
 */
function PipisCard({ summary, onPress }: { summary: PipisSummary | null; onPress: () => void }) {
  const reached = summary !== null && summary.jumlah >= summary.sasaran;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sumbangan PIPIS ASET"
      onPress={onPress}
      className="flex-1 active:opacity-70">
      <Card tone={reached ? 'primary' : 'surface'} className="min-h-[132px]">
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="business-outline"
            size={16}
            color={reached ? 'rgba(255,255,255,0.7)' : '#6B7280'}
          />
          <Text className={`text-sm ${reached ? 'text-white/70' : 'text-ink-muted'}`}>PIPIS ASET</Text>
        </View>

        {summary === null ? (
          <Text className="mt-3 text-stat font-bold text-ink-faint">—</Text>
        ) : (
          <>
            {/*
              Amaun mendapat saiz `stat`, peratus berada pada baris kecil di
              bawahnya. Peratus sahaja menjawab "sejauh mana" tetapi bukan
              "berapa" — dan ahli yang membuka kad ini selalunya mahu angka
              ringgit yang boleh dibandingkan dengan resit banknya.

              Sen dibuang: tiga aksara itu yang menolak peratus keluar dari
              kad selebar separuh skrin, dan ia tidak pernah mengubah jawapan.
            */}
            <Text
              className={`mt-3 text-stat font-bold ${reached ? 'text-white' : 'text-warn'}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {ringgitBulat(summary.jumlah)}
            </Text>
            <Text className={`mt-1 text-xs ${reached ? 'text-white/70' : 'text-ink-muted'}`}>
              {peratusLabel(summary.peratus) +
                ' · ' +
                (summary.jumlah > summary.sasaran
                  ? 'Lebih RM5,000'
                  : reached
                    ? 'Cukup RM5,000'
                    : 'dari RM5,000')}
            </Text>
          </>
        )}
      </Card>
    </Pressable>
  );
}
