import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { session } = useSession();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Settings</ThemedText>
        <ThemedText themeColor="textSecondary">Signed in as {session?.user.email}</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()} style={styles.button}>
          <ThemedText type="linkPrimary">Sign out</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  button: { paddingVertical: Spacing.two },
});
