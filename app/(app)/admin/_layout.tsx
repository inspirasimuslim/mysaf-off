import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { usePermissions } from '@/lib/permissions';

/** Papar bila bukan Super Admin cuba membuka mana-mana skrin di bawah /admin. */
function NoAccess() {
  const router = useRouter();

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Tiada akses" onBackPress={() => router.replace('/(app)/dashboard')} />
      <View className="gap-6 px-gutter">
        <EmptyState
          icon="lock-closed-outline"
          title="Tiada akses"
          description="Panel ini khusus untuk Super Admin sahaja. Hubungi Super Admin sedia ada jika anda memerlukan capaian."
        />
        <Button label="Kembali ke Utama" variant="secondary" onPress={() => router.replace('/(app)/dashboard')} />
      </View>
    </Screen>
  );
}

/**
 * Pintu masuk tunggal panel Super Admin.
 *
 * Semakan dibuat di sini supaya setiap skrin di bawahnya tidak perlu mengulangi
 * guard yang sama. Ini kawalan UI sahaja — RLS di Supabase tetap menolak
 * sebarang tulisan daripada akaun bukan Super Admin.
 */
export default function AdminLayout() {
  const { loading, isSuperAdmin } = usePermissions();

  if (loading) return <LoadingScreen />;
  if (!isSuperAdmin()) return <NoAccess />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
