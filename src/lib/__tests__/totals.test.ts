import { compareCategories, monthStart, percentChange, shiftMonth } from '../spending';

jest.mock('../supabase', () => ({ supabase: {} }));

it('shifts months across year boundaries', () => {
  expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
  expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
  expect(shiftMonth('2026-03-01', 0)).toBe('2026-03-01');
});

it('finds the start of a month', () => {
  expect(monthStart(new Date(2026, 2, 17))).toBe('2026-03-01');
});

it('computes the change against the previous month', () => {
  expect(percentChange(13000, 10000)).toBe(30);
  expect(percentChange(5000, 0)).toBeNull();
});

it('pairs category totals with the previous month', () => {
  const rows = compareCategories(
    [{ category_id: 'dining', name: 'Dining', total_minor: 13000, count: 4 }],
    [{ category_id: 'dining', name: 'Dining', total_minor: 10000, count: 3 }],
  );
  expect(rows[0]).toMatchObject({ previous_minor: 10000, change: 30 });
});
