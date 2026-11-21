import { readFileSync } from 'fs';
import { join } from 'path';

import { buildCsvRecords, guessMapping, parseCsv, type ColumnMapping } from '../csv';

const fixture = (name: string) => readFileSync(join(__dirname, '..', '__fixtures__', name), 'utf8');

describe('Revolut CSV', () => {
  const table = parseCsv(fixture('revolut.csv'));
  const mapping: ColumnMapping = {
    date: 'Started Date',
    description: 'Description',
    amount: 'Amount',
    currency: 'Currency',
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
  };

  it('parses dates, minor-unit amounts, and per-row currencies', () => {
    const { records, errors } = buildCsvRecords(table, mapping, 'EUR');
    expect(errors).toEqual([]);
    expect(records[0]).toEqual({
      booking_date: '2026-03-03',
      amount_minor: -4217,
      currency: 'EUR',
      description: 'Lidl',
      raw: expect.objectContaining({ Description: 'Lidl' }),
    });
    expect(records[3]).toMatchObject({ amount_minor: -2000, currency: 'GBP' });
    expect(records[4]).toMatchObject({ amount_minor: 50000 });
  });

  it('keeps two identical rows as two records', () => {
    const { records } = buildCsvRecords(table, mapping, 'EUR');
    expect(records.filter((r) => r.description === 'Cafe Cordina')).toHaveLength(2);
  });

  it('guesses the Revolut mapping from its headers', () => {
    expect(guessMapping(table.headers)).toMatchObject({ date: 'Started Date', amount: 'Amount', currency: 'Currency' });
  });

  it('produces identical records for the same file read twice', () => {
    const again = buildCsvRecords(parseCsv(fixture('revolut.csv')), mapping, 'EUR');
    expect(again.records).toEqual(buildCsvRecords(table, mapping, 'EUR').records);
  });
});

describe('HSBC Malta CSV with debit and credit columns', () => {
  const table = parseCsv(fixture('hsbc-malta.csv'));
  const { records, errors } = buildCsvRecords(
    table,
    { date: 'Date', description: 'Description', debit: 'Debit', credit: 'Credit', dateFormat: 'DD/MM/YYYY', decimalSeparator: '.' },
    'EUR',
  );

  it('makes debits negative and credits positive', () => {
    expect(records[0]).toMatchObject({ booking_date: '2026-03-03', amount_minor: -1999, description: 'PAVI SUPERMARKET, QORMI' });
    expect(records[1]).toMatchObject({ amount_minor: 250000 });
    expect(records[2]).toMatchObject({ amount_minor: -123450 });
  });

  it('reports an unparseable date row without blocking the others', () => {
    expect(records).toHaveLength(3);
    expect(errors).toEqual([{ row: 4, message: 'Unreadable date "31/02/2026"' }]);
  });
});

describe('CSV with comma decimals', () => {
  it('parses "1.234,56" to 123456 minor units', () => {
    const table = parseCsv(fixture('generic-eu.csv'));
    expect(table.headers).toEqual(['Datum', 'Beschreibung', 'Betrag']);
    const { records } = buildCsvRecords(
      table,
      { date: 'Datum', description: 'Beschreibung', amount: 'Betrag', dateFormat: 'DD.MM.YYYY', decimalSeparator: ',' },
      'EUR',
    );
    expect(records.map((r) => r.amount_minor)).toEqual([-123456, 25000]);
  });
});

describe('empty file', () => {
  it('has no rows', () => {
    const table = parseCsv('');
    expect(table.rows).toEqual([]);
  });
});

describe('statement with a summary section before the transactions', () => {
  const table = parseCsv(fixture('revolut-statement.csv'));

  it('finds the transaction header row, not the title line', () => {
    expect(table.headers).toContain('Started Date');
    expect(table.rows).toHaveLength(2);
  });

  it('guesses the date, amount, and currency columns', () => {
    expect(guessMapping(table.headers)).toMatchObject({ date: 'Started Date', amount: 'Amount', currency: 'Currency' });
  });
});

describe('dates written with month names', () => {
  it('reads "12 Nov 2026" and picks that format from the rows', () => {
    const { parseDate, detectDateFormat } = jest.requireActual('../dates');
    expect(parseDate('12 Nov 2026', 'DD MMM YYYY')).toBe('2026-11-12');
    expect(parseDate('3 September 2026', 'DD MMM YYYY')).toBe('2026-09-03');
    expect(parseDate('31 Feb 2026', 'DD MMM YYYY')).toBeNull();
    expect(detectDateFormat(['12 Nov 2026', '13 Nov 2026'])).toBe('DD MMM YYYY');
    expect(detectDateFormat(['2026-11-03 12:14:02'])).toBe('YYYY-MM-DD');
    expect(detectDateFormat(['13/11/2026', '01/11/2026'])).toBe('DD/MM/YYYY');
  });
});

describe('statement with a total line and a second account section', () => {
  it('stops at the end of the first table and counts what it left out', () => {
    const table = parseCsv(fixture('revolut-statement.csv'));
    expect(table.rows).toHaveLength(2);
    expect(table.rows.map((r) => r[4])).toEqual(['Lidl', 'Top-Up by *1234']);
    expect(table.skippedRows).toBe(5);
  });
});
