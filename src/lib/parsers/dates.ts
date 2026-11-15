export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD.MM.YYYY', 'DD-MM-YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const PATTERNS: Record<DateFormat, { re: RegExp; order: ['y' | 'm' | 'd', 'y' | 'm' | 'd', 'y' | 'm' | 'd'] }> = {
  'YYYY-MM-DD': { re: /^(\d{4})-(\d{1,2})-(\d{1,2})/, order: ['y', 'm', 'd'] },
  'DD/MM/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: ['d', 'm', 'y'] },
  'MM/DD/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: ['m', 'd', 'y'] },
  'DD.MM.YYYY': { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})/, order: ['d', 'm', 'y'] },
  'DD-MM-YYYY': { re: /^(\d{1,2})-(\d{1,2})-(\d{4})/, order: ['d', 'm', 'y'] },
};

/** Returns an ISO date (YYYY-MM-DD), or null when the text is not a real date in that format. Ignores a trailing time. */
export function parseDate(text: string, format: DateFormat): string | null {
  const { re, order } = PATTERNS[format];
  const match = re.exec(text.trim());
  if (!match) {
    return null;
  }
  const parts = { y: 0, m: 0, d: 0 };
  order.forEach((key, i) => (parts[key] = Number(match[i + 1])));
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (date.getUTCFullYear() !== parts.y || date.getUTCMonth() !== parts.m - 1 || date.getUTCDate() !== parts.d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}
