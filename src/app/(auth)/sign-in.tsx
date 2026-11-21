import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  async function tryDemo() {
    setDemoBusy(true);
    setDemoError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (error) {
      setDemoError('The demo is not available right now. Try again later.');
      setDemoBusy(false);
    }
  }

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={signIn}
      footerText="No account yet?"
      footerLinkLabel="Create one"
      footerHref="/sign-up"
      extra={
        <View style={styles.demo}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Just looking? Explore three months of sample spending. It resets every night.
          </ThemedText>
          <Button kind="secondary" label="Try the demo" onPress={tryDemo} busy={demoBusy} />
          {demoError ? <ErrorText>{demoError}</ErrorText> : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  demo: { gap: Spacing.two, marginTop: Spacing.four },
  center: { textAlign: 'center' },
});
