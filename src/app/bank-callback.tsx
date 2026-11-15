// The bank redirects here after authorization (web, and native when not caught by the in-app browser).
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ErrorText, Screen } from '@/components/ui/kit';
import { useSession } from '@/lib/auth';
import { completeLink, pendingLinkResult } from '@/lib/banks';

export default function BankCallbackScreen() {
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const signedIn = session !== null;

  // The code and state work once, so complete at most once per visit, however often the session object changes.
  useEffect(() => {
    if (!signedIn || started.current) return;
    started.current = true;
    completeLink({ code: params.code, state: params.state, error: params.error })
      .then((result) => {
        pendingLinkResult.set(result);
        router.replace('/settings/banks');
      })
      .catch((e: Error) => setError(e.message));
  }, [signedIn, params.code, params.state, params.error, router]);

  if (!session) return <Redirect href="/sign-in" />;
  return <Screen>{error ? <ErrorText>{error}</ErrorText> : <ThemedText>Finishing the bank link…</ThemedText>}</Screen>;
}
