import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { signOutEverywhere } from '@/lib/session';
import { SUSPENDED_MESSAGE, setAuthNotice, useAccountStatus } from '@/lib/suspension';

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

export default function AppLayout() {
  const { session, user, initialising } = useAuth();
  const insets = useSafeAreaInsets();

  const userId = user?.id ?? null;
  const { status, recheck } = useAccountStatus(userId);

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

  return (
    <Tabs
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
      <Tabs.Screen
        name="kehadiran"
        options={{ title: 'Kehadiran', tabBarIcon: tabIcon('checkmark-done', 'checkmark-done-outline') }}
      />
      <Tabs.Screen
        name="aktiviti"
        options={{ title: 'Aktiviti', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
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
        Hub Admin dicapai melalui ikon perisai di Dashboard, dan Tetapan melalui
        ikon gear di Profil — kedua-duanya skrin dalam, bukan tab. `href: null`
        mengeluarkannya dari bar tab tanpa mematikan laluannya.
      */}
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="tetapan" options={{ href: null }} />
      <Tabs.Screen name="ahli-view" options={{ href: null }} />
      <Tabs.Screen name="usrah-scan" options={{ href: null }} />
    </Tabs>
  );
}
