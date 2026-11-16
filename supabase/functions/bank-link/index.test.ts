import { assertEquals } from 'jsr:@std/assert@1';

import type { BankAccount, BankProvider } from '../_shared/bank/provider.ts';
import { handler } from './handler.ts';
import { completeLink, type Link, type LinkStore, removeLink, startLink, WHITELIST_MESSAGE } from './links.ts';

const revolut: BankAccount = { providerAccountId: 'hash-rev', uid: 'uid-rev', name: 'Revolut EUR', currency: 'EUR' };

function fakeStore() {
  const links = new Map<string, Link & { state: string | null; available_accounts: BankAccount[] }>();
  const sessions = new Map<string, string>();
  const mapped = new Map<string, BankAccount>();
  const errors: { linkId: string; message: string }[] = [];
  let next = 1;
  const store: LinkStore = {
    createPendingLink(userId, bank, state) {
      const id = `link-${next++}`;
      links.set(id, { id, user_id: userId, status: 'pending', institution_name: bank.name, institution_country: bank.country, state, available_accounts: [] });
      return Promise.resolve(id);
    },
    setState(userId, linkId, state) {
      const link = links.get(linkId);
      if (!link || link.user_id !== userId) return Promise.resolve(false);
      link.state = state;
      return Promise.resolve(true);
    },
    consumeState(userId, state) {
      const link = [...links.values()].find((l) => l.state === state && l.user_id === userId) ?? null;
      if (link) link.state = null;
      return Promise.resolve(link);
    },
    markError(linkId, message) {
      errors.push({ linkId, message });
      return Promise.resolve();
    },
    markFailed(linkId, message) {
      links.get(linkId)!.status = 'failed';
      links.get(linkId)!.institution_name += ` (${message.slice(0, 10)})`;
      return Promise.resolve();
    },
    activate(linkId, _until, accounts) {
      Object.assign(links.get(linkId)!, { status: 'active', available_accounts: accounts });
      return Promise.resolve();
    },
    putSession: (linkId, sessionId) => Promise.resolve(void sessions.set(linkId, sessionId)),
    getSession: (linkId) => Promise.resolve(sessions.get(linkId) ?? null),
    deleteSession: (linkId) => Promise.resolve(void sessions.delete(linkId)),
    getLink: (userId, linkId) => {
      const link = links.get(linkId);
      return Promise.resolve(link && link.user_id === userId ? link : null);
    },
    refreshMappedAccounts: (_userId, _linkId, accounts) => Promise.resolve(accounts.filter((a) => !mapped.has(a.providerAccountId))),
    mapAccount: (_userId, _linkId, account) => Promise.resolve(void mapped.set(account.providerAccountId, account)),
    markRevoked: (linkId) => Promise.resolve(void (links.get(linkId)!.status = 'revoked')),
  };
  return { store, links, sessions, mapped, errors };
}

function fakeProvider(accounts: BankAccount[] = [revolut]) {
  const deleted: string[] = [];
  const authStates: string[] = [];
  const provider: BankProvider = {
    listBanks: () => Promise.resolve([]),
    startAuthorization: ({ state }) => {
      authStates.push(state);
      return Promise.resolve({ url: `https://bank.example/auth?state=${state}` });
    },
    createSession: () => Promise.resolve({ sessionId: 'session-secret', validUntil: '2027-05-01T00:00:00Z', accounts }),
    fetchBookedTransactions: () => Promise.resolve([]),
    deleteSession: (id) => Promise.resolve(void deleted.push(id)),
  };
  return { provider, deleted, authStates };
}

const bank = { name: 'Revolut', country: 'MT' };

async function begin(userId = 'user-a', accounts?: BankAccount[]) {
  const s = fakeStore();
  const p = fakeProvider(accounts);
  const started = await startLink(s.store, p.provider, userId, { bank, redirectUrl: 'budgetbud://bank-callback' });
  return { ...s, ...p, started, state: p.authStates[0] };
}

Deno.test('a completed redirect stores the session in the private table and never returns it', async () => {
  const { store, provider, sessions, state, started } = await begin();
  const result = await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  assertEquals(sessions.get(started.link_id!), 'session-secret');
  assertEquals(result.status, 'active');
  assertEquals(JSON.stringify(result).includes('session-secret'), false);
  assertEquals((result as { unmapped_accounts: BankAccount[] }).unmapped_accounts, [revolut]);
});

