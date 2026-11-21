// Sorts the caller's Uncategorized merchants with Groq (U5).
// Accepts a signed-in user (scoped to that user) or the secret key with a user_id.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, resolveUserId, secretKey } from '../_shared/auth.ts';
import { categorizeUser, supabaseSortStore } from '../_shared/categorize.ts';
import { DEFAULT_GROQ_MODEL, groqSorter } from '../_shared/groq.ts';

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  const userId = await resolveUserId(req, admin, body);
  if (userId instanceof Response) {
    return userId;
  }
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) {
    return json({ error: 'GROQ_API_KEY is not set' }, 503);
  }
  const sorter = groqSorter(groqKey, Deno.env.get('GROQ_MODEL') ?? DEFAULT_GROQ_MODEL);
  const result = await categorizeUser(supabaseSortStore(admin), sorter, userId);
  return json(result);
}
