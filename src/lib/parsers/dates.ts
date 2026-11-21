export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD.MM.YYYY', 'DD-MM-YYYY', 'DD MMM YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const PATTERNS: Record<DateFormat, { re: RegExp; order: ['y' | 'm' | 'd', 'y' | 'm' | 'd', 'y' | 'm' | 'd'] }> = {
  'YYYY-MM-DD': { re: /^(\d{4})-(\d{1,2})-(\d{1,2})/, order: ['y', 'm', 'd'] },
  'DD/MM/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: ['d', 'm', 'y'] },
  'MM/DD/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: ['m', 'd', 'y'] },
  'DD.MM.YYYY': { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})/, order: ['d', 'm', 'y'] },
  'DD-MM-YYYY': { re: /^(\d{1,2})-(\d{1,2})-(\d{4})/, order: ['d', 'm', 'y'] },
  // "12 Nov 2026", "12-Nov-2026", "12 November 2026". The month is read by name below.
  'DD MMM YYYY': { re: /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{4})/, order: ['d', 'm', 'y'] },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthNumber(text: string) {
  return /^\d+$/.test(text) ? Number(text) : MONTHS.indexOf(text.slice(0, 3).toLowerCase()) + 1;
}

/** Returns an ISO date (YYYY-MM-DD), or null when the text is not a real date in that format. Ignores a trailing time. */
export function parseDate(text: string, format: DateFormat): string | null {
  const { re, order } = PATTERNS[format];
  const match = re.exec(text.trim());
  if (!match) {
    return null;
  }
  const parts = { y: 0, m: 0, d: 0 };
  order.forEach((key, i) => (parts[key] = key === 'm' ? monthNumber(match[i + 1]) : Number(match[i + 1])));
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (date.getUTCFullYear() !== parts.y || date.getUTCMonth() !== parts.m - 1 || date.getUTCDate() !== parts.d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Picks the format that reads the most sample dates, preferring the earlier format on a tie. */
export function detectDateFormat(samples: string[]): DateFormat {
  const filled = samples.filter((s) => s.trim()).slice(0, 50);
  let best: DateFormat = DATE_FORMATS[0];
  let bestCount = -1;
  for (const format of DATE_FORMATS) {
    const count = filled.filter((s) => parseDate(s, format) !== null).length;
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}
