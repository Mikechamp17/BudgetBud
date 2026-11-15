// Loads ECB euro reference rates into fx_rates (KTD13). Called daily by pg_cron with the secret key.
// The first run loads the full history so imported past statements convert too. Later runs load the
// last 90 days, which also fills any days a failed run missed. Existing rows are never changed.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, secretKey } from '../_shared/auth.ts';

const ECB = 'https://www.ecb.europa.eu/stats/eurofxref';
export const HISTORY_URL = `${ECB}/eurofxref-hist.xml`;
export const RECENT_URL = `${ECB}/eurofxref-hist-90d.xml`;

export type Rate = { currency: string; rate_date: string; rate: number };

/** Parses the ECB reference-rate XML: <Cube time="..."><Cube currency="USD" rate="1.08"/>...</Cube>. */
export function parseEcbXml(xml: string): Rate[] {
  const rates: Rate[] = [];
  const dayPattern = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const ratePattern = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']\s*\/>/g;
  for (const day of xml.matchAll(dayPattern)) {
    for (const rate of day[2].matchAll(ratePattern)) {
      rates.push({ currency: rate[1], rate_date: day[1], rate: Number(rate[2]) });
    }
  }
  return rates;
}

export interface RateStore {
  isEmpty(): Promise<boolean>;
  insertNew(rates: Rate[]): Promise<void>;
}

export async function loadRates(store: RateStore, fetchFn: typeof fetch = fetch) {
  const url = (await store.isEmpty()) ? HISTORY_URL : RECENT_URL;
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`ECB request failed with status ${response.status}`);
  }
  const rates = parseEcbXml(await response.text());
  for (let i = 0; i < rates.length; i += 5000) {
    await store.insertNew(rates.slice(i, i + 5000));
  }
  return { url, rates: rates.length };
}

export async function handler(req: Request): Promise<Response> {
  const key = secretKey();
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!key || token !== key) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
  const store: RateStore = {
    async isEmpty() {
      const { count, error } = await admin.from('fx_rates').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return !count;
    },
    async insertNew(rates) {
      const { error } = await admin
        .from('fx_rates')
        .upsert(rates, { onConflict: 'currency,rate_date', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
  return json(await loadRates(store));
}

if (import.meta.main) {
  Deno.serve(handler);
}
