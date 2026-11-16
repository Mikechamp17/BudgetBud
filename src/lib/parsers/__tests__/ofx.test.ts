import { readFileSync } from 'fs';
import { join } from 'path';

import { parseOfx } from '../ofx';

describe('OFX', () => {
  const text = readFileSync(join(__dirname, '..', '__fixtures__', 'statement.ofx'), 'utf8');

  it('produces one record per transaction with its OFX transaction ID', () => {
    const { records, errors } = parseOfx(text, 'EUR');
    expect(errors).toEqual([]);
    expect(records).toEqual([
      expect.objectContaining({
        booking_date: '2026-03-03',
        amount_minor: -4217,
        currency: 'EUR',
        description: 'LIDL MT 1234 QORMI',
        provider_transaction_id: '202603030001',
      }),
      expect.objectContaining({ booking_date: '2026-03-05', amount_minor: 250000, provider_transaction_id: '202603050002' }),
    ]);
  });

  it('finds nothing in an empty file', () => {
    expect(parseOfx('', 'EUR').records).toEqual([]);
  });
});
