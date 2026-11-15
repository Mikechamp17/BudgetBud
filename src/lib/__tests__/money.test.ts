import { formatMoney, parseAmountToMinor } from '../money';

describe('parseAmountToMinor', () => {
  it.each([
    ['-42.17', '.', -4217],
    ['1,234.56', '.', 123456],
    ['1.234,56', ',', 123456],
    ['-1.234,56', ',', -123456],
    ['250,00', ',', 25000],
    ['(42.17)', '.', -4217],
    ['€ 5', '.', 500],
    ['5.5', '.', 550],
  ])('parses %s with %s decimals', (text, separator, expected) => {
    expect(parseAmountToMinor(text, separator as '.' | ',')).toBe(expected);
  });

  it('uses the currency minor-unit digits', () => {
    expect(parseAmountToMinor('1200', '.', 'JPY')).toBe(1200);
  });

  it.each(['', 'abc', '1.2.3,4,5'])('rejects %p', (text) => {
    expect(parseAmountToMinor(text, '.')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats minor units with the currency', () => {
    expect(formatMoney(-4217, 'EUR')).toContain('42.17');
  });
});
