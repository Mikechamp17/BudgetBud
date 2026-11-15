import { decodeBase64Url, encodeBase64 } from 'jsr:@std/encoding@1';
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { API_URL, enableBanking, importPrivateKey, mapTransaction, signToken } from './enable-banking.ts';

async function keyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${encodeBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

Deno.test('the signed token carries the application ID, expires within an hour, and verifies', async () => {
  const { pem, publicKey } = await keyPair();
  const token = await signToken('app-123', await importPrivateKey(pem), 1_800_000_000);
  const [header, payload, signature] = token.split('.');
  const decode = (part: string) => JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
  assertEquals(decode(header), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
  const claims = decode(payload);
  assertEquals([claims.iss, claims.aud, claims.iat], ['enablebanking.com', 'api.enablebanking.com', 1_800_000_000]);
  assert(claims.exp - claims.iat < 3600);
  assert(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      decodeBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
});

// Recorded transaction pages.
const page1 = {
  transactions: [
    {
      entry_reference: 'ref-1',
      transaction_amount: { amount: '42.17', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-03-03',
      creditor: { name: 'LIDL MT 1234 QORMI' },
    },
    {
      entry_reference: 'ref-2',
      transaction_amount: { amount: '9.99', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'PDNG',
      booking_date: null,
      value_date: '2026-03-04',
      creditor: { name: 'NETFLIX' },
    },
  ],
  continuation_key: 'next-page',
};
const page2 = {
  transactions: [
    {
      transaction_amount: { amount: '2500.00', currency: 'EUR' },
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      booking_date: '2026-03-05',
      debtor: { name: 'EMPLOYER LTD' },
      remittance_information: ['Salary March'],
    },
  ],
  continuation_key: null,
};

Deno.test('a two-page transactions response produces booked records from both pages', async () => {
  const { pem } = await keyPair();
  const urls: string[] = [];
  const fetchFn = (url: string | URL | Request) => {
    urls.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(urls.length === 1 ? page1 : page2)));
  };
  const provider = enableBanking('app-123', await importPrivateKey(pem), fetchFn as typeof fetch);
  const records = await provider.fetchBookedTransactions('uid-1', '2026-02-24');

  assertEquals(urls, [
    `${API_URL}/accounts/uid-1/transactions?date_from=2026-02-24`,
    `${API_URL}/accounts/uid-1/transactions?date_from=2026-02-24&continuation_key=next-page`,
  ]);
  assertEquals(
    records.map((r) => [r.provider_transaction_id, r.booking_date, r.amount_minor, r.description]),
    [
      ['ref-1', '2026-03-03', -4217, 'LIDL MT 1234 QORMI'],
      [undefined, '2026-03-05', 250000, 'EMPLOYER LTD'],
    ],
  );
});

Deno.test('a pending transaction is skipped, and the same one once booked is kept', () => {
  const pending = page1.transactions[1] as Parameters<typeof mapTransaction>[0];
  assertEquals(mapTransaction(pending), null);
  assertEquals(mapTransaction({ ...pending, status: 'BOOK', booking_date: '2026-03-05' })?.amount_minor, -999);
});
