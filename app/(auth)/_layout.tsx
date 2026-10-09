import { Redirect, Stack, useSegments } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';

/**
 * Satu-satunya skrin di sini yang berjalan DENGAN sesi.
 *
 * Pautan pemulihan kata laluan menukar dirinya menjadi sesi sebelum skrin
 * dipapar — itulah cara Supabase membuktikan pemegang pautan memiliki emel
 * tersebut. Tanpa pengecualian ini, pengalihan di bawah akan membawa pengguna
 * terus ke Dashboard dan borang kata laluan baharu tidak pernah kelihatan.
 */
const SESSION_ALLOWED = 'reset-password';

export default function AuthLayout() {
  const { session, initialising } = useAuth();
  const segments = useSegments();
  const colors = useColors();

  if (initialising) return <LoadingScreen />;

  const onRecovery = segments[segments.length - 1] === SESSION_ALLOWED;
  if (session && !onRecovery) return <Redirect href="/(app)/dashboard" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
