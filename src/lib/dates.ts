/** Adds days to an ISO date (YYYY-MM-DD) and returns an ISO date. */
export function shiftDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "19 Nov" for a date in the current year, "19 Nov 2025" otherwise. */
export function shortDate(isoDate: string, today = new Date()) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (date.getUTCFullYear() !== today.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString('en-GB', options);
}
