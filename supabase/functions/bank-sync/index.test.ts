import { assertEquals } from 'jsr:@std/assert@1';

import { type BankProvider, type BankRecord, SessionExpiredError } from '../_shared/bank/provider.ts';
import { handler } from './handler.ts';
import { type SyncStore, syncLinks, syncStart } from './sync.ts';

const lidl: BankRecord = { provider_transaction_id: 't1', booking_date: '2026-03-03', amount_minor: -4217, currency: 'EUR', description: 'LIDL', raw: {} };

function fakes(options: { expiredUid?: string } = {}) {
  const links = [
    { id: 'link-a', user_id: 'user-a' },
    { id: 'link-a2', user_id: 'user-a' },
    { id: 'link-b', user_id: 'user-b' },
  ];
  const accounts: Record<string, { id: string; provider_account_uid: string; last_booked_date: string | null }[]> = {
    'link-a': [{ id: 'acct-a', provider_account_uid: 'uid-a', last_booked_date: '2026-03-10' }],
    'link-a2': [{ id: 'acct-a2', provider_account_uid: 'uid-a2', last_booked_date: null }],
    'link-b': [{ id: 'acct-b', provider_account_uid: 'uid-b', last_booked_date: null }],
  };
  const ingested: { userId: string; accountId: string }[] = [];
  const expired: string[] = [];
  const requested: { uid: string; from: string }[] = [];
  const store: SyncStore = {
    activeLinks: (userId) => Promise.resolve(links.filter((l) => !userId || l.user_id === userId)),
    accounts: (userId, linkId) => Promise.resolve(links.find((l) => l.id === linkId)?.user_id === userId ? accounts[linkId] : []),
    ingest: (userId, accountId, records) => {
      ingested.push({ userId, accountId });
      return Promise.resolve({ created: records.length, merged: 0, skipped: 0 });
    },
    setLastBookedDate: () => Promise.resolve(),
    markSynced: () => Promise.resolve(),
    markExpired: (linkId) => Promise.resolve(void expired.push(linkId)),
    markError: () => Promise.resolve(),
  };
  const provider: BankProvider = {
    listBanks: () => Promise.resolve([]),
    startAuthorization: () => Promise.resolve({ url: '' }),
    createSession: () => Promise.reject(new Error('unused')),
    fetchBookedTransactions: (uid, from) => {
      requested.push({ uid, from });
      if (uid === options.expiredUid) return Promise.reject(new SessionExpiredError('Session expired'));
      return Promise.resolve([lidl]);
    },
    deleteSession: () => Promise.resolve(),
  };
  const sorted: string[] = [];
  const sortUser = (id: string) => Promise.resolve(void sorted.push(id));
  return { store, provider, sortUser, ingested, expired, requested, sorted };
}

Deno.test('syncs from the last booked date minus 7 days, or 90 days back the first time', () => {
  assertEquals(syncStart('2026-03-10'), '2026-03-03');
  assertEquals(syncStart(null, new Date('2026-06-01T00:00:00Z')), '2026-03-03');
});

Deno.test('a user\'s Sync now syncs only that user\'s links and writes only under that user', async () => {
  const f = fakes();
  await syncLinks(f.store, f.provider, f.sortUser, 'user-a');
  assertEquals(f.requested.map((r) => r.uid), ['uid-a', 'uid-a2']);
  assertEquals(new Set(f.ingested.map((i) => i.userId)), new Set(['user-a']));
});

Deno.test('a scheduled run syncs every user and sorts each one\'s merchants with no app call', async () => {
  const f = fakes();
  const totals = await syncLinks(f.store, f.provider, f.sortUser);
  assertEquals(totals.links, 3);
  assertEquals(f.sorted, ['user-a', 'user-b']);
});

Deno.test('an expired session marks that link expired and continues with the next', async () => {
  const f = fakes({ expiredUid: 'uid-a' });
  const totals = await syncLinks(f.store, f.provider, f.sortUser);
  assertEquals(f.expired, ['link-a']);
  assertEquals(totals.failed, 1);
  assertEquals(f.ingested.map((i) => i.accountId), ['acct-a2', 'acct-b']);
});

Deno.test('a call with neither a user session nor the secret key is rejected', async () => {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  const response = await handler(new Request('http://localhost/bank-sync', { method: 'POST' }));
  assertEquals(response.status, 401);
  await response.body?.cancel();
});
