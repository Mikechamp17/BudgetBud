import { assertEquals } from 'jsr:@std/assert@1';

import type { BankProvider } from '../_shared/bank/provider.ts';
import { type DeleteDeps, deleteAccount, handler } from './index.ts';

function world() {
  const users = new Set(['user-a', 'user-b']);
  const files: Record<string, string[]> = {
    statements: ['user-a/march.pdf', 'user-b/april.pdf'],
    receipts: ['user-a/r1.jpg'],
  };
  const sessions: Record<string, string> = { 'link-a': 'session-a', 'link-b': 'session-b' };
  const linkOwner: Record<string, string> = { 'link-a': 'user-a', 'link-b': 'user-b' };
  const deps: DeleteDeps = {
    bankLinkIds: (userId) => Promise.resolve(Object.keys(linkOwner).filter((l) => linkOwner[l] === userId)),
    bankSession: (linkId) => Promise.resolve(sessions[linkId] ?? null),
    listFiles: (bucket, userId) => Promise.resolve(files[bucket].filter((p) => p.startsWith(`${userId}/`))),
    removeFiles: (bucket, paths) => Promise.resolve(void (files[bucket] = files[bucket].filter((p) => !paths.includes(p)))),
    deleteUser: (userId) => Promise.resolve(void users.delete(userId)),
  };
  return { deps, users, files };
}

function provider(fail = false) {
  const revoked: string[] = [];
  const p = {
    deleteSession: (id: string) => (fail ? Promise.reject(new Error('bank down')) : Promise.resolve(void revoked.push(id))),
  } as unknown as BankProvider;
  return { p, revoked };
}

Deno.test('deleting an account revokes its bank session, removes its files, and deletes the user', async () => {
  const { deps, users, files } = world();
  const { p, revoked } = provider();
  const result = await deleteAccount(deps, p, 'user-a');
  assertEquals(revoked, ['session-a']);
  assertEquals(files.statements, ['user-b/april.pdf']);
  assertEquals(files.receipts, []);
  assertEquals(users.has('user-a'), false);
  assertEquals(result.files, 2);
});

Deno.test('a failed bank revocation still completes the deletion', async () => {
  const { deps, users } = world();
  const result = await deleteAccount(deps, provider(true).p, 'user-a');
  assertEquals(result.revocation_failures, 1);
  assertEquals(users.has('user-a'), false);
});

Deno.test('one user\'s deletion leaves another user untouched', async () => {
  const { deps, users, files } = world();
  const { p, revoked } = provider();
  await deleteAccount(deps, p, 'user-a');
  assertEquals(users.has('user-b'), true);
  assertEquals(files.statements.includes('user-b/april.pdf'), true);
  assertEquals(revoked.includes('session-b'), false);
});

Deno.test('a call without a signed-in user is rejected', async () => {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  for (const headers of [{}, { Authorization: 'Bearer test-secret' }] as Record<string, string>[]) {
    const response = await handler(new Request('http://localhost/delete-account', { method: 'POST', headers }));
    assertEquals(response.status, 401);
    await response.body?.cancel();
  }
});

Deno.test('a file listing outside the user folder stops the deletion before anything is removed', async () => {
  const { deps, users, files } = world();
  let removed = 0;
  const leaky: DeleteDeps = {
    ...deps,
    listFiles: () => Promise.resolve(['user-b/april.pdf']),
    removeFiles: () => Promise.resolve(void removed++),
  };
  let failed = false;
  await deleteAccount(leaky, provider().p, 'user-a').catch(() => (failed = true));
  assertEquals(failed, true);
  assertEquals(removed, 0);
  assertEquals(users.has('user-a'), true);
  assertEquals(files.statements.includes('user-b/april.pdf'), true);
});

Deno.test('files are removed in batches of at most 100', async () => {
  const { deps } = world();
  const paths = Array.from({ length: 250 }, (_, i) => `user-a/f${i}.pdf`);
  const batches: number[] = [];
  const many: DeleteDeps = {
    ...deps,
    listFiles: (bucket) => Promise.resolve(bucket === 'statements' ? paths : []),
    removeFiles: (_bucket, batch) => Promise.resolve(void batches.push(batch.length)),
  };
  await deleteAccount(many, provider().p, 'user-a');
  assertEquals(batches, [100, 100, 50]);
});
