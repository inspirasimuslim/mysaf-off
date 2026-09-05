import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const { session, initialising } = useAuth();

  if (initialising) return <LoadingScreen />;
  if (session) return <Redirect href="/(app)/dashboard" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAFA' } }} />;
}
