import { AuthForm } from '@/components/auth-form';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={signIn}
      footerText="No account yet?"
      footerLinkLabel="Create one"
      footerHref="/sign-up"
    />
  );
}
