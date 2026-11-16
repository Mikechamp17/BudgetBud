import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/auth';

export default function PurchaseLayout() {
  const { session } = useSession();
  if (!session) {
    return <Redirect href="/sign-in" />;
  }
  return <Stack screenOptions={{ title: 'Purchase', headerBackTitle: 'Back' }} />;
}
