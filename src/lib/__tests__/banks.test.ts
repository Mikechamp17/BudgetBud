import { linkHealth, linksNeedingAttention, type BankLink } from '../banks';

jest.mock('../supabase', () => ({ supabase: {} }));

const now = new Date('2026-06-01T12:00:00Z');
const link = (status: BankLink['status'], validUntil: string | null): BankLink => ({
  id: 'l1',
  institution_name: 'Revolut',
  institution_country: 'MT',
  status,
  valid_until: validUntil,
  last_synced_at: null,
  last_error: null,
});

it('reports a link within 7 days of valid_until as expiring, with the days left', () => {
  expect(linkHealth(link('active', '2026-06-06T12:00:00Z'), now)).toEqual({ state: 'expiring', daysLeft: 5 });
});

it('reports a link further out as active', () => {
  expect(linkHealth(link('active', '2026-09-01T00:00:00Z'), now).state).toBe('active');
});

it('reports a link past valid_until, or marked expired, as expired', () => {
  expect(linkHealth(link('active', '2026-05-30T00:00:00Z'), now).state).toBe('expired');
  expect(linkHealth(link('expired', '2026-09-01T00:00:00Z'), now).state).toBe('expired');
});

it('shows the banner for expiring and expired links, and clears it after a reconnect', () => {
  const expired = link('expired', '2026-05-30T00:00:00Z');
  expect(linksNeedingAttention([expired], now)).toHaveLength(1);
  const reconnected = { ...expired, status: 'active' as const, valid_until: '2026-11-28T00:00:00Z' };
  expect(linksNeedingAttention([reconnected], now)).toHaveLength(0);
});
