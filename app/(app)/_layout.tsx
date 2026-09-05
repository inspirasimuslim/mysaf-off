import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

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

export default function AppLayout() {
  const { session, initialising } = useAuth();
  const insets = useSafeAreaInsets();

  if (initialising) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

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
    </Tabs>
  );
}
