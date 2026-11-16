// Server copy of the app's amount parser. Money is integer minor units (KTD4).

const MINOR_DIGITS: Record<string, number> = {
  JPY: 0, KRW: 0, ISK: 0, CLP: 0, VND: 0,
  BHD: 3, KWD: 3, JOD: 3, OMR: 3, TND: 3,
};

export function minorDigits(currency: string) {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Converts a decimal amount string such as "-42.17" to minor units. Returns null for anything else. */
export function decimalToMinor(text: string, currency: string): number | null {
  const match = /^\s*(-)?(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!match) return null;
  const digits = minorDigits(currency);
  const fraction = (match[3] ?? '').padEnd(digits, '0').slice(0, digits);
  const minor = Number(match[2]) * 10 ** digits + Number(fraction || '0');
  return match[1] ? -minor : minor;
}
