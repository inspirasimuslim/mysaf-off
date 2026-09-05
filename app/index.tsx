import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { session, initialising } = useAuth();

  if (initialising) return <LoadingScreen />;

  return <Redirect href={session ? '/(app)/dashboard' : '/(auth)/login'} />;
}
