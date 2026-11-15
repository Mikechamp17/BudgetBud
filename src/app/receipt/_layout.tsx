import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/auth';

export default function ReceiptLayout() {
  const { session } = useSession();
  if (!session) {
    return <Redirect href="/sign-in" />;
  }
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="capture" options={{ title: 'Add receipt' }} />
      <Stack.Screen name="[id]" options={{ title: 'Receipt' }} />
    </Stack>
  );
}
