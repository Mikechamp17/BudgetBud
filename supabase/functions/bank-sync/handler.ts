// Bank sync (U12). The secret key syncs every active link. A signed-in user syncs only their own.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, resolveUserId, secretKey } from '../_shared/auth.ts';
import { enableBankingFromEnv } from '../_shared/bank/enable-banking.ts';
import { categorizeUser, supabaseSortStore } from '../_shared/categorize.ts';
import { DEFAULT_GROQ_MODEL, groqSorter } from '../_shared/groq.ts';
import { supabaseSyncStore, syncLinks } from './sync.ts';

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const isServer = token !== '' && token === secretKey();
  let userId: string | undefined;
  if (!isServer) {
    const resolved = await resolveUserId(req, admin, {});
    if (resolved instanceof Response) return resolved;
    userId = resolved;
  }

  const provider = await enableBankingFromEnv();
  if (!provider) return json({ error: 'Enable Banking is not configured' }, 503);

  const groqKey = Deno.env.get('GROQ_API_KEY');
  const sortStore = supabaseSortStore(admin);
  const sortUser = groqKey
    ? (id: string) => categorizeUser(sortStore, groqSorter(groqKey, Deno.env.get('GROQ_MODEL') ?? DEFAULT_GROQ_MODEL), id)
    : () => Promise.resolve();

  return json(await syncLinks(supabaseSyncStore(admin), provider, sortUser, userId));
}
