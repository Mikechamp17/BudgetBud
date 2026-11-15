// The bank redirects here after authorization (web, and native when not caught by the in-app browser).
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ErrorText, Screen } from '@/components/ui/kit';
import { useSession } from '@/lib/auth';
import { completeLink, pendingLinkResult } from '@/lib/banks';

export default function BankCallbackScreen() {
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    completeLink({ code: params.code, state: params.state, error: params.error })
      .then((result) => {
        pendingLinkResult.set(result);
        router.replace('/settings/banks');
      })
      .catch((e: Error) => setError(e.message));
  }, [session, params.code, params.state, params.error, router]);

  if (!session) return <Redirect href="/sign-in" />;
  return <Screen>{error ? <ErrorText>{error}</ErrorText> : <ThemedText>Finishing the bank link…</ThemedText>}</Screen>;
}
