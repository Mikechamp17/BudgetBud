import { parseAmountToMinor } from '../money';
import { parseDate, type DateFormat } from './dates';
import type { ParseResult, SourceRecord } from './types';

/** skippedRows counts rows after the first table ends, such as totals or another account's section. */
export type CsvTable = { headers: string[]; rows: string[][]; skippedRows?: number };

/** Which columns hold what. Saved on the financial account after the first upload (KTD14). */
export type ColumnMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  currency?: string;
  dateFormat: DateFormat;
  decimalSeparator: '.' | ',';
};

function detectDelimiter(firstLine: string) {
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Splits CSV text into a header row and data rows. Handles quoted fields and ; or tab delimiters. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) {
    return { headers: [], rows: [] };
  }
  // Judge the delimiter from the first lines together: a statement can open with a title line that has none.
  const delimiter = detectDelimiter(clean.split(/\r?\n/, 20).join('\n'));
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((f) => f.trim())).map((r) => r.map((f) => f.trim()));
  const start = findHeaderRow(nonEmpty);
  const headers = nonEmpty[start] ?? [];
  const after = nonEmpty.slice(start + 1);
  // A statement can hold more than one table, such as a total line and then another account's section.
  // The first table ends at a total or separator line, a section title, or a repeat of the header.
  const end = after.findIndex(
    (r) =>
      /^(total|-{3,}|=+)/i.test(r[0] ?? '') ||
      (r.filter((c) => c).length === 1 && headers.length > 2) ||
      r.join('|') === headers.join('|'),
  );
  return { headers, rows: end < 0 ? after : after.slice(0, end), skippedRows: end < 0 ? 0 : after.length - end };
}

const DATE_HEADER = /date|datum|data/i;
const AMOUNT_HEADER = /amount|debit|credit|money|paid|betrag|value|importo/i;

/**
 * Finds the transaction table's header row. Some exports, such as Revolut statements, open with title
 * and summary lines before it. The header is the first row naming both a date and an amount column,
 * or else the first of the widest rows.
 */
export function findHeaderRow(rows: string[][]) {
  const named = rows.findIndex((r) => r.some((c) => DATE_HEADER.test(c)) && r.some((c) => AMOUNT_HEADER.test(c)));
  if (named >= 0) return named;
  const widest = Math.max(0, ...rows.map((r) => r.length));
  return Math.max(0, rows.findIndex((r) => r.length === widest));
}

/** True when a saved mapping still fits this file's columns. */
export function mappingFits(headers: string[], mapping: ColumnMapping) {
  const used = [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit, mapping.currency];
  const hasAmount = Boolean(mapping.amount || mapping.debit || mapping.credit);
  return hasAmount && used.every((column) => !column || headers.includes(column));
}

/** Suggests a mapping from common header names, for the first upload's mapping screen. */
export function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const find = (...names: RegExp[]) => headers.find((h) => names.some((n) => n.test(h)));
  return {
    date: find(/^started date$/i, /date/i, /datum/i),
    description: find(/description/i, /details/i, /payee/i, /narrative/i, /beschreibung/i),
    amount: find(/^amount$/i, /betrag/i, /amount/i),
    debit: find(/debit/i, /paid out/i, /money out/i),
    credit: find(/credit/i, /paid in/i, /money in/i),
    currency: find(/^currency$/i, /währung/i),
  };
}

/** Turns mapped CSV rows into records. A bad row becomes an error and the rest still import. */
export function buildCsvRecords(table: CsvTable, mapping: ColumnMapping, accountCurrency: string): ParseResult {
  const col = (name?: string) => (name ? table.headers.indexOf(name) : -1);
  const dateCol = col(mapping.date);
  const descCol = col(mapping.description);
  const amountCol = col(mapping.amount);
  const debitCol = col(mapping.debit);
  const creditCol = col(mapping.credit);
  const currencyCol = col(mapping.currency);

  const records: SourceRecord[] = [];
  const errors: ParseResult['errors'] = [];
  table.rows.forEach((cells, index) => {
    const row = index + 2; // Line number in the file, counting the header.
    const dateText = cells[dateCol] ?? '';
    const date = parseDate(dateText, mapping.dateFormat);
    if (!date) {
      errors.push({ row, message: `Unreadable date "${dateText}"` });
      return;
    }
    const currency = ((currencyCol >= 0 && cells[currencyCol]) || accountCurrency).trim().toUpperCase();
    let amount: number | null;
    if (amountCol >= 0) {
      amount = parseAmountToMinor(cells[amountCol] ?? '', mapping.decimalSeparator, currency);
    } else {
      const debitText = (cells[debitCol] ?? '').trim();
      const creditText = (cells[creditCol] ?? '').trim();
      const debit = debitText ? parseAmountToMinor(debitText, mapping.decimalSeparator, currency) : 0;
      const credit = creditText ? parseAmountToMinor(creditText, mapping.decimalSeparator, currency) : 0;
      amount = debit === null || credit === null ? null : Math.abs(credit) - Math.abs(debit);
    }
    if (amount === null) {
      errors.push({ row, message: 'Unreadable amount' });
      return;
    }
    const raw = Object.fromEntries(table.headers.map((h, i) => [h, cells[i] ?? '']));
    records.push({ booking_date: date, amount_minor: amount, currency, description: (cells[descCol] ?? '').trim(), raw });
  });
  return { records, errors };
}
