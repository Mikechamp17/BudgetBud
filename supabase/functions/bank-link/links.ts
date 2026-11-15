// Bank link flow (U11): start, complete from the redirect, map accounts, and remove.
// Every store method is scoped to one user. Session IDs go only to the private table.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { Bank, BankAccount, BankProvider } from '../_shared/bank/provider.ts';

export const LINK_DAYS = 180;
export const WHITELIST_MESSAGE =
  'The bank returned no accounts. In restricted mode, Enable Banking only shares accounts you have ' +
  'linked in its control panel. Link this account there first, then try again.';

export type Link = { id: string; user_id: string; status: string; institution_name: string; institution_country: string };

export interface LinkStore {
  createPendingLink(userId: string, bank: Bank, state: string): Promise<string>;
  /** Puts a new state on an existing link of this user, for a reconnect. Returns false if not theirs. */
  setState(userId: string, linkId: string, state: string): Promise<boolean>;
  /** Finds this user's link with this state and clears the state, so it works only once. */
  consumeState(userId: string, state: string): Promise<Link | null>;
  markFailed(linkId: string, message: string): Promise<void>;
  activate(linkId: string, validUntil: string, accounts: BankAccount[]): Promise<void>;
  putSession(linkId: string, sessionId: string): Promise<void>;
  getSession(linkId: string): Promise<string | null>;
  deleteSession(linkId: string): Promise<void>;
  getLink(userId: string, linkId: string): Promise<(Link & { available_accounts: BankAccount[] }) | null>;
  /** Updates the session uid of accounts already mapped to this link. Returns the accounts not mapped yet. */
  refreshMappedAccounts(userId: string, linkId: string, accounts: BankAccount[]): Promise<BankAccount[]>;
  mapAccount(userId: string, linkId: string, account: BankAccount, financialAccountId: string | null): Promise<void>;
  markRevoked(linkId: string): Promise<void>;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function validUntil(now = new Date()) {
  return new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString();
}

export async function startLink(
  store: LinkStore,
  provider: BankProvider,
  userId: string,
  input: { bank?: Bank; redirectUrl: string; linkId?: string },
) {
  const state = randomState();
  let linkId = input.linkId;
  let bank = input.bank;
  if (linkId) {
    const link = await store.getLink(userId, linkId);
    if (!link || !(await store.setState(userId, linkId, state))) {
      return { error: 'Link not found', status: 404 };
    }
    bank = { name: link.institution_name, country: link.institution_country };
  } else {
    if (!bank) return { error: 'bank is required', status: 400 };
    linkId = await store.createPendingLink(userId, bank, state);
  }
  const { url } = await provider.startAuthorization({ bank: bank!, state, redirectUrl: input.redirectUrl, validUntil: validUntil() });
  return { url, link_id: linkId };
}

export async function completeLink(
  store: LinkStore,
  provider: BankProvider,
  userId: string,
  input: { state?: string; code?: string; error?: string },
) {
  if (!input.state) return { error: 'Missing state', status: 400 };
  const link = await store.consumeState(userId, input.state);
  if (!link) return { error: 'This bank link request is not valid or was already used.', status: 403 };

  if (input.error || !input.code) {
    if (link.status === 'pending') await store.markFailed(link.id, input.error ?? 'Authorization cancelled');
    return { link_id: link.id, status: 'failed', message: 'The bank link was cancelled.' };
  }

  const session = await provider.createSession(input.code);
  if (session.accounts.length === 0) {
    await provider.deleteSession(session.sessionId).catch(() => undefined);
    await store.markFailed(link.id, WHITELIST_MESSAGE);
    return { link_id: link.id, status: 'failed', message: WHITELIST_MESSAGE };
  }
  await store.putSession(link.id, session.sessionId);
  await store.activate(link.id, session.validUntil ?? validUntil(), session.accounts);
  const unmapped = await store.refreshMappedAccounts(userId, link.id, session.accounts);
  return { link_id: link.id, status: 'active', unmapped_accounts: unmapped };
}

export async function mapAccounts(
  store: LinkStore,
  userId: string,
  linkId: string,
  mappings: { provider_account_id: string; financial_account_id: string | null }[],
) {
  const link = await store.getLink(userId, linkId);
  if (!link) return { error: 'Link not found', status: 404 };
  for (const mapping of mappings) {
    const account = link.available_accounts.find((a) => a.providerAccountId === mapping.provider_account_id);
    if (!account) return { error: 'Unknown account', status: 400 };
    await store.mapAccount(userId, linkId, account, mapping.financial_account_id);
  }
  return { mapped: mappings.length };
}

/** Deletes the session at the bank and marks the link revoked. Imported purchases stay. */
export async function removeLink(store: LinkStore, provider: BankProvider | null, userId: string, linkId: string) {
  const link = await store.getLink(userId, linkId);
  if (!link) return { error: 'Link not found', status: 404 };
  const sessionId = await store.getSession(linkId);
  if (sessionId && provider) {
    await provider.deleteSession(sessionId).catch((e) => console.error('Session deletion failed', e));
  }
  await store.deleteSession(linkId);
  await store.markRevoked(linkId);
  return { status: 'revoked' };
}

/** LinkStore on a service-role client. Every query filters by user_id explicitly. */
export function supabaseLinkStore(admin: SupabaseClient): LinkStore {
  const check = <T>({ data, error }: { data: T | null; error: unknown }): T => {
    if (error) throw error;
    return data as T;
  };
  return {
    async createPendingLink(userId, bank, state) {
      const row = check<{ id: string }>(
        await admin
          .from('bank_links')
          .insert({ user_id: userId, institution_name: bank.name, institution_country: bank.country, auth_state: state })
          .select('id')
          .single(),
      );
      return row.id;
    },
    async setState(userId, linkId, state) {
      const rows = check(
        await admin.from('bank_links').update({ auth_state: state }).eq('id', linkId).eq('user_id', userId).select('id'),
      );
      return rows.length === 1;
    },
    async consumeState(userId, state) {
      const rows = check(
        await admin
          .from('bank_links')
          .update({ auth_state: null })
          .eq('auth_state', state)
          .eq('user_id', userId)
          .select('id, user_id, status, institution_name, institution_country'),
      );
      return rows[0] ?? null;
    },
    async markFailed(linkId, message) {
      check(await admin.from('bank_links').update({ status: 'failed', last_error: message }).eq('id', linkId));
    },
    async activate(linkId, until, accounts) {
      check(
        await admin
          .from('bank_links')
          .update({ status: 'active', valid_until: until, last_error: null, available_accounts: accounts })
          .eq('id', linkId),
      );
    },
    async putSession(linkId, sessionId) {
      check(await admin.rpc('put_bank_session', { p_bank_link_id: linkId, p_session_id: sessionId }));
    },
    async getSession(linkId) {
      return check(await admin.rpc('get_bank_session', { p_bank_link_id: linkId })) as string | null;
    },
    async deleteSession(linkId) {
      check(await admin.rpc('delete_bank_session', { p_bank_link_id: linkId }));
    },
    async getLink(userId, linkId) {
      return check(
        await admin
          .from('bank_links')
          .select('id, user_id, status, institution_name, institution_country, available_accounts')
          .eq('id', linkId)
          .eq('user_id', userId)
          .maybeSingle(),
      );
    },
    async refreshMappedAccounts(userId, linkId, accounts) {
      const mapped = check(
        await admin.from('financial_accounts').select('id, provider_account_id').eq('user_id', userId).eq('bank_link_id', linkId),
      ) as { id: string; provider_account_id: string }[];
      const unmapped: BankAccount[] = [];
      for (const account of accounts) {
        const existing = mapped.find((m) => m.provider_account_id === account.providerAccountId);
        if (existing) {
          check(await admin.from('financial_accounts').update({ provider_account_uid: account.uid }).eq('id', existing.id));
        } else {
          unmapped.push(account);
        }
      }
      return unmapped;
    },
    async mapAccount(userId, linkId, account, financialAccountId) {
      const fields = { bank_link_id: linkId, provider_account_id: account.providerAccountId, provider_account_uid: account.uid };
      if (financialAccountId) {
        const rows = check(
          await admin.from('financial_accounts').update(fields).eq('id', financialAccountId).eq('user_id', userId).select('id'),
        );
        if (rows.length !== 1) throw new Error('Account not found');
      } else {
        check(
          await admin
            .from('financial_accounts')
            .insert({ user_id: userId, name: account.name, currency: account.currency, ...fields }),
        );
      }
    },
    async markRevoked(linkId) {
      check(await admin.from('bank_links').update({ status: 'revoked', auth_state: null }).eq('id', linkId));
    },
  };
}
