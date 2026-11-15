// Month math and spending queries for the dashboard and purchase list (U7).
import { supabase } from './supabase';

export type CategoryTotal = { category_id: string | null; name: string | null; total_minor: number; count: number };
export type MonthlySpending = { month: string; total_minor: number; unconverted: number; categories: CategoryTotal[] };

/** First day of the month containing the date, as YYYY-MM-01. */
export function monthStart(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** Percent change against the previous month, or null when there is nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Pairs this month's category totals with last month's, largest first. */
export function compareCategories(current: CategoryTotal[], previous: CategoryTotal[]) {
  const before = new Map(previous.map((c) => [c.category_id, c.total_minor]));
  return current.map((c) => ({
    ...c,
    previous_minor: before.get(c.category_id) ?? 0,
    change: percentChange(c.total_minor, before.get(c.category_id) ?? 0),
  }));
}

export async function fetchMonthlySpending(month: string): Promise<MonthlySpending> {
  const { data, error } = await supabase.rpc('monthly_spending', { p_month: month });
  if (error) throw error;
  return data as MonthlySpending;
}

export type PurchaseFilters = { month: string; categoryId?: string; accountId?: string; newPlacesOnly?: boolean };
export type PurchaseRow = {
  id: string;
  booking_date: string;
  amount_minor: number;
  currency: string;
  description: string;
  is_new_place: boolean;
  categories: { name: string } | null;
  merchants: { display_name: string } | null;
};

export async function listPurchases(filters: PurchaseFilters): Promise<PurchaseRow[]> {
  let query = supabase
    .from('purchases')
    .select('id, booking_date, amount_minor, currency, description, is_new_place, categories(name), merchants(display_name)')
    .gte('booking_date', filters.month)
    .lt('booking_date', shiftMonth(filters.month, 1))
    .order('booking_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.accountId) query = query.eq('financial_account_id', filters.accountId);
  if (filters.newPlacesOnly) query = query.eq('is_new_place', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseRow[];
}

export async function listCategories(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('categories').select('id, name').order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export type PurchaseDetail = PurchaseRow & {
  category_id: string | null;
  category_source: string;
  financial_accounts: { name: string } | null;
  source_records: { id: string; kind: string; booking_date: string; description: string; created_at: string }[];
};

export async function getPurchase(id: string): Promise<PurchaseDetail> {
  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, booking_date, amount_minor, currency, description, is_new_place, category_id, category_source, ' +
        'categories(name), merchants(display_name), financial_accounts(name), ' +
        'source_records(id, kind, booking_date, description, created_at)',
    )
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as PurchaseDetail;
}

export async function toEurMinor(amountMinor: number, currency: string, date: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('to_eur_minor', {
    p_amount_minor: amountMinor,
    p_currency: currency,
    p_date: date,
  });
  if (error) throw error;
  return data as number | null;
}

export async function setPurchaseCategory(purchaseId: string, categoryId: string) {
  const { error } = await supabase.rpc('set_purchase_category', { p_purchase_id: purchaseId, p_category_id: categoryId });
  if (error) throw error;
}

export async function dismissNewPlace(purchaseId: string) {
  const { error } = await supabase.rpc('dismiss_new_place', { p_purchase_id: purchaseId });
  if (error) throw error;
}

export async function splitSource(sourceRecordId: string): Promise<string> {
  const { data, error } = await supabase.rpc('split_source_record', { p_source_record_id: sourceRecordId });
  if (error) throw error;
  return data as string;
}
