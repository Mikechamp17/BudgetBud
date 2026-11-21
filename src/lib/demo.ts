// The public demo account. Its data is sample spending that resets every night, so sharing these
// credentials exposes nothing real. Anyone can sign in with them from the sign-in screen.
export const DEMO_EMAIL = 'demo@budgetbud.app';
export const DEMO_PASSWORD = 'try-budgetbud-demo';

export function isDemoEmail(email?: string | null) {
  return email?.toLowerCase() === DEMO_EMAIL;
}
