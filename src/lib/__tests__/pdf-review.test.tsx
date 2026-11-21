import { editLine, extractAllPages, toRecords, type RangeResult, type ReviewLine } from '../pdf-review';

const line = (description: string, amount_minor: number) => ({
  booking_date: '2026-03-03',
  description,
  amount_minor,
  currency: 'EUR',
});

it('joins the lines from all three ranges of a 12-page PDF, in page order', async () => {
  const starts: number[] = [];
  const extract = (pageStart: number): Promise<RangeResult> => {
    starts.push(pageStart);
    const end = Math.min(12, pageStart + 4);
    return Promise.resolve({ total_pages: 12, page_start: pageStart, page_end: end, lines: [line(`page ${pageStart}`, -100)] });
  };
  const lines = await extractAllPages(extract);
  expect(starts).toEqual([1, 6, 11]);
  expect(lines.map((l) => l.description)).toEqual(['page 1', 'page 6', 'page 11']);
});

it('AE6: editing an amount from €184.00 to €18.40 saves €18.40', () => {
  const lines: ReviewLine[] = [{ ...line('Pavi', -18400), key: 'a' }];
  const edited = editLine(lines, 'a', { amountText: '-18.40' });
  expect(toRecords(edited)[0].amount_minor).toBe(-1840);
});

it('accepts a comma decimal when editing', () => {
  const edited = editLine([{ ...line('Pavi', -18400), key: 'a' }], 'a', { amountText: '-18,40' });
  expect(edited[0].amount_minor).toBe(-1840);
});

it('does not save a deleted line', () => {
  const lines: ReviewLine[] = [
    { ...line('Keep', -100), key: 'a' },
    { ...line('Drop', -200), key: 'b' },
  ];
  expect(toRecords(editLine(lines, 'b', { deleted: true })).map((r) => r.description)).toEqual(['Keep']);
});

it('refuses to save a line with an unreadable amount', () => {
  const edited = editLine([{ ...line('Pavi', -100), key: 'a' }], 'a', { amountText: 'abc' });
  expect(() => toRecords(edited)).toThrow(/Amount is not a number/);
});
