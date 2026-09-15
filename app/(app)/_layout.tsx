import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContactAdminLink } from '@/components/contact-admin';
import { ForcePasswordChange } from '@/components/force-password-change';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Colors } from '@/constants/theme';
import { useAndroidBackNavigation } from '@/lib/android-back';
import { useAuth } from '@/lib/auth-context';
import { activityCaptureProps, useIdleTimeout } from '@/lib/idle-timer';
import { signOutEverywhere } from '@/lib/session';
import { SUSPENDED_MESSAGE, setAuthNotice, useAccountStatus } from '@/lib/suspension';
import { EXPIRED_MESSAGE, fetchPasswordStatus, type PasswordStatus } from '@/lib/temp-password';

type IconName = keyof typeof Ionicons.glyphMap;

/** Ikon aktif: hijau di dalam pill hijau muda. */
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View className={`h-8 w-14 items-center justify-center rounded-pill ${focused ? 'bg-primary-soft' : ''}`}>
      <Ionicons name={name} size={20} color={focused ? Colors.primary : Colors.inkFaint} />
    </View>
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused }: { focused: boolean }) => <TabIcon name={focused ? active : inactive} focused={focused} />;
}

/**
 * Tab Scan — bulatan hijau pekat, ikon putih, lebih besar daripada yang lain.
 *
 * Sengaja tidak mengikut gaya lima tab yang lain. Mengimbas kod QR ialah
 * satu-satunya tindakan pada bar ini yang seorang ahli datang ke app untuk
 * MELAKUKAN dan bukan untuk MELIHAT, jadi ia kelihatan seperti butang dan bukan
 * seperti destinasi.
 *
 * `marginTop` negatif mengangkatnya keluar dari barisan; tanpa itu bulatan yang
 * lebih besar hanya menolak label tab ke bawah dan merosakkan penjajaran.
 */
function ScanTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{ marginTop: -10 }}
      className={`h-14 w-14 items-center justify-center rounded-pill ${
        focused ? 'bg-primary-dark' : 'bg-primary'
      }`}>
      <Ionicons name="qr-code" size={26} color={Colors.white} />
    </View>
  );
}

/**
 * Dipapar sebentar sementara sesi ditamatkan.
 *
 * Log keluar berlaku SERTA-MERTA dan bukan menunggu ketukan: selagi sesi hidup,
 * token akaun itu masih sah terhadap Supabase. Mesejnya diserahkan kepada skrin
 * log masuk melalui `setAuthNotice`, kerana komponen ini dilepaskan sebaik sesi
 * hilang dan tidak sempat memaparkan apa-apa.
 *
 * `signOutEverywhere` dan bukan `signOutFromDevice`: laluan peranti sengaja
 * mengekalkan sesi pelayan hidup untuk log masuk biometrik, yang bermakna akaun
 * yang disekat masih memegang pintasan masuk. Sekatan mesti membatalkannya.
 */
function AccountSuspended() {
  useEffect(() => {
    setAuthNotice(SUSPENDED_MESSAGE);
    void signOutEverywhere();
  }, []);

  return (
    <Screen>
      <View className="gap-6 px-gutter pt-6">
        <EmptyState icon="ban-outline" title="Akaun Disekat" description={SUSPENDED_MESSAGE} />
        <Text className="text-center text-sm text-ink-muted">Sedang log keluar...</Text>
      </View>
    </Screen>
  );
}

/**
 * Status akaun tidak dapat disahkan pada semakan pertama.
 *
 * App DITAHAN di sini dan bukan dibenarkan masuk. Tanpa jawapan, tiada bukti
 * akaun ini dibenarkan — dan membenarkan masuk bermakna sekatan boleh dilangkau
 * hanya dengan mematikan talian semasa app dibuka.
 */
function AccountCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <View className="gap-6 px-gutter pt-6">
        <EmptyState
          icon="cloud-offline-outline"
          title="Status Akaun Tidak Disahkan"
          description="Sambungan ke pelayan gagal, jadi status akaun anda tidak dapat disahkan. Semak talian internet anda dan cuba lagi."
        />
        <Button label="Cuba Lagi" onPress={onRetry} />
        <Button label="Log Keluar" variant="ghost" onPress={() => void signOutEverywhere()} />
      </View>
    </Screen>
  );
}

/**
 * Tetingkap log masuk sementara sudah berlalu.
 *
 * Bentuknya sama seperti `AccountSuspended` — log keluar serta-merta, mesej
 * diserahkan kepada skrin log masuk — kerana kesannya sama: akaun ini tidak
 * boleh masuk lagi. Yang berbeza ialah SEBABnya dan jalan keluarnya, dan jalan
 * keluar itu memerlukan seorang manusia, jadi nombornya diberikan di sini
 * dan bukan sekadar disebut.
 */
function LoginWindowExpired() {
  useEffect(() => {
    setAuthNotice(EXPIRED_MESSAGE);
    void signOutEverywhere();
  }, []);

  return (
    <Screen>
      <View className="gap-6 px-gutter pt-6">
        <EmptyState icon="time-outline" title="Tempoh Log Masuk Tamat" description={EXPIRED_MESSAGE} />
        <ContactAdminLink label="Hubungi Super Admin" />
        <Text className="text-center text-sm text-ink-muted">Sedang log keluar...</Text>
      </View>
    </Screen>
  );
}

/**
 * Log keluar automatik selepas 20 minit tidak aktif — lihat `lib/idle-timer.ts`.
 *
 * Dipasang DI LUAR gate supaya ia aktif pada skrin sekatan dan tukar kata
 * laluan paksa juga. View pembalut menangkap setiap sentuhan pada fasa capture
 * tanpa merampasnya.
 */
export default function AppLayout() {
  const { session, initialising } = useAuth();
  useIdleTimeout(!initialising && !!session);

  return (
    <View style={{ flex: 1 }} {...activityCaptureProps}>
      <AppGate />
    </View>
  );
}

