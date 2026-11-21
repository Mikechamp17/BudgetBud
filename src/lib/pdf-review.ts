// PDF statement review (U9): extract every 5-page range in order, let the user fix lines, then save.
import { parseAmountToMinor } from './money';
import type { SourceRecord } from './parsers/types';

export type ExtractedLine = { booking_date: string; description: string; amount_minor: number | null; currency: string };
export type ReviewLine = ExtractedLine & { key: string; deleted?: boolean };
export type RangeResult = { total_pages: number; page_start: number; page_end: number; lines: ExtractedLine[] };
export type ExtractRange = (pageStart: number) => Promise<RangeResult>;

/** Calls extraction once per page range, in order, and joins the lines into one review list. */
export async function extractAllPages(extract: ExtractRange, onProgress?: (done: number, total: number) => void) {
  const lines: ReviewLine[] = [];
  let pageStart = 1;
  let total = 1;
  do {
    const range = await extract(pageStart);
    total = range.total_pages;
    range.lines.forEach((line, i) => lines.push({ ...line, key: `${range.page_start}-${i}` }));
    onProgress?.(range.page_end, total);
    pageStart = range.page_end + 1;
  } while (pageStart <= total);
  return lines;
}

/** Applies a user's edit. Amount text is parsed as a decimal with a dot or comma. */
export function editLine(
  lines: ReviewLine[],
  key: string,
  edit: { booking_date?: string; description?: string; amountText?: string; deleted?: boolean },
): ReviewLine[] {
  return lines.map((line) => {
    if (line.key !== key) return line;
    const next = { ...line };
    if (edit.booking_date !== undefined) next.booking_date = edit.booking_date;
    if (edit.description !== undefined) next.description = edit.description;
    if (edit.deleted !== undefined) next.deleted = edit.deleted;
    if (edit.amountText !== undefined) {
      const separator = /,\d{1,2}$/.test(edit.amountText.trim()) ? ',' : '.';
      next.amount_minor = parseAmountToMinor(edit.amountText, separator, line.currency);
    }
    return next;
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lineProblem(line: ReviewLine): string | null {
  if (!ISO_DATE.test(line.booking_date) || Number.isNaN(Date.parse(line.booking_date))) return 'Date must be YYYY-MM-DD';
  if (line.amount_minor === null) return 'Amount is not a number';
  if (!line.description.trim()) return 'Description is empty';
  return null;
}

/** Records to save: every line not deleted. Throws if a kept line still has a problem. */
export function toRecords(lines: ReviewLine[]): SourceRecord[] {
  const kept = lines.filter((l) => !l.deleted);
  const bad = kept.find((l) => lineProblem(l));
  if (bad) throw new Error(`Fix the line "${bad.description}": ${lineProblem(bad)}`);
  return kept.map((l) => ({
    booking_date: l.booking_date,
    amount_minor: l.amount_minor as number,
    currency: l.currency,
    description: l.description.trim(),
  }));
}
