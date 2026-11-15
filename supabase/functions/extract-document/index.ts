// Reads a PDF statement or a receipt photo with Claude and returns structured data (U8).
// The file is downloaded with the caller's own client, so storage policies hide other users' files.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

import { json, secretKey } from '../_shared/auth.ts';
import { type CallModel, claudeCaller, type ContentBlock } from '../_shared/claude.ts';
import { decimalToMinor } from '../_shared/money.ts';
import { RECEIPT_PROMPT, receiptSchema, STATEMENT_PROMPT, statementSchema } from './schemas.ts';

export const PAGES_PER_CALL = 5;
export const MAX_PAGES = 50;
export const MAX_BYTES = 30 * 1024 * 1024; // Under the API's 32 MB request limit after base64.

export type ExtractRequest = { kind: 'statement' | 'receipt'; path: string; page_start?: number };

export type Deps = {
  download(bucket: string, path: string): Promise<Uint8Array | null>;
  callModel: CallModel;
  logUsage(model: string, inputTokens: number, outputTokens: number, purpose: string): Promise<void>;
};

export class ExtractError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const IMAGE_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

async function slicePdf(bytes: Uint8Array, start: number, end: number) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const slice = await PDFDocument.create();
  const pages = await slice.copyPages(source, Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i));
  pages.forEach((page) => slice.addPage(page));
  return await slice.save();
}

async function ask(deps: Deps, purpose: string, system: string, content: ContentBlock[], schema: Record<string, unknown>) {
  const reply = await deps.callModel({ system, content, schema });
  if (reply.inputTokens > 0 || reply.outputTokens > 0) {
    await deps.logUsage(reply.model, reply.inputTokens, reply.outputTokens, purpose);
  }
  if (reply.stopReason === 'refusal') {
    throw new ExtractError('The document could not be read. Try a clearer file, or enter the lines by hand.', 422);
  }
  if (reply.stopReason === 'max_tokens') {
    throw new ExtractError('The document was too long to read in one go.', 502);
  }
  try {
    return JSON.parse(reply.text);
  } catch {
    throw new ExtractError('The reply could not be read.', 502);
  }
}

export async function extractDocument(deps: Deps, request: ExtractRequest) {
  const bucket = request.kind === 'statement' ? 'statements' : 'receipts';
  const bytes = await deps.download(bucket, request.path);
  if (!bytes) {
    throw new ExtractError('File not found', 404);
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new ExtractError('The file is larger than 30 MB.', 413);
  }

  if (request.kind === 'receipt') {
    const mediaType = IMAGE_TYPES[request.path.split('.').pop()?.toLowerCase() ?? ''];
    if (!mediaType) {
      throw new ExtractError('Receipts must be JPEG, PNG, or WebP images.', 415);
    }
    const data = await ask(deps, 'extract-receipt', RECEIPT_PROMPT, [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: encodeBase64(bytes) } },
      { type: 'text', text: 'Read this receipt.' },
    ], receiptSchema);
    const currency = String(data.currency).toUpperCase();
    return {
      receipt: {
        merchant: data.merchant,
        date: data.date,
        currency,
        total_minor: decimalToMinor(data.total, currency),
        items: (data.items ?? []).map((item: { description: string; quantity: number; amount: string }, i: number) => ({
          position: i,
          description: item.description,
          quantity: item.quantity,
          amount_minor: decimalToMinor(item.amount, currency),
        })),
      },
    };
  }

  let totalPages: number;
  try {
    totalPages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    throw new ExtractError('This file is not a readable PDF.', 415);
  }
  if (totalPages > MAX_PAGES) {
    throw new ExtractError(`PDFs over ${MAX_PAGES} pages are not supported. This one has ${totalPages}.`, 413);
  }
  const start = Math.max(1, Math.floor(request.page_start ?? 1));
  if (start > totalPages) {
    throw new ExtractError(`Page ${start} is past the end of the document.`, 400);
  }
  const end = Math.min(totalPages, start + PAGES_PER_CALL - 1);
  const slice = await slicePdf(bytes, start, end);

  const data = await ask(deps, 'extract-statement', STATEMENT_PROMPT, [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(slice) } },
    { type: 'text', text: `These are pages ${start} to ${end} of ${totalPages}.` },
  ], statementSchema);

  const lines = (data.lines ?? []).map((line: { date: string; description: string; amount: string; currency: string }) => {
    const currency = String(line.currency).toUpperCase();
    return {
      booking_date: line.date,
      description: line.description,
      currency,
      amount_minor: decimalToMinor(line.amount, currency),
    };
  });
  return { total_pages: totalPages, page_start: start, page_end: end, lines };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization) {
    return json({ error: 'Missing authorization' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const userClient = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (authError || !auth.user) {
    return json({ error: 'Invalid session' }, 401);
  }
  const userId = auth.user.id;

  const body = (await req.json().catch(() => ({}))) as Partial<ExtractRequest>;
  if ((body.kind !== 'statement' && body.kind !== 'receipt') || typeof body.path !== 'string') {
    return json({ error: 'kind and path are required' }, 400);
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY is not set' }, 503);
  }
  const admin = createClient(url, secretKey(), { auth: { persistSession: false } });

  const deps: Deps = {
    async download(bucket, path) {
      const { data, error } = await userClient.storage.from(bucket).download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    callModel: claudeCaller(apiKey),
    async logUsage(model, inputTokens, outputTokens, purpose) {
      const { error } = await admin.from('ai_usage').insert({
        user_id: userId,
        provider: 'anthropic',
        model,
        purpose,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
      if (error) console.error('Could not log AI usage', error);
    },
  };

  try {
    return json(await extractDocument(deps, body as ExtractRequest));
  } catch (error) {
    if (error instanceof ExtractError) {
      return json({ error: error.message }, error.status);
    }
    console.error('Extraction failed', error);
    return json({ error: 'Extraction failed' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