function AppGate() {
  const { session, user, initialising } = useAuth();
  const insets = useSafeAreaInsets();

  const userId = user?.id ?? null;
  const { status, recheck } = useAccountStatus(userId);

  /*
    Keadaan kata laluan disemak SELEPAS sekatan dan hanya apabila sekatan lulus.
    Akaun yang disekat tidak patut ditawarkan borang tukar kata laluan — ia patut
    dikeluarkan, dan menyemak kedua-duanya serentak bermakna satu permintaan
    tambahan bagi setiap akaun yang akan dilog keluar juga.
  */
  const [password, setPassword] = useState<PasswordStatus>({ state: 'checking' });

  useEffect(() => {
    if (!userId || status !== 'active') return;
    let active = true;

    void (async () => {
      const next = await fetchPasswordStatus();
      if (active) setPassword(next);
    })();

    return () => {
      active = false;
    };
  }, [userId, status]);

  /*
    Butang back Android — lihat `lib/android-back.ts`. Dipanggil SEBELUM return
    awal supaya ia aktif pada skrin gate juga: selagi app belum melepasi semakan
    sekatan dan kata laluan, back disekat sepenuhnya. `'unknown'` bagi kata
    laluan TIDAK disekat kerana gate itu gagal-terbuka dan app sudah dibuka.
  */
  const backBlocked =
    initialising ||
    !session ||
    status !== 'active' ||
    password.state === 'checking' ||
    password.state === 'expired' ||
    password.state === 'must-change';
  useAndroidBackNavigation(backBlocked);

  if (initialising) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  /*
    Semakan sekatan berlaku SEBELUM `<Tabs>` dipasang, jadi skrin yang disekat
    tidak pernah wujud dalam pokok komponen — bukan sekadar tidak boleh dicapai.
    Hanya `'active'` yang melepasi tiga baris di bawah; setiap keadaan lain
    menahan app, termasuk keadaan "tidak diketahui".
  */
  if (status === 'checking') return <LoadingScreen />;
  if (status === 'suspended') return <AccountSuspended />;
  if (status === 'unknown') return <AccountCheckFailed onRetry={recheck} />;

  /*
    Semakan kata laluan sementara, SELEPAS sekatan lulus.

    Ia gagal-TERBUKA di mana sekatan gagal-tertutup: `'unknown'` melepasi
    dan `'checking'` menahan hanya seketika. Memaksa tukar kata laluan ialah
    kemudahan, bukan sempadan keselamatan — kata laluan sementara sudah
    diketahui umum, jadi menahan seseorang di luar app kerana talian tergendala
    merugikan tanpa melindungi apa-apa.
  */
  if (password.state === 'checking') return <LoadingScreen />;
  if (password.state === 'expired') return <LoginWindowExpired />;
  if (password.state === 'must-change') {
    return <ForcePasswordChange onDone={() => setPassword({ state: 'ok' })} />;
  }

  return (
    <Tabs
      /*
        'history' dan bukan lalai 'firstRoute'. Skrin dalam seperti Yuran dan
        Tetapan ialah tab tersembunyi, jadi dengan 'firstRoute' butang back dari
        Yuran (dibuka dari Pembayaran) melompat terus ke Utama. Dengan sejarah,
        back kembali ke skrin yang benar-benar dilawati sebelumnya.
      */
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.background },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.inkFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.line,
          borderTopWidth: 1,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom + 8,
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Utama', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      {/*
        Menggantikan tab Kehadiran yang tidak pernah dibina. Kehadiran sudah
        dijawab di tempat lain — jalur usrah di skrin Utama dan kod QR di tab
        Scan — manakala wang bertaburan sehingga skrin ini mengumpulnya.
      */}
      <Tabs.Screen
        name="pembayaran"
        options={{ title: 'Pembayaran', tabBarIcon: tabIcon('card', 'card-outline') }}
      />
      {/*
        Skrin imbasan ialah sebuah TAB dan bukan skrin dalam. Sebelum ini ia
        dicapai melalui butang di Utama; menjadikannya tab bermakna ia sentiasa
        satu ketukan jauh, dari mana-mana skrin — yang penting apabila seseorang
        sedang berdiri di hadapan kod QR.
      */}
      <Tabs.Screen
        name="usrah-scan"
        /*
          Tiada label di bawah ikon ini, tidak seperti empat tab yang lain.
          Bulatan hijau dengan ikon QR sudah menamakan dirinya sendiri, dan teks
          di bawahnya hanya menolak bulatan itu keluar dari penjajaran.
        */
        options={{ title: 'Scan', tabBarIcon: ScanTabIcon, tabBarLabel: () => null }}
      />
      <Tabs.Screen
        name="ahli"
        options={{ title: 'Ahli', tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }}
      />
      {/*
        Hub Admin dan Tetapan dicapai melalui ikon perisai dan gear di kepala
        setiap skrin (`ScreenHeader`) — kedua-duanya skrin dalam, bukan tab.
        `href: null` mengeluarkannya dari bar tab tanpa mematikan laluannya.
      */}
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="tetapan" options={{ href: null }} />
      <Tabs.Screen name="ahli-view" options={{ href: null }} />
      <Tabs.Screen name="ahli-rumusan" options={{ href: null }} />
      <Tabs.Screen name="organisasi" options={{ href: null }} />
      <Tabs.Screen name="yuran" options={{ href: null }} />
      <Tabs.Screen name="pipis" options={{ href: null }} />
      <Tabs.Screen name="adhoc-payment-info" options={{ href: null }} />
      <Tabs.Screen name="event-info" options={{ href: null }} />
      <Tabs.Screen name="announcement-info" options={{ href: null }} />
    </Tabs>
  );
}
