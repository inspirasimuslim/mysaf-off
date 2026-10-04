import { Stack, usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Screen } from '@/components/ui/screen';
import { usePermissions } from '@/lib/permissions';

/** Papar bila bukan admin cuba membuka mana-mana skrin di bawah /admin. */
function NoAccess() {
  const router = useRouter();

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Tiada akses" onBackPress={() => router.replace('/(app)/dashboard')} />
      <View className="gap-6 px-gutter">
        <EmptyState
          icon="lock-closed-outline"
          title="Tiada akses"
          description="Panel ini khusus untuk admin sahaja. Hubungi Super Admin jika anda memerlukan capaian."
        />
        <Button label="Kembali ke Utama" variant="secondary" onPress={() => router.replace('/(app)/dashboard')} />
      </View>
    </Screen>
  );
}

/**
 * Pintu masuk panel pentadbiran.
 *
 * Guard di sini sengaja LONGGAR — ia hanya menapis ahli biasa. Setiap skrin di
 * bawahnya mempunyai skop berbeza: skrin Super Admin (department, admin, super
 * admin) menyemak `isSuperAdmin()` sendiri, manakala skrin modul ahli menyemak
 * kebenaran department melalui `useMemberAccess()`. Menguatkuasakan
 * Super Admin di sini akan menutup pintu kepada admin department yang sah.
 *
 * `isActiveNaqib()` turut dibenarkan masuk: naqib boleh jadi bukan admin
 * department mana-mana pun, tetapi masih memerlukan Hub Admin untuk sampai ke
 * "Kumpulan Usrah Saya" (`admin/index.tsx`) dan skrin kumpulannya sendiri.
 *
 * Ini kawalan UI sahaja — RLS di Supabase tetap penentu muktamad.
 */
export default function AdminLayout() {
  const { loading, isAdmin, isActiveNaqib, isOwner } = usePermissions();
  const pathname = usePathname();

  if (loading) return <LoadingScreen />;
  // Owner BUKAN admin: hanya skrin pemulihan satu-satunya skrin di bawah /admin yang dibuka untuknya ialah pemulihan log aktiviti dibuka untuknya.
  if (isOwner() && !isAdmin() && (pathname.endsWith('/owner-recovery') || pathname.endsWith('/activity-log'))) {
    return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
  }
  if (!isAdmin() && !isActiveNaqib()) return <NoAccess />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
