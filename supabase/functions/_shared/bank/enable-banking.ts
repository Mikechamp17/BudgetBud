// Enable Banking client (KTD9). Every request carries a short-lived RS256 token signed with the
// application's private key, which lives only in Edge Function secrets.
//
// Field names follow Enable Banking's API as documented at enablebanking.com/docs/api/reference.
// They could not be checked against the live docs while this was written, so the U11 smoke test
// (sign a token and list banks for Malta) must pass before relying on this module.
import { decodeBase64, encodeBase64Url } from 'jsr:@std/encoding@1';

import { decimalToMinor } from '../money.ts';
import { type Bank, type BankAccount, type BankProvider, type BankRecord, type BankSession, SessionExpiredError } from './provider.ts';

export const API_URL = 'https://api.enablebanking.com';
export const TOKEN_LIFETIME_SECONDS = 3600 - 60; // Under one hour.

const encoder = new TextEncoder();

export async function importPrivateKey(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(body),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Builds the RS256 token Enable Banking expects: kid is the application ID. */
export async function signToken(applicationId: string, key: CryptoKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId };
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };
  const unsigned = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  return `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`;
}

type EbAccount = {
  uid: string;
  identification_hash?: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  name?: string;
  product?: string;
  currency?: string;
};

type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: 'CRDT' | 'DBIT';
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
};

function mapAccount(account: EbAccount): BankAccount {
  return {
    providerAccountId: account.identification_hash ?? account.account_id?.iban ?? account.uid,
    uid: account.uid,
    name: account.name ?? account.product ?? account.account_id?.iban ?? 'Bank account',
    currency: (account.currency ?? 'EUR').toUpperCase(),
  };
}

/** Maps one booked transaction. Debits become negative amounts (KTD4). */
export function mapTransaction(tx: EbTransaction): BankRecord | null {
  if (tx.status && tx.status !== 'BOOK') return null;
  const date = tx.booking_date ?? tx.value_date ?? tx.transaction_date;
  const currency = tx.transaction_amount.currency.toUpperCase();
  const magnitude = decimalToMinor(tx.transaction_amount.amount.replace(/^-/, ''), currency);
  if (!date || magnitude === null) return null;
  const counterparty = tx.credit_debit_indicator === 'DBIT' ? tx.creditor?.name : tx.debtor?.name;
  const description = counterparty || tx.remittance_information?.join(' ') || 'Bank transaction';
  const id = tx.transaction_id || tx.entry_reference || undefined;
  return {
    ...(id ? { provider_transaction_id: id } : {}),
    booking_date: date,
    amount_minor: tx.credit_debit_indicator === 'DBIT' ? -magnitude : magnitude,
    currency,
    description,
    raw: tx as unknown as Record<string, unknown>,
  };
}

export function enableBanking(applicationId: string, key: CryptoKey, fetchFn: typeof fetch = fetch): BankProvider {
  async function call(method: string, path: string, body?: unknown) {
    const response = await fetchFn(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await signToken(applicationId, key)}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = data.message ?? data.error ?? `Enable Banking returned ${response.status}`;
      // Only a session the bank has closed counts as expired. A bad signature must not mark links expired.
      if (/expired|revoked|closed/i.test(`${message} ${data.code ?? ''} ${data.error ?? ''}`)) {
        throw new SessionExpiredError(String(message));
      }
      throw new Error(String(message));
    }
    return data;
  }

  return {
    async listBanks(country) {
      const data = await call('GET', `/aspsps?country=${encodeURIComponent(country)}`);
      return (data.aspsps ?? []).map((b: { name: string; country: string; logo?: string }) => ({
        name: b.name,
        country: b.country,
        logo: b.logo,
      })) as Bank[];
    },
    async startAuthorization({ bank, state, redirectUrl, validUntil }) {
      const data = await call('POST', '/auth', {
        access: { valid_until: validUntil },
        aspsp: { name: bank.name, country: bank.country },
        state,
        redirect_url: redirectUrl,
        psu_type: 'personal',
      });
      return { url: data.url };
    },
    async createSession(code): Promise<BankSession> {
      const data = await call('POST', '/sessions', { code });
      return {
        sessionId: data.session_id,
        validUntil: data.access?.valid_until,
        accounts: (data.accounts ?? []).map(mapAccount),
      };
    },
    async fetchBookedTransactions(accountUid, dateFrom) {
      const records: BankRecord[] = [];
      let continuation: string | undefined;
      do {
        const query = new URLSearchParams({ date_from: dateFrom });
        if (continuation) query.set('continuation_key', continuation);
        const data = await call('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`);
        for (const tx of data.transactions ?? []) {
          const record = mapTransaction(tx);
          if (record) records.push(record);
        }
        continuation = data.continuation_key || undefined;
      } while (continuation);
      return records;
    },
    async deleteSession(sessionId) {
      await call('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
    },
  };
}

/** Builds the client from Edge Function secrets, or returns null when they are not set. */
export async function enableBankingFromEnv(): Promise<BankProvider | null> {
  const applicationId = Deno.env.get('ENABLE_BANKING_APPLICATION_ID');
  const pem = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY');
  if (!applicationId || !pem) return null;
  return enableBanking(applicationId, await importPrivateKey(pem));
}
