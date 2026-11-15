// Bank links in the app (U11, U12). The app never sees a bank session ID or any provider credential.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type BankLink = {
  id: string;
  institution_name: string;
  institution_country: string;
  status: 'pending' | 'active' | 'expiring' | 'expired' | 'failed' | 'revoked';
  valid_until: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};
export type BankAccountChoice = { providerAccountId: string; uid: string; name: string; currency: string };
export type LinkHealth = { state: 'active' | 'expiring' | 'expired' | 'failed' | 'pending' | 'revoked'; daysLeft: number | null };

const DAY = 86_400_000;
export const WARNING_DAYS = 7;

/** Whether a link needs attention: expiring from 7 days before valid_until, expired after it. */
export function linkHealth(link: Pick<BankLink, 'status' | 'valid_until'>, now = new Date()): LinkHealth {
  if (link.status === 'failed' || link.status === 'pending' || link.status === 'revoked') {
    return { state: link.status, daysLeft: null };
  }
  if (!link.valid_until) return { state: link.status === 'expired' ? 'expired' : 'active', daysLeft: null };
  const daysLeft = Math.ceil((new Date(link.valid_until).getTime() - now.getTime()) / DAY);
  if (link.status === 'expired' || daysLeft <= 0) return { state: 'expired', daysLeft: 0 };
  return { state: daysLeft <= WARNING_DAYS ? 'expiring' : 'active', daysLeft };
}

export function linksNeedingAttention(links: BankLink[], now = new Date()) {
  return links
    .map((link) => ({ link, health: linkHealth(link, now) }))
    .filter(({ health }) => health.state === 'expiring' || health.state === 'expired');
}

export async function listLinks(): Promise<BankLink[]> {
  const { data, error } = await supabase
    .from('bank_links')
    .select('id, institution_name, institution_country, status, valid_until, last_synced_at, last_error')
    .neq('status', 'revoked')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as BankLink[];
}

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

export const listBanks = (country: string) =>
  call<{ banks: { name: string; country: string; logo?: string }[] }>('bank-link', { action: 'banks', country }).then((r) => r.banks);

export type CompleteResult = { link_id: string; status: 'active' | 'failed'; message?: string; unmapped_accounts?: BankAccountChoice[] };

export function completeLink(params: { state?: string; code?: string; error?: string }) {
  return call<CompleteResult>('bank-link', { action: 'complete', ...params });
}

export const bankRedirectUrl = () => Linking.createURL('/bank-callback');

/**
 * Starts a new link or reconnects an existing one. On iOS and Android the bank page opens in an
 * in-app browser session and the result comes back here. On the web the page redirects to /bank-callback.
 */
export async function connectBank(input: { bank?: { name: string; country: string }; linkId?: string }): Promise<CompleteResult | null> {
  const redirectUrl = bankRedirectUrl();
  const { url } = await call<{ url: string; link_id: string }>('bank-link', {
    action: 'start',
    bank: input.bank,
    link_id: input.linkId,
    redirect_url: redirectUrl,
  });
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
  if (result.type !== 'success') return null;
  const { queryParams } = Linking.parse(result.url);
  return completeLink({
    state: queryParams?.state as string | undefined,
    code: queryParams?.code as string | undefined,
    error: queryParams?.error as string | undefined,
  });
}

export function mapBankAccounts(linkId: string, mappings: { provider_account_id: string; financial_account_id: string | null }[]) {
  return call<{ mapped: number }>('bank-link', { action: 'map', link_id: linkId, mappings });
}

export function removeBankLink(linkId: string) {
  return call<{ status: string }>('bank-link', { action: 'remove', link_id: linkId });
}

export function syncNow() {
  return call<{ links: number; created: number; merged: number; skipped: number }>('bank-sync', {});
}

/** Holds a completed link's accounts while the user maps them. */
let pendingResult: CompleteResult | null = null;
export const pendingLinkResult = {
  get: () => pendingResult,
  set: (result: CompleteResult | null) => {
    pendingResult = result;
  },
};
