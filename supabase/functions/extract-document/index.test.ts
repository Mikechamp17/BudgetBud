import { decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

import type { ContentBlock, ModelReply } from '../_shared/claude.ts';
import { type Deps, extractDocument, ExtractError, handler } from './index.ts';

async function pdfWithPages(count: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([200, 200]);
  return await doc.save();
}

// Recorded structured-output replies.
const statementReply: ModelReply = {
  model: 'claude-sonnet-5-5',
  stopReason: 'end_turn',
  text: JSON.stringify({
    lines: [
      { date: '2026-03-03', description: 'LIDL MT 1234 QORMI', amount: '-42.17', currency: 'EUR' },
      { date: '2026-03-05', description: 'SALARY MARCH', amount: '2500.00', currency: 'eur' },
    ],
  }),
  inputTokens: 5210,
  outputTokens: 180,
};
const receiptReply: ModelReply = {
  model: 'claude-sonnet-5-5',
  stopReason: 'end_turn',
  text: JSON.stringify({
    merchant: 'Pavi Supermarket',
    date: '2026-03-03',
    total: '18.40',
    currency: 'EUR',
    items: [
      { description: 'Milk 1L', quantity: 2, amount: '2.40' },
      { description: 'Bread', quantity: 1, amount: '16.00' },
    ],
  }),
  inputTokens: 1600,
  outputTokens: 120,
};

function fakeDeps(files: Record<string, Uint8Array>, reply: ModelReply) {
  const calls: { content: ContentBlock[] }[] = [];
  const usage: { model: string; inputTokens: number; outputTokens: number }[] = [];
  const deps: Deps = {
    download: (bucket, path) => Promise.resolve(files[`${bucket}/${path}`] ?? null),
    callModel: (request) => {
      calls.push(request);
      return Promise.resolve(reply);
    },
    logUsage: (model, inputTokens, outputTokens) => {
      usage.push({ model, inputTokens, outputTokens });
      return Promise.resolve();
    },
  };
  return { deps, calls, usage };
}

Deno.test('a recorded statement reply returns lines with minor-unit amounts and ISO dates', async () => {
  const { deps, usage } = fakeDeps({ 'statements/u1/march.pdf': await pdfWithPages(2) }, statementReply);
  const result = await extractDocument(deps, { kind: 'statement', path: 'u1/march.pdf' });
  assertEquals(result, {
    total_pages: 2,
    page_start: 1,
    page_end: 2,
    lines: [
      { booking_date: '2026-03-03', description: 'LIDL MT 1234 QORMI', currency: 'EUR', amount_minor: -4217 },
      { booking_date: '2026-03-05', description: 'SALARY MARCH', currency: 'EUR', amount_minor: 250000 },
    ],
  });
  assertEquals(usage, [{ model: 'claude-sonnet-5-5', inputTokens: 5210, outputTokens: 180 }]);
});

Deno.test('a recorded receipt reply returns merchant, total, and items', async () => {
  const { deps, calls } = fakeDeps({ 'receipts/u1/r.jpg': new Uint8Array([0xff, 0xd8, 0xff]) }, receiptReply);
  const result = await extractDocument(deps, { kind: 'receipt', path: 'u1/r.jpg' });
  assertEquals(result.receipt?.merchant, 'Pavi Supermarket');
  assertEquals(result.receipt?.total_minor, 1840);
  assertEquals(result.receipt?.items.map((i: { amount_minor: number | null }) => i.amount_minor), [240, 1600]);
  assertEquals(calls[0].content[0].type, 'image');
});

Deno.test('another user\'s file is not found, because storage policies hide it', async () => {
  const { deps, calls } = fakeDeps({}, statementReply);
  const error = await assertRejects(() => extractDocument(deps, { kind: 'statement', path: 'u2/march.pdf' }), ExtractError);
  assertEquals(error.status, 404);
  assertEquals(calls.length, 0);
});

Deno.test('a 60-page PDF is rejected before any Claude call', async () => {
  const { deps, calls } = fakeDeps({ 'statements/u1/big.pdf': await pdfWithPages(60) }, statementReply);
  const error = await assertRejects(() => extractDocument(deps, { kind: 'statement', path: 'u1/big.pdf' }), ExtractError);
  assertEquals(error.status, 413);
  assertEquals(calls.length, 0);
});

Deno.test('pages 6 to 10 of a 12-page PDF send only those 5 pages and report 12 in total', async () => {
  const { deps, calls } = fakeDeps({ 'statements/u1/long.pdf': await pdfWithPages(12) }, statementReply);
  const result = await extractDocument(deps, { kind: 'statement', path: 'u1/long.pdf', page_start: 6 });
  assertEquals([result.total_pages, result.page_start, result.page_end], [12, 6, 10]);
  const document = calls[0].content[0];
  if (document.type !== 'document') throw new Error('expected a document block');
  assertEquals((await PDFDocument.load(decodeBase64(document.source.data))).getPageCount(), 5);
});

Deno.test('a refusal returns an error and still logs usage', async () => {
  const refusal: ModelReply = { ...statementReply, stopReason: 'refusal', text: '', outputTokens: 3 };
  const { deps, usage } = fakeDeps({ 'statements/u1/march.pdf': await pdfWithPages(1) }, refusal);
  const error = await assertRejects(() => extractDocument(deps, { kind: 'statement', path: 'u1/march.pdf' }), ExtractError);
  assertEquals(error.status, 422);
  assertEquals(usage.length, 1);
});

Deno.test('a call without a signed-in user is rejected', async () => {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  const response = await handler(new Request('http://localhost/extract-document', { method: 'POST', body: '{}' }));
  assertEquals(response.status, 401);
  await response.body?.cancel();
});
