import '../global.css';

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions';
import { ThemeProvider, useTheme } from '@/lib/theme';

/**
 * Ralat render yang tidak ditangkap. Tanpa ini, binaan release menutup app
 * senyap-senyap ("crash") tanpa sebarang petunjuk; dengan ini punca sebenar
 * dipapar di skrin supaya boleh dilaporkan.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        paddingTop: 64,
        backgroundColor: '#FAFAFA',
      }}>
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
        <ThemeProvider>
          <AuthProvider>
            {/* Kebenaran dibaca sekali di sini supaya semua skrin berkongsi hasil yang sama. */}
            <PermissionsProvider>
              <ToastProvider>
                <RootStack />
              </ToastProvider>
            </PermissionsProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="dasar-privasi" />
        <Stack.Screen name="padam-akaun" />
      </Stack>
    </>
  );
}
