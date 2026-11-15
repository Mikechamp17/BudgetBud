// Deletes the caller's account and everything tied to it (U13, KTD18).
// Bank sessions are revoked first, then the user's files go, then the auth user, whose
// deletion cascades to every row. A failed revocation is logged and does not stop deletion.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { json, resolveUserId, secretKey } from '../_shared/auth.ts';
import { enableBankingFromEnv } from '../_shared/bank/enable-banking.ts';
import type { BankProvider } from '../_shared/bank/provider.ts';

export const BUCKETS = ['statements', 'receipts'] as const;

export interface DeleteDeps {
  bankLinkIds(userId: string): Promise<string[]>;
  bankSession(linkId: string): Promise<string | null>;
  /** File paths in the user's own folder of a bucket. */
  listFiles(bucket: string, userId: string): Promise<string[]>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export async function deleteAccount(deps: DeleteDeps, provider: BankProvider | null, userId: string) {
  let revocationFailures = 0;
  for (const linkId of await deps.bankLinkIds(userId)) {
    const sessionId = await deps.bankSession(linkId);
    if (!sessionId || !provider) continue;
    try {
      await provider.deleteSession(sessionId);
    } catch (error) {
      revocationFailures++;
      console.error('Bank session revocation failed; it will expire on its own', error);
    }
  }
  let files = 0;
  for (const bucket of BUCKETS) {
    const paths = await deps.listFiles(bucket, userId);
    if (paths.some((p) => !p.startsWith(`${userId}/`))) throw new Error('Refusing to delete files outside the user folder');
    for (let i = 0; i < paths.length; i += 100) {
      await deps.removeFiles(bucket, paths.slice(i, i + 100));
    }
    files += paths.length;
  }
  await deps.deleteUser(userId);
  return { deleted: true, files, revocation_failures: revocationFailures };
}

export function supabaseDeleteDeps(admin: SupabaseClient): DeleteDeps {
  return {
    async bankLinkIds(userId) {
      const { data, error } = await admin.from('bank_links').select('id').eq('user_id', userId);
      if (error) throw error;
      return (data ?? []).map((row) => row.id as string);
    },
    async bankSession(linkId) {
      const { data, error } = await admin.rpc('get_bank_session', { p_bank_link_id: linkId });
      if (error) throw error;
      return data as string | null;
    },
    async listFiles(bucket, userId) {
      const paths: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000, offset });
        if (error) throw error;
        paths.push(...(data ?? []).map((file) => `${userId}/${file.name}`));
        if (!data || data.length < 1000) break;
      }
      return paths;
    },
    async removeFiles(bucket, paths) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw error;
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  // Only a signed-in user may delete, and only their own account. The secret key is not accepted here.
  if (!token || token === secretKey()) return json({ error: 'Sign in to delete your account' }, 401);
  const userId = await resolveUserId(req, admin, {});
  if (userId instanceof Response) return userId;
  try {
    return json(await deleteAccount(supabaseDeleteDeps(admin), await enableBankingFromEnv(), userId));
  } catch (error) {
    console.error('Account deletion failed', error);
    return json({ error: 'Account deletion failed. Try again.' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
