import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/auth';

/** Sign-in and sign-up. A signed-in user is sent to the dashboard. */
export default function AuthLayout() {
  const { session } = useSession();
  if (session) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
