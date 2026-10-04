import '../global.css';

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions';

/**
 * Ralat render yang tidak ditangkap. Tanpa ini, binaan release menutup app
 * senyap-senyap ("crash") tanpa sebarang petunjuk; dengan ini punca sebenar
 * dipapar di skrin supaya boleh dilaporkan.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#FAFAFA' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A1A' }}>Ralat tidak dijangka</Text>
      <ScrollView style={{ marginVertical: 16 }}>
        <Text selectable style={{ fontSize: 13, color: '#B42318' }}>
          {String(error?.message ?? error)}
          {'\n\n'}
          {String(error?.stack ?? '')
            .split('\n')
            .slice(0, 12)
            .join('\n')}
        </Text>
      </ScrollView>
      <Text onPress={retry} style={{ fontSize: 16, fontWeight: '600', color: '#0F5132' }}>
        Cuba lagi
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Kebenaran dibaca sekali di sini supaya semua skrin berkongsi hasil yang sama. */}
          <PermissionsProvider>
            <ToastProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAFA' } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
            </ToastProvider>
          </PermissionsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
