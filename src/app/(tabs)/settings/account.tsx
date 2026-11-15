import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Danger, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/** Deletes the account and everything tied to it. The user types DELETE to confirm. */
export default function AccountScreen() {
  const theme = useTheme();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: callError } = await supabase.functions.invoke('delete-account', { body: {} });
    if (callError) {
      setError('Your account could not be deleted. You are still signed in. Try again.');
      setBusy(false);
      return;
    }
    // The session belongs to a user that no longer exists, so clear it locally. The guard returns to sign-in.
    await supabase.auth.signOut({ scope: 'local' });
  }

  return (
    <Screen title="Delete account">
      <ThemedText>
        This deletes your purchases, categories, rules, receipts, uploaded files, and bank links, and disconnects your
        banks. It cannot be undone.
      </ThemedText>
      <ThemedText type="smallBold">Type DELETE to confirm</ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Delete my account" onPress={remove} busy={busy} disabled={confirm !== 'DELETE'} />
      <ThemedText type="small" style={{ color: Danger }}>
        Bank links stop syncing at once.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 10, padding: Spacing.three, fontSize: 16 },
});
