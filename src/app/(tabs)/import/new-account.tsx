import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createAccount } from '@/lib/imports';

export default function NewAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  async function save() {
    const code = currency.trim().toUpperCase();
    if (!name.trim() || !/^[A-Z]{3}$/.test(code)) {
      setError('Enter a name and a three-letter currency code, such as EUR.');
      return;
    }
    setBusy(true);
    try {
      await createAccount(name.trim(), code);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ThemedText type="smallBold">Account name</ThemedText>
      <TextInput style={input} value={name} onChangeText={setName} placeholder="Revolut current" placeholderTextColor={theme.textSecondary} />
      <ThemedText type="smallBold">Currency</ThemedText>
      <TextInput style={input} value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save account" onPress={save} busy={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 10, padding: Spacing.three, fontSize: 16 },
});
