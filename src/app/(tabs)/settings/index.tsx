import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui/kit';
import { useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useSession();
  const router = useRouter();

  return (
    <Screen title="Settings">
      <ThemedText themeColor="textSecondary">Signed in as {session?.user.email}</ThemedText>
      <Button kind="secondary" label="Banks" onPress={() => router.push('/settings/banks')} />
      <Button kind="secondary" label="Sign out" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
