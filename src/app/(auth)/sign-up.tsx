import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return error.message;
    }
    // With email confirmation on, Supabase hides existing accounts by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      return 'An account with this email already exists. Sign in instead.';
    }
    setSentTo(email);
    return null;
  }

  if (sentTo) {
    return (
      <ThemedView style={styles.sent}>
        <ThemedText type="subtitle">Check your email</ThemedText>
        <ThemedText>We sent a confirmation link to {sentTo}. Open it, then sign in.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <AuthForm
      title="Create account"
      submitLabel="Sign up"
      onSubmit={signUp}
      footerText="Already have an account?"
      footerLinkLabel="Sign in"
      footerHref="/sign-in"
    />
  );
}

const styles = StyleSheet.create({
  sent: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
