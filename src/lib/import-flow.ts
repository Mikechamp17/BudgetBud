// The statement-file import flow (U6), kept free of UI so it can be tested.
import { buildCsvRecords, parseCsv, type ColumnMapping } from './parsers/csv';
import { parseOfx } from './parsers/ofx';
import type { ParseResult } from './parsers/types';

export type PendingFile = { name: string; text: string; kind: 'csv' | 'ofx' };
export type Account = { id: string; name: string; currency: string; file_mapping: ColumnMapping | null };

export function fileKind(name: string): PendingFile['kind'] | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 'ofx';
  return null;
}

/** OFX needs no mapping. A CSV needs one unless the account already saved it. */
export function nextStep(file: PendingFile, account: Account): 'map-columns' | 'preview' {
  return file.kind === 'csv' && !account.file_mapping ? 'map-columns' : 'preview';
}

export function buildPreview(file: PendingFile, account: Account): ParseResult {
  if (file.kind === 'ofx') {
    return parseOfx(file.text, account.currency);
  }
  if (!account.file_mapping) {
    throw new Error('This account has no column mapping yet.');
  }
  return buildCsvRecords(parseCsv(file.text), account.file_mapping, account.currency);
}

export const NO_TRANSACTIONS = 'No transactions found';

/** Holds the file between the import screens. */
let pending: PendingFile | null = null;
export const pendingImport = {
  get: () => pending,
  set: (file: PendingFile | null) => {
    pending = file;
  },
};

/** A picked PDF waiting for upload and review. */
export type PendingPdf = { name: string; read: () => Promise<ArrayBuffer> };
let pendingPdfFile: PendingPdf | null = null;
export const pendingPdf = {
  get: () => pendingPdfFile,
  set: (file: PendingPdf | null) => {
    pendingPdfFile = file;
  },
};
