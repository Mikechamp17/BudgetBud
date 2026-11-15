// The shared merchant sorter (KTD11). Used by categorize-merchants and the daily bank sync.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { SortMerchants } from './groq.ts';

export const BATCH_SIZE = 50;
const UNCATEGORIZED = 'Uncategorized';

export type Merchant = { id: string; name: string };
export type Category = { id: string; name: string };

/** Database access the sorter needs. Always scoped to one user. */
export interface SortStore {
  uncategorizedMerchants(userId: string): Promise<Merchant[]>;
  categories(): Promise<Category[]>;
  saveAiRule(userId: string, merchant: Merchant, categoryId: string): Promise<void>;
  /** Records that Groq answered for these merchants, so they are not sent again. */
  markSorted(userId: string, merchantIds: string[]): Promise<void>;
  logUsage(userId: string, model: string, inputTokens: number, outputTokens: number): Promise<void>;
}

/**
 * Sorts every merchant of this user whose purchases are still Uncategorized.
 * Merchant names come from the database, never from a request. Each answer becomes an AI rule,
 * so a merchant costs one call per user. A failed batch writes nothing and is retried on the next run.
 */
export async function categorizeUser(store: SortStore, sort: SortMerchants, userId: string) {
  const merchants = await store.uncategorizedMerchants(userId);
  if (merchants.length === 0) {
    return { sorted: 0, failedBatches: 0 };
  }
  const categories = await store.categories();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const names = categories.map((c) => c.name);

  let sorted = 0;
  let failedBatches = 0;
  for (let i = 0; i < merchants.length; i += BATCH_SIZE) {
    const batch = merchants.slice(i, i + BATCH_SIZE);
    let answer;
    try {
      answer = await sort(batch.map((m) => m.name), names);
    } catch (error) {
      console.error('Merchant sorting batch failed', error);
      failedBatches++;
      continue;
    }
    await store.logUsage(userId, answer.model, answer.inputTokens, answer.outputTokens);
    const byName = new Map(batch.map((m) => [m.name, m]));
    for (const result of answer.results) {
      const merchant = byName.get(result.merchant);
      const categoryId = categoryByName.get(result.category);
      if (!merchant || !categoryId || result.category === UNCATEGORIZED) {
        continue;
      }
      byName.delete(result.merchant);
      await store.saveAiRule(userId, merchant, categoryId);
      sorted++;
    }
    await store.markSorted(userId, batch.map((m) => m.id));
  }
  return { sorted, failedBatches };
}

/** SortStore backed by a service-role Supabase client. Every query filters by user_id explicitly. */
export function supabaseSortStore(admin: SupabaseClient): SortStore {
  return {
    async uncategorizedMerchants(userId) {
      // One row per merchant with Uncategorized purchases that Groq has not answered for yet.
      const { data, error } = await admin
        .from('merchants')
        .select('id, normalized_name, purchases!inner(id)')
        .eq('user_id', userId)
        .is('ai_sorted_at', null)
        .eq('purchases.category_source', 'none');
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id as string, name: row.normalized_name as string }));
    },
    async markSorted(userId, merchantIds) {
      const { error } = await admin
        .from('merchants')
        .update({ ai_sorted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('id', merchantIds);
      if (error) throw error;
    },
    async categories() {
      const { data, error } = await admin.from('categories').select('id, name').is('user_id', null);
      if (error) throw error;
      return data ?? [];
    },
    async saveAiRule(userId, merchant, categoryId) {
      const { error: ruleError } = await admin.from('category_rules').upsert(
        { user_id: userId, match_name: merchant.name, match_type: 'exact', category_id: categoryId, origin: 'ai' },
        { onConflict: 'user_id,match_name', ignoreDuplicates: true },
      );
      if (ruleError) throw ruleError;
      const { error } = await admin
        .from('purchases')
        .update({ category_id: categoryId, category_source: 'ai' })
        .eq('user_id', userId)
        .eq('merchant_id', merchant.id)
        .eq('category_source', 'none');
      if (error) throw error;
    },
    async logUsage(userId, model, inputTokens, outputTokens) {
      const { error } = await admin.from('ai_usage').insert({
        user_id: userId,
        provider: 'groq',
        model,
        purpose: 'categorize-merchants',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
      if (error) throw error;
    },
  };
}
