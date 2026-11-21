// The bank-sync provider interface (KTD8). Enable Banking is the only implementation.
// A later paid provider replaces one module that implements this interface.

export type Bank = { name: string; country: string; logo?: string };

export type BankAccount = {
  /** Stable across sessions, used to recognise the same account after a reconnect. */
  providerAccountId: string;
  /** Valid for the current session only. Transaction requests use it. */
  uid: string;
  name: string;
  currency: string;
};

export type BankSession = { sessionId: string; validUntil: string; accounts: BankAccount[] };

/** A booked transaction, already in the shape ingest_source_records expects. */
export type BankRecord = {
  provider_transaction_id?: string;
  booking_date: string;
  amount_minor: number;
  currency: string;
  description: string;
  raw: Record<string, unknown>;
};

export class SessionExpiredError extends Error {}

export interface BankProvider {
  listBanks(country: string): Promise<Bank[]>;
  startAuthorization(input: { bank: Bank; state: string; redirectUrl: string; validUntil: string }): Promise<{ url: string }>;
  createSession(code: string): Promise<BankSession>;
  /** Booked transactions from dateFrom onward, across every continuation page. Pending ones are skipped. */
  fetchBookedTransactions(accountUid: string, dateFrom: string): Promise<BankRecord[]>;
  deleteSession(sessionId: string): Promise<void>;
}
