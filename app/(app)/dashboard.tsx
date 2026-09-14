import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type TextStyle } from 'react-native';

import { PosterCarousel, useWebMouseScroll, type PosterItem } from '@/components/poster-carousel';
import { ScreenHeader } from '@/components/screen-header';
import { UsrahStrip } from '@/components/usrah-strip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { useAndroidExitPrompt } from '@/lib/android-back';
import { fetchVisibleAnnouncements } from '@/lib/announcements';
import { displayName, useAuth } from '@/lib/auth-context';
import { fetchBirthdaysToday, shortName, type BirthdayToday } from '@/lib/birthdays';
import { fetchMyMemberLinked } from '@/lib/members';
import { PIPIS_TARGET, fetchPipisSummary, peratusLabel, ringgitBulat, type PipisSummary } from '@/lib/pipis';
import { fetchUpcomingEvents } from '@/lib/usrah-events';
import { fetchYuranSummary, ringgit, type YuranSummary } from '@/lib/yuran';
import { shortDateRangeLabel, type Announcement, type UpcomingEvent } from '@/types/database';

type Banner = { tone: 'positive' | 'info' | 'negative'; message: string } | null;

/** Sama saiz dengan ikon kepala skrin (44px) ditambah bingkai 2px — sebaris dengan perisai dan gear. */
const AVATAR_SIZE = 44;

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  /* Utama ialah skrin akar selepas log masuk: back di sini bertanya sebelum menutup app. */
  const exitPrompt = useAndroidExitPrompt();

  const [banner, setBanner] = useState<Banner>(null);

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [yuran, setYuran] = useState<YuranSummary | null>(null);
  const [pipis, setPipis] = useState<PipisSummary | null>(null);
  const [profile, setProfile] = useState<{ fullName: string; avatarUrl: string | null } | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdayToday[]>([]);

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

      // Dibaca semula setiap fokus juga: app yang dibiarkan terbuka melepasi
      // tengah malam patut menukar senarai hari jadi bila Utama dibuka semula.
      void (async () => {
        try {
          const rows = await fetchBirthdaysToday();
          if (active) setBirthdays(rows);
        } catch {
          if (active) setBirthdays([]);
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

          // Rekod yang sama membawa gambar profil; dibaca semula setiap fokus,
          // jadi gambar yang baru ditukar di Profil kelihatan sebaik kembali.
          setProfile({ fullName: member.full_name, avatarUrl: member.avatar_url });

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
          Avatar di skrin Utama SAHAJA — di sinilah ahli disapa dengan namanya.
          Sebelum rekod ahli dibaca (atau bila akaun belum dipautkan), inisial
          daripada nama akaun dipapar supaya bulatan tidak melompat masuk kemudian.
        */
        leading={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka Profil"
            hitSlop={6}
            onPress={() => router.push('/(app)/profil')}
            className="rounded-pill border-2 border-white/40 active:opacity-70">
            <MemberAvatar
              fullName={profile?.fullName ?? displayName(user)}
              avatarUrl={profile?.avatarUrl ?? null}
              size={AVATAR_SIZE}
            />
          </Pressable>
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
          Tidak wujud langsung dalam pokok komponen bila tiada sesiapa lahir hari
          ini — tiada tajuk kosong, tiada teks "Tiada".
        */}
        {birthdays.length ? <BirthdayRow rows={birthdays} /> : null}

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

      <ConfirmDialog
        visible={exitPrompt.visible}
        title="Keluar Aplikasi"
        message="Adakah anda pasti mahu keluar aplikasi?"
        confirmLabel="Keluar"
        onConfirm={exitPrompt.exit}
        onCancel={exitPrompt.cancel}
      />
    </Screen>
  );
}

/**
 * Ahli yang lahir hari ini — satu baris chip teks, "Hafiz i12".
 *
 * Sengaja paling ringkas: tiada avatar, tiada kad. Ia ucapan kecil di tengah
 * skrin Utama, bukan seksyen yang bersaing dengan program dan yuran. Baris
 * ditatal ke tepi bila tidak muat; di web tetikus boleh menyeret atau memusing
 * roda, sama seperti carousel poster.
 */
function BirthdayRow({ rows }: { rows: BirthdayToday[] }) {
  const scrollRef = useRef<ScrollView>(null);
  useWebMouseScroll(scrollRef, true);

  return (
    <View>
      <SectionTitle title="Ahli yang lahir hari ini" />
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={row.full_name + ':' + index} className="rounded-pill bg-primary-soft px-3 py-1.5">
            <Text className="text-sm font-semibold text-primary">
              {shortName(row.full_name) + (row.generasi ? ' ' + row.generasi : '')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/*
  Kad gradient Utama. Warna ditulis terus kerana gradient tiada padanan dalam
  token Tailwind, dan kedua-dua kad mesti membaca sebagai satu keluarga:
  kotak ikon putih di kiri atas, chevron di kanan atas, satu angka besar.

  Kad Yuran memakai teks putih, jadi hujung gradient yang cerah dipilih cukup
  pekat untuk teks putih dan diberi bayang teks yang ringan. Kad PIPIS pastel
  memakai teks hijau gelap — bayang tidak diperlukan di situ.
*/
const YURAN_OWING = ['#F2894E', '#DC3F5E'] as const;
const YURAN_SETTLED = ['#0F5132', '#3FA66B'] as const;
const YURAN_LOADING = ['#9CA3AF', '#6B7280'] as const;
const PIPIS_GRADIENT = ['#A8E6CF', '#56C596'] as const;
const PIPIS_BAR = ['#2E9E63', '#0F5132'] as const;
const PIPIS_INK = '#0B3D2A';

/** Yuran tahunan tetap — label rujukan pada kad sahaja, bukan sumber pengiraan. */
const YURAN_TAHUNAN_LABEL = 'RM30';

const SOFT_SHADOW: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.18)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

/** Ringgit tanpa ".00" bila tiada sen — "RM90", tetapi "RM15.50" kekal lengkap. */
function ringgitRingkas(amount: number): string {
  return Number.isInteger(amount) ? 'RM' + amount : ringgit(amount);
}

/**
 * Rangka bersama dua kad: gradient penuh, kotak ikon, tajuk, chevron.
 * Pressable menjadi pembalut supaya SELURUH kad boleh diketuk.
 */
function GradientStatCard({
  colors,
  icon,
  iconColor,
  title,
  subtitle,
  ink,
  shadow,
  accessibilityLabel,
  onPress,
  children,
}: {
  colors: readonly [string, string];
  icon: ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  ink: string;
  shadow?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const textShadow = shadow ? SOFT_SHADOW : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-1 active:opacity-80">
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, minHeight: 148, borderRadius: 20, padding: 16 }}>
        <View className="flex-row items-start gap-2">
          <View
            className="h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
            {icon}
          </View>

          <View className="flex-1">
            <Text className="text-sm font-bold" style={[{ color: ink }, textShadow]} numberOfLines={2}>
              {title}
            </Text>
            <Text className="text-xs" style={[{ color: ink, opacity: 0.8 }, textShadow]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <View
            className="h-6 w-6 items-center justify-center rounded-pill"
            style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}>
            <Ionicons name="chevron-forward" size={14} color={iconColor} />
          </View>
        </View>

        <View className="mt-3 flex-1 justify-end">{children}</View>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Status yuran — gradient merah jambu bila ada tunggakan, hijau bila lunas.
 *
 * Keadaan "belum dibaca" memaparkan em dash di atas gradient kelabu dan BUKAN
 * sifar. Sifar bermakna "anda tidak berhutang", dan itu jawapan yang tidak
 * boleh diberikan sebelum bacaan selesai.
 */
function YuranCard({ summary, onPress }: { summary: YuranSummary | null; onPress: () => void }) {
  const settled = summary !== null && summary.tertunggak === 0;
  const colors = summary === null ? YURAN_LOADING : settled ? YURAN_SETTLED : YURAN_OWING;

  return (
    <GradientStatCard
      colors={colors}
      icon={<Ionicons name="calendar-outline" size={18} color={colors[1]} />}
      iconColor="#FFFFFF"
      title="Yuran Tahunan"
      subtitle={YURAN_TAHUNAN_LABEL}
      ink="#FFFFFF"
      shadow
      accessibilityLabel="Status yuran"
      onPress={onPress}>
      <Text
        className="text-stat font-bold text-white"
        style={SOFT_SHADOW}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {summary === null ? '—' : settled ? 'RM0' : ringgitRingkas(summary.tertunggak)}
      </Text>
      <Text className="mt-0.5 text-xs font-semibold text-white" style={SOFT_SHADOW} numberOfLines={1}>
        {summary === null
          ? 'Memuatkan'
          : settled
            ? summary.kredit > 0
              ? 'Lunas · Kredit ' + ringgitRingkas(summary.kredit)
              : 'Lunas'
            : 'Tunggakan'}
      </Text>
    </GradientStatCard>
  );
}

/**
 * Sumbangan PIPIS ASET — amaun, bar kemajuan dan peratus daripada sasaran.
 *
 * Bar dihadkan pada 100% lebar kerana sumbangan tiada siling: bar yang
 * melimpah keluar kad kelihatan rosak. Peratus SEBENAR (boleh melebihi 100%)
 * tetap dipapar sebagai teks di sebelahnya, jadi tiada maklumat hilang.
 *
 * Keadaan "belum dibaca" memaparkan em dash dan bar kosong, BUKAN RM0 / 0% —
 * sifar bermakna "anda belum menyumbang", dan itu jawapan yang tidak boleh
 * diberikan sebelum bacaan selesai.
 */
function PipisCard({ summary, onPress }: { summary: PipisSummary | null; onPress: () => void }) {
  const fill = summary === null ? 0 : Math.max(0, Math.min(summary.peratus, 100));

  return (
    <GradientStatCard
      colors={PIPIS_GRADIENT}
      icon={<MaterialCommunityIcons name="sprout" size={18} color={PIPIS_BAR[1]} />}
      iconColor={PIPIS_INK}
      title="PIPIS ASET"
      subtitle="Jumlah Kutipan"
      ink={PIPIS_INK}
      accessibilityLabel="Sumbangan PIPIS ASET"
      onPress={onPress}>
      {/* Sen dibuang: tiga aksara itu yang menolak angka keluar dari kad separuh lebar. */}
      <Text
        className="text-stat font-bold"
        style={{ color: PIPIS_INK }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {summary === null ? '—' : ringgitBulat(summary.jumlah)}
      </Text>

      <View className="mt-2 flex-row items-center gap-2">
        <View
          className="h-2 flex-1 overflow-hidden rounded-pill"
          style={{ backgroundColor: 'rgba(255,255,255,0.55)' }}>
          {fill > 0 ? (
            <LinearGradient
              colors={PIPIS_BAR}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${fill}%`, height: '100%', borderRadius: 999 }}
            />
          ) : null}
        </View>
        <Text className="text-xs font-bold" style={{ color: PIPIS_INK }}>
          {summary === null ? '—' : peratusLabel(summary.peratus)}
        </Text>
      </View>

      <Text className="mt-1 text-xs" style={{ color: PIPIS_INK, opacity: 0.8 }} numberOfLines={1}>
        {'Sasaran ' + ringgitBulat(summary?.sasaran ?? PIPIS_TARGET)}
      </Text>
    </GradientStatCard>
  );
}
