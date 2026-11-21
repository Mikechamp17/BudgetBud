import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AuthFormProps = {
  title: string;
  submitLabel: string;
  onSubmit: (email: string, password: string) => Promise<string | null>;
  footerText: string;
  footerLinkLabel: string;
  footerHref: Href;
  /** Shown under the form, such as the demo button on sign-in. */
  extra?: ReactNode;
};

/** Email and password form shared by sign-in and sign-up. onSubmit returns an error message or null. */
export function AuthForm({ title, submitLabel, onSubmit, footerText, footerLinkLabel, footerHref, extra }: AuthFormProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await onSubmit(email.trim(), password);
    setError(message);
    setBusy(false);
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">{title}</ThemedText>
        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
        {error ? (
          <ThemedText accessibilityRole="alert" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={submit}
          style={({ pressed }) => [styles.button, { opacity: pressed || busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>{submitLabel}</ThemedText>}
        </Pressable>
        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">
            {footerText}{' '}
          </ThemedText>
          <Link href={footerHref}>
            <ThemedText type="linkPrimary">{footerLinkLabel}</ThemedText>
          </Link>
        </View>
        {extra}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  input: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  error: { color: '#D93025' },
  button: { backgroundColor: '#208AEF', borderRadius: 10, padding: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 600 },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
});
