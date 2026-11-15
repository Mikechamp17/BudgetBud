import { assertEquals } from 'jsr:@std/assert@1';

import { handler, HISTORY_START, HISTORY_URL, loadRates, parseEcbXml, type Rate, RECENT_URL, type RateStore } from './index.ts';

// A recorded excerpt of the ECB reference-rate file.
const recordedXml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2026-04-03">
      <Cube currency="USD" rate="1.0821"/>
      <Cube currency="GBP" rate="0.85"/>
    </Cube>
    <Cube time="2025-04-01">
      <Cube currency="GBP" rate="0.9"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

function memoryStore(): RateStore & { rows: Map<string, Rate> } {
  const rows = new Map<string, Rate>();
  return {
    rows,
    earliestDate: () => Promise.resolve([...rows.values()].map((r) => r.rate_date).sort()[0] ?? null),
    insertNew: (rates) => {
      for (const r of rates) {
        const key = `${r.currency}:${r.rate_date}`;
        if (!rows.has(key)) rows.set(key, r);
      }
      return Promise.resolve();
    },
  };
}

Deno.test('parses ECB rates by day and currency', () => {
  assertEquals(parseEcbXml(recordedXml), [
    { currency: 'USD', rate_date: '2026-04-03', rate: 1.0821 },
    { currency: 'GBP', rate_date: '2026-04-03', rate: 0.85 },
    { currency: 'GBP', rate_date: '2025-04-01', rate: 0.9 },
  ]);
});

Deno.test('runs load the full history until it is complete, then the last 90 days', async () => {
  const store = memoryStore();
  const urls: string[] = [];
  const fetchFn = (url: string | URL | Request) => {
    urls.push(String(url));
    return Promise.resolve(new Response(recordedXml));
  };
  await loadRates(store, fetchFn as typeof fetch);
  assertEquals(store.rows.get('GBP:2025-04-01')?.rate, 0.9, 'a year-old rate is loaded');
  // The recorded file stops in 2025, like a first run that died part way, so the next run retries the history.
  await loadRates(store, fetchFn as typeof fetch);
  await store.insertNew([{ currency: 'USD', rate_date: HISTORY_START, rate: 1.1789 }]);
  await loadRates(store, fetchFn as typeof fetch);
  assertEquals(urls, [HISTORY_URL, HISTORY_URL, RECENT_URL]);
});

Deno.test('rerunning for dates already stored changes nothing', async () => {
  const store = memoryStore();
  await store.insertNew([{ currency: 'GBP', rate_date: '2026-04-03', rate: 0.86 }]);
  await loadRates(store, (() => Promise.resolve(new Response(recordedXml))) as typeof fetch);
  assertEquals(store.rows.get('GBP:2026-04-03')?.rate, 0.86);
});

Deno.test('rejects calls without the secret key', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  const response = await handler(new Request('http://localhost/fx-rates', { method: 'POST' }));
  assertEquals(response.status, 401);
  await response.body?.cancel();
});
