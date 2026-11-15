/** A normalized record, in the shape ingest_source_records expects. */
export type SourceRecord = {
  booking_date: string;
  amount_minor: number;
  currency: string;
  description: string;
  provider_transaction_id?: string;
  raw?: Record<string, string>;
};

export type RowError = { row: number; message: string };

export type ParseResult = { records: SourceRecord[]; errors: RowError[] };
