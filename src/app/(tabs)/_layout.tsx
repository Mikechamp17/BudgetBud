import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useSession } from '@/lib/auth';

/** The signed-in app. A signed-out user is sent to sign-in. */
export default function TabsLayout() {
  const { session } = useSession();
  if (!session) {
    return <Redirect href="/sign-in" />;
  }
  return <AppTabs />;
}
