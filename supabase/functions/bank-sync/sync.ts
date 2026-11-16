// Daily and on-demand bank sync (U12). Runs with the service role, so every query outside ingest
// filters by the link's user_id. Ingest writes every row under the account's owner (KTD3).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { type BankProvider, type BankRecord, SessionExpiredError } from '../_shared/bank/provider.ts';

export const OVERLAP_DAYS = 7;
export const FIRST_SYNC_DAYS = 90;

export type SyncLink = { id: string; user_id: string };
export type SyncAccount = { id: string; provider_account_uid: string | null; last_booked_date: string | null };
export type Counts = { created: number; merged: number; skipped: number };

export interface SyncStore {
  activeLinks(userId?: string): Promise<SyncLink[]>;
  accounts(userId: string, linkId: string): Promise<SyncAccount[]>;
  ingest(userId: string, accountId: string, records: BankRecord[]): Promise<Counts>;
  setLastBookedDate(userId: string, accountId: string, date: string): Promise<void>;
  markSynced(linkId: string): Promise<void>;
  markExpired(linkId: string, message: string): Promise<void>;
  markError(linkId: string, message: string): Promise<void>;
}

export function syncStart(lastBookedDate: string | null, today = new Date()) {
  const base = lastBookedDate ? new Date(`${lastBookedDate}T00:00:00Z`) : today;
  const days = lastBookedDate ? OVERLAP_DAYS : FIRST_SYNC_DAYS;
  return new Date(base.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Syncs every active link, or one user's links. A failing link is recorded and the rest continue. */
export async function syncLinks(
  store: SyncStore,
  provider: BankProvider,
  sortUser: (userId: string) => Promise<unknown>,
  userId?: string,
) {
  const totals: Counts & { links: number; failed: number } = { links: 0, failed: 0, created: 0, merged: 0, skipped: 0 };
  const usersToSort = new Set<string>();
  for (const link of await store.activeLinks(userId)) {
    totals.links++;
    try {
      for (const account of await store.accounts(link.user_id, link.id)) {
        if (!account.provider_account_uid) continue;
        const records = await provider.fetchBookedTransactions(account.provider_account_uid, syncStart(account.last_booked_date));
        if (records.length === 0) continue;
        const counts = await store.ingest(link.user_id, account.id, records);
        totals.created += counts.created;
        totals.merged += counts.merged;
        totals.skipped += counts.skipped;
        const latest = records.map((r) => r.booking_date).sort().at(-1)!;
        if (!account.last_booked_date || latest > account.last_booked_date) {
          await store.setLastBookedDate(link.user_id, account.id, latest);
        }
      }
      await store.markSynced(link.id);
      usersToSort.add(link.user_id);
    } catch (error) {
      totals.failed++;
      if (error instanceof SessionExpiredError) {
        await store.markExpired(link.id, error.message);
      } else {
        console.error('Bank sync failed for link', link.id, error);
        await store.markError(link.id, (error as Error).message);
      }
    }
  }
  for (const user of usersToSort) {
    await sortUser(user).catch((e) => console.error('Sorting failed', e));
  }
  return totals;
}

export function supabaseSyncStore(admin: SupabaseClient): SyncStore {
  const check = <T>({ data, error }: { data: T | null; error: unknown }): T => {
    if (error) throw error;
    return data as T;
  };
  return {
    async activeLinks(userId) {
      let query = admin.from('bank_links').select('id, user_id').in('status', ['active', 'expiring']);
      if (userId) query = query.eq('user_id', userId);
      return check(await query) as SyncLink[];
    },
    async accounts(userId, linkId) {
      return check(
        await admin
          .from('financial_accounts')
          .select('id, provider_account_uid, last_booked_date')
          .eq('user_id', userId)
          .eq('bank_link_id', linkId),
      ) as SyncAccount[];
    },
    async ingest(userId, accountId, records) {
      const created = check<{ id: string }>(
        await admin
          .from('imports')
          .insert({ user_id: userId, financial_account_id: accountId, kind: 'bank_sync' })
          .select('id')
          .single(),
      );
      return check(await admin.rpc('ingest_source_records', { p_import_id: created.id, p_records: records })) as Counts;
    },
    async setLastBookedDate(userId, accountId, date) {
      check(await admin.from('financial_accounts').update({ last_booked_date: date }).eq('id', accountId).eq('user_id', userId));
    },
    async markSynced(linkId) {
      check(await admin.from('bank_links').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', linkId));
    },
    async markExpired(linkId, message) {
      check(await admin.from('bank_links').update({ status: 'expired', last_error: message }).eq('id', linkId));
    },
    async markError(linkId, message) {
      check(await admin.from('bank_links').update({ last_error: message }).eq('id', linkId));
    },
  };
}
