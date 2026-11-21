import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui/kit';
import { Select } from '@/components/ui/select';
import { pendingImport } from '@/lib/import-flow';
import { saveMapping } from '@/lib/imports';
import { formatMoney } from '@/lib/money';
import { buildCsvRecords, guessMapping, parseCsv, type ColumnMapping } from '@/lib/parsers/csv';
import { DATE_FORMATS, detectDateFormat, type DateFormat } from '@/lib/parsers/dates';

type Field = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'currency';
const FIELDS: { key: Field; label: string; optional?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount (one column)', optional: true },
  { key: 'debit', label: 'Money out (if separate)', optional: true },
  { key: 'credit', label: 'Money in (if separate)', optional: true },
  { key: 'currency', label: 'Currency column', optional: true },
];

export default function MapColumnsScreen() {
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const file = pendingImport.get();
  const table = useMemo(() => parseCsv(file?.text ?? ''), [file]);
  const samplesFor = (column?: string) => {
    const index = column ? table.headers.indexOf(column) : -1;
    return index < 0 ? [] : table.rows.map((r) => r[index] ?? '');
  };
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(() => {
    const guess = guessMapping(table.headers);
    return { ...guess, dateFormat: detectDateFormat(samplesFor(guess.date)), decimalSeparator: '.' };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!file || table.headers.length === 0) {
    return (
      <Screen>
        <ThemedText>No transactions found</ThemedText>
      </Screen>
    );
  }

  const set = (patch: Partial<ColumnMapping>) =>
    setMapping((m) => ({
      ...m,
      ...patch,
      // Choosing the date column also picks the date format that reads it.
      ...(patch.date ? { dateFormat: detectDateFormat(samplesFor(patch.date)) } : {}),
    }));

  async function save() {
    const hasAmount = mapping.amount || mapping.debit || mapping.credit;
    if (!mapping.date || !mapping.description || !hasAmount) {
      setError('Choose the date, description, and amount columns.');
      return;
    }
    if (mapping.date === mapping.description || mapping.date === mapping.amount || mapping.description === mapping.amount) {
      setError('Date, description, and amount must be different columns.');
      return;
    }
    setBusy(true);
    try {
      await saveMapping(accountId, mapping as ColumnMapping);
      router.replace({ pathname: '/import/preview', params: { accountId } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const NONE = '__none__';
  const sample = (column: string) => {
    const value = table.rows.find((r) => r[table.headers.indexOf(column)])?.[table.headers.indexOf(column)];
    return value ? `${column} (e.g. ${value.length > 24 ? `${value.slice(0, 24)}…` : value})` : column;
  };
  const columnOptions = (optional?: boolean) => [
    ...(optional ? [{ value: NONE, label: 'None' }] : []),
    ...table.headers.filter((h) => h).map((h) => ({ value: h, label: sample(h) })),
  ];
  // How the first transaction reads with the current choices, so mistakes show before saving.
  const check =
    mapping.date && mapping.description && (mapping.amount || mapping.debit || mapping.credit)
      ? buildCsvRecords({ headers: table.headers, rows: table.rows.slice(0, 1) }, mapping as ColumnMapping, 'EUR')
      : null;

  return (
    <Screen>
      <ThemedText>Match this file&apos;s columns once. The next upload for this account reuses it.</ThemedText>
      <Card>
        {FIELDS.map((field) => (
          <Select
            key={field.key}
            label={field.label}
            value={mapping[field.key] ?? (field.optional ? NONE : undefined)}
            options={columnOptions(field.optional)}
            onChange={(v) => set({ [field.key]: v === NONE ? undefined : v })}
          />
        ))}
        <Select
          label="Date format"
          value={mapping.dateFormat}
          options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
          onChange={(v) => set({ dateFormat: v as DateFormat })}
        />
        <Select
          label="Decimal separator"
          value={mapping.decimalSeparator}
          options={[
            { value: '.', label: '1,234.56' },
            { value: ',', label: '1.234,56' },
          ]}
          onChange={(v) => set({ decimalSeparator: v as '.' | ',' })}
        />
      </Card>
      {check ? (
        <Card>
          <ThemedText type="smallBold">First transaction reads as</ThemedText>
          {check.records[0] ? (
            <ThemedText>
              {check.records[0].booking_date} · {check.records[0].description} ·{' '}
              {formatMoney(check.records[0].amount_minor, check.records[0].currency)}
            </ThemedText>
          ) : (
            <ErrorText>{check.errors[0]?.message ?? 'Not readable yet'}. Check the columns and date format.</ErrorText>
          )}
        </Card>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save and preview" onPress={save} busy={busy} />
    </Screen>
  );
}


