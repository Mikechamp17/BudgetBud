// Supabase calls for statement imports.
import type { ColumnMapping } from './parsers/csv';
import type { SourceRecord } from './parsers/types';
import type { Account, PendingFile } from './import-flow';
import { supabase } from './supabase';

export type IngestResult = { created: number; merged: number; skipped: number };

async function userId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, name, currency, file_mapping')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function getAccount(id: string): Promise<Account> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, name, currency, file_mapping')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Account;
}

export async function createAccount(name: string, currency: string): Promise<Account> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({ user_id: await userId(), name, currency })
    .select('id, name, currency, file_mapping')
    .single();
  if (error) throw error;
  return data as Account;
}

export async function saveMapping(accountId: string, mapping: ColumnMapping) {
  const { error } = await supabase.from('financial_accounts').update({ file_mapping: mapping }).eq('id', accountId);
  if (error) throw error;
}

/**
 * Creates an import, sends the records to ingest, then asks the sorter to categorize new merchants.
 * Sorting failures are ignored here: uncategorized merchants are retried on the next run.
 */
export async function runImport(account: Account, file: PendingFile, records: SourceRecord[]): Promise<IngestResult> {
  const { data: created, error } = await supabase
    .from('imports')
    .insert({ user_id: await userId(), financial_account_id: account.id, kind: file.kind, file_name: file.name })
    .select('id')
    .single();
  if (error) throw error;
  const { data, error: ingestError } = await supabase.rpc('ingest_source_records', {
    p_import_id: created.id,
    p_records: records,
  });
  if (ingestError) throw ingestError;
  supabase.functions.invoke('categorize-merchants', { body: {} }).catch(() => undefined);
  return data as IngestResult;
}
