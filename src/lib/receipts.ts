// Receipt capture and matching (U10). A receipt never creates a purchase.
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { extractReceipt, uploadToBucket } from './imports';
import { prepareReceiptImage } from './receipt-image';
import { shiftDays } from './dates';
import { supabase } from './supabase';

export type Receipt = {
  id: string;
  merchant_name: string | null;
  receipt_date: string | null;
  total_minor: number | null;
  currency: string | null;
  status: 'pending' | 'matched';
  purchase_id: string | null;
  receipt_items?: { id: string; position: number; description: string; quantity: number | null; amount_minor: number | null }[];
};

const RECEIPT_COLUMNS = 'id, merchant_name, receipt_date, total_minor, currency, status, purchase_id';

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).arrayBuffer();
  }
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Resizes, uploads, and reads a receipt photo, saves it with its items, then attaches it:
 * to the given purchase when started from a purchase, otherwise to the best match if one exists.
 */
export async function captureReceipt(photo: { uri: string; width: number; height: number }, purchaseId?: string) {
  const image = await prepareReceiptImage(photo.uri, photo.width, photo.height);
  const path = await uploadToBucket('receipts', 'receipt.jpg', await readBytes(image.uri), 'image/jpeg');
  const data = await extractReceipt(path);
  const userId = path.split('/')[0];

  const { data: receipt, error } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      storage_path: path,
      merchant_name: data.merchant,
      receipt_date: data.date,
      total_minor: data.total_minor,
      currency: data.currency,
      raw: data,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (data.items.length) {
    const { error: itemsError } = await supabase.from('receipt_items').insert(
      data.items.map((item) => ({
        user_id: userId,
        receipt_id: receipt.id,
        position: item.position,
        description: item.description,
        quantity: item.quantity,
        amount_minor: item.amount_minor,
      })),
    );
    if (itemsError) throw itemsError;
  }

  if (purchaseId) {
    await linkReceipt(receipt.id, purchaseId);
  } else {
    const { error: matchError } = await supabase.rpc('match_receipt', { p_receipt_id: receipt.id });
    if (matchError) throw matchError;
  }
  return receipt.id as string;
}

export async function linkReceipt(receiptId: string, purchaseId: string) {
  const { error } = await supabase.rpc('link_receipt', { p_receipt_id: receiptId, p_purchase_id: purchaseId });
  if (error) throw error;
}

export async function listReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase.from('receipts').select(RECEIPT_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Receipt[];
}

export async function getReceipt(id: string): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .select(`${RECEIPT_COLUMNS}, receipt_items(id, position, description, quantity, amount_minor)`)
    .eq('id', id)
    .order('position', { referencedTable: 'receipt_items' })
    .single();
  if (error) throw error;
  return data as Receipt;
}

export async function receiptsForPurchase(purchaseId: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select(`${RECEIPT_COLUMNS}, receipt_items(id, position, description, quantity, amount_minor)`)
    .eq('purchase_id', purchaseId);
  if (error) throw error;
  return (data ?? []) as Receipt[];
}

/** Purchases a pending receipt could belong to: same currency, within 7 days either side, optional text search. */
export async function candidatePurchases(receipt: Receipt, search: string) {
  let query = supabase
    .from('purchases')
    .select('id, booking_date, amount_minor, currency, description')
    .lt('amount_minor', 0)
    .order('booking_date', { ascending: false })
    .limit(50);
  if (receipt.currency) query = query.eq('currency', receipt.currency);
  if (receipt.receipt_date) {
    query = query.gte('booking_date', shiftDays(receipt.receipt_date, -7)).lte('booking_date', shiftDays(receipt.receipt_date, 7));
  }
  if (search.trim()) query = query.ilike('description', `%${search.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
