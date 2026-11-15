import { assertEquals, assertFalse } from 'jsr:@std/assert@1';

import { type Category, categorizeUser, type Merchant, type SortStore } from '../_shared/categorize.ts';
import { groqSorter, type SortMerchants } from '../_shared/groq.ts';
import { handler } from './index.ts';

const categories: Category[] = [
  { id: 'c-groceries', name: 'Groceries' },
  { id: 'c-dining', name: 'Dining' },
  { id: 'c-uncat', name: 'Uncategorized' },
];

/** In-memory store: a merchant leaves the uncategorized list once it has a rule. */
function fakeStore(merchants: Merchant[]) {
  const rules: { userId: string; merchant: string; categoryId: string }[] = [];
  const usage: number[] = [];
  const store: SortStore = {
    uncategorizedMerchants: () =>
      Promise.resolve(merchants.filter((m) => !rules.some((r) => r.merchant === m.name))),
    categories: () => Promise.resolve(categories),
    saveAiRule: (userId, merchant, categoryId) => {
      rules.push({ userId, merchant: merchant.name, categoryId });
      return Promise.resolve();
    },
    logUsage: (_userId, _model, input) => {
      usage.push(input);
      return Promise.resolve();
    },
  };
  return { store, rules, usage };
}

// A recorded Groq chat completion response.
const recordedGroqResponse = {
  id: 'chatcmpl-recorded',
  model: 'openai/gpt-oss-20b',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          results: [
            { merchant: 'joes market', category: 'Groceries' },
            { merchant: 'cafe cordina', category: 'Dining' },
          ],
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 210, completion_tokens: 40, total_tokens: 250 },
};

Deno.test('a recorded Groq response sorts sample merchants end to end', async () => {
  const requests: Request[] = [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Promise.resolve(new Response(JSON.stringify(recordedGroqResponse)));
  };
  const { store, rules, usage } = fakeStore([
    { id: 'm1', name: 'joes market' },
    { id: 'm2', name: 'cafe cordina' },
  ]);
  const result = await categorizeUser(store, groqSorter('test-key', undefined, fetchFn as typeof fetch), 'user-a');

  assertEquals(result, { sorted: 2, failedBatches: 0 });
  assertEquals(rules, [
    { userId: 'user-a', merchant: 'joes market', categoryId: 'c-groceries' },
    { userId: 'user-a', merchant: 'cafe cordina', categoryId: 'c-dining' },
  ]);
  assertEquals(usage, [210]);

  const body = await requests[0].json();
  const sent = JSON.parse(body.messages[1].content);
  assertEquals(sent, { merchants: ['joes market', 'cafe cordina'] }, 'only merchant names are sent');
  assertEquals(
    body.response_format.json_schema.schema.properties.results.items.properties.category.enum,
    ['Groceries', 'Dining', 'Uncategorized'],
  );
});

Deno.test('a category outside the list leaves the merchant Uncategorized', async () => {
  const { store, rules } = fakeStore([{ id: 'm1', name: 'joes market' }]);
  const sort: SortMerchants = () =>
    Promise.resolve({ results: [{ merchant: 'joes market', category: 'Pets' }], model: 'm', inputTokens: 1, outputTokens: 1 });
  await categorizeUser(store, sort, 'user-a');
  assertEquals(rules, []);
});

Deno.test('a Groq error writes nothing, and a later run sorts the merchant', async () => {
  const { store, rules, usage } = fakeStore([{ id: 'm1', name: 'joes market' }]);
  const failing: SortMerchants = () => Promise.reject(new Error('Groq request failed with status 503'));
  assertEquals(await categorizeUser(store, failing, 'user-a'), { sorted: 0, failedBatches: 1 });
  assertEquals(rules, []);
  assertEquals(usage, []);

  const working: SortMerchants = () =>
    Promise.resolve({ results: [{ merchant: 'joes market', category: 'Groceries' }], model: 'm', inputTokens: 1, outputTokens: 1 });
  assertEquals(await categorizeUser(store, working, 'user-a'), { sorted: 1, failedBatches: 0 });
});

Deno.test('a merchant sorted once is never sent to Groq again', async () => {
  const { store } = fakeStore([{ id: 'm1', name: 'joes market' }]);
  let calls = 0;
  const sort: SortMerchants = () => {
    calls++;
    return Promise.resolve({ results: [{ merchant: 'joes market', category: 'Groceries' }], model: 'm', inputTokens: 1, outputTokens: 1 });
  };
  await categorizeUser(store, sort, 'user-a');
  await categorizeUser(store, sort, 'user-a');
  assertEquals(calls, 1);
});

Deno.test('merchants are sent in batches of at most 50', async () => {
  const merchants = Array.from({ length: 120 }, (_, i) => ({ id: `m${i}`, name: `shop ${i}` }));
  const { store } = fakeStore(merchants);
  const sizes: number[] = [];
  const sort: SortMerchants = (names) => {
    sizes.push(names.length);
    return Promise.resolve({ results: [], model: 'm', inputTokens: 0, outputTokens: 0 });
  };
  await categorizeUser(store, sort, 'user-a');
  assertEquals(sizes, [50, 50, 20]);
});

Deno.test('a call with neither a signed-in user nor the secret key is rejected', async () => {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  const response = await handler(new Request('http://localhost/categorize-merchants', { method: 'POST', body: '{}' }));
  assertEquals(response.status, 401);
  assertFalse((await response.json()).sorted);
});
