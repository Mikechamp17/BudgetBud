// Money is integer minor units with an ISO currency code (KTD4). Outflows are negative.

const MINOR_DIGITS: Record<string, number> = {
  JPY: 0, KRW: 0, ISK: 0, CLP: 0, VND: 0, HUF: 2,
  BHD: 3, KWD: 3, JOD: 3, OMR: 3, TND: 3,
};

export function minorDigits(currency: string) {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/**
 * Parses a statement amount such as "-42.17", "1.234,56", or "(42.17)" into minor units.
 * Returns null when the text is not a number.
 */
export function parseAmountToMinor(text: string, decimalSeparator: '.' | ',', currency = 'EUR'): number | null {
  let value = text.trim();
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/[^\d.,+-]/g, '');
  if (value.startsWith('-')) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  const thousands = decimalSeparator === '.' ? ',' : '.';
  value = value.split(thousands).join('');
  const parts = value.split(decimalSeparator);
  if (parts.length > 2 || !/^\d+$/.test(parts[0] || '0') || (parts[1] !== undefined && !/^\d*$/.test(parts[1]))) {
    return null;
  }
  if (!parts[0] && !parts[1]) {
    return null;
  }
  const digits = minorDigits(currency);
  const fraction = (parts[1] ?? '').padEnd(digits, '0').slice(0, digits);
  const minor = Number(parts[0] || '0') * 10 ** digits + Number(fraction || '0');
  return negative ? -minor : minor;
}

export function formatMoney(minor: number, currency: string) {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat('en-MT', { style: 'currency', currency, minimumFractionDigits: digits }).format(
    minor / 10 ** digits,
  );
}
