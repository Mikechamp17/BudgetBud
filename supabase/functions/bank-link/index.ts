// Bank linking (U11). Signed-in users only. Actions: banks, start, complete, map, remove.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, secretKey } from '../_shared/auth.ts';
import { enableBankingFromEnv } from '../_shared/bank/enable-banking.ts';
import { completeLink, mapAccounts, removeLink, startLink, supabaseLinkStore } from './links.ts';

function respond(result: Record<string, unknown>) {
  const status = typeof result.status === 'number' ? result.status : 200;
  return json(status === 200 ? result : { error: result.error }, status);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json({ error: 'Missing authorization' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Invalid session' }, 401);
  const userId = auth.user.id;

  const provider = await enableBankingFromEnv();
  const store = supabaseLinkStore(admin);
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'banks':
        if (!provider) return json({ error: 'Enable Banking is not configured' }, 503);
        return json({ banks: await provider.listBanks(String(body.country ?? 'MT')) });
      case 'start':
        if (!provider) return json({ error: 'Enable Banking is not configured' }, 503);
        return respond(await startLink(store, provider, userId, { bank: body.bank, redirectUrl: body.redirect_url, linkId: body.link_id }));
      case 'complete':
        if (!provider) return json({ error: 'Enable Banking is not configured' }, 503);
        return respond(await completeLink(store, provider, userId, { state: body.state, code: body.code, error: body.error }));
      case 'map':
        return respond(await mapAccounts(store, userId, body.link_id, body.mappings ?? []));
      case 'remove':
        return respond(await removeLink(store, provider, userId, body.link_id));
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    console.error('bank-link failed', error);
    return json({ error: (error as Error).message }, 502);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