Deno.test('a cancelled authorization marks the link failed and creates no session', async () => {
  const { store, provider, sessions, links, state, started } = await begin();
  const result = await completeLink(store, provider, 'user-a', { state, error: 'access_denied' });
  assertEquals(result.status, 'failed');
  assertEquals(links.get(started.link_id!)!.status, 'failed');
  assertEquals(sessions.size, 0);
});

Deno.test('a link that returns no accounts shows the whitelisting message', async () => {
  const { store, provider, sessions, state } = await begin('user-a', []);
  const result = await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  assertEquals((result as { message: string }).message, WHITELIST_MESSAGE);
  assertEquals(sessions.size, 0);
});

Deno.test('a missing state, or another user\'s state, creates no session', async () => {
  const { store, provider, sessions, state } = await begin('user-a');
  assertEquals((await completeLink(store, provider, 'user-a', { code: 'code-1' })).status, 400);
  assertEquals((await completeLink(store, provider, 'user-b', { state, code: 'code-1' })).status, 403);
  assertEquals(sessions.size, 0);
});

Deno.test('a state works only once', async () => {
  const { store, provider, state } = await begin();
  await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  assertEquals((await completeLink(store, provider, 'user-a', { state, code: 'code-1' })).status, 403);
});

Deno.test('reconnecting keeps already-mapped accounts and returns none to map', async () => {
  const { store, provider, mapped, state, started, authStates } = await begin();
  await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  mapped.set(revolut.providerAccountId, revolut);
  await startLink(store, provider, 'user-a', { redirectUrl: 'budgetbud://bank-callback', linkId: started.link_id });
  const again = await completeLink(store, provider, 'user-a', { state: authStates[1], code: 'code-2' });
  assertEquals((again as { unmapped_accounts: BankAccount[] }).unmapped_accounts, []);
});

Deno.test('removing a link deletes the session at the bank', async () => {
  const { store, provider, deleted, links, state, started } = await begin();
  await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  await removeLink(store, provider, 'user-a', started.link_id!);
  assertEquals(deleted, ['session-secret']);
  assertEquals(links.get(started.link_id!)!.status, 'revoked');
});

Deno.test('another user cannot remove or reconnect a link', async () => {
  const { store, provider, started } = await begin();
  assertEquals((await removeLink(store, provider, 'user-b', started.link_id!)).status, 404);
  assertEquals((await startLink(store, provider, 'user-b', { redirectUrl: 'x', linkId: started.link_id })).status, 404);
});

Deno.test('a call without a signed-in user is rejected', async () => {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  const response = await handler(new Request('http://localhost/bank-link', { method: 'POST', body: '{}' }));
  assertEquals(response.status, 401);
  await response.body?.cancel();
});

Deno.test('a reconnect that returns no accounts keeps a working link active and its session', async () => {
  const { store, provider, links, sessions, state, started, authStates, errors } = await begin();
  await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  await startLink(store, provider, 'user-a', { redirectUrl: 'x', linkId: started.link_id });
  const empty = { ...provider, createSession: () => Promise.resolve({ sessionId: 'session-2', validUntil: '2027-06-01T00:00:00Z', accounts: [] }) };
  const result = await completeLink(store, empty, 'user-a', { state: authStates[1], code: 'code-2' });
  assertEquals(result.status, 'failed');
  assertEquals(links.get(started.link_id!)!.status, 'active');
  assertEquals(sessions.get(started.link_id!), 'session-secret');
  assertEquals(errors.map((e) => e.message), [WHITELIST_MESSAGE]);
});

Deno.test('a failure after the bank session is created deletes that session instead of orphaning it', async () => {
  const { store, provider, deleted, links, state, started } = await begin();
  const broken = { ...store, putSession: () => Promise.reject(new Error('database unavailable')) };
  const result = await completeLink(broken, provider, 'user-a', { state, code: 'code-1' });
  assertEquals(result.status, 'failed');
  assertEquals(deleted, ['session-secret']);
  assertEquals(links.get(started.link_id!)!.status, 'failed');
});

Deno.test('a successful reconnect revokes the session it replaces', async () => {
  const { store, provider, deleted, state, started, authStates } = await begin();
  await completeLink(store, provider, 'user-a', { state, code: 'code-1' });
  await startLink(store, provider, 'user-a', { redirectUrl: 'x', linkId: started.link_id });
  const next = { ...provider, createSession: () => Promise.resolve({ sessionId: 'session-2', validUntil: '2027-06-01T00:00:00Z', accounts: [revolut] }) };
  await completeLink(store, next, 'user-a', { state: authStates[1], code: 'code-2' });
  assertEquals(deleted, ['session-secret']);
});
