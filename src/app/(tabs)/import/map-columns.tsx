import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { pendingImport } from '@/lib/import-flow';
import { saveMapping } from '@/lib/imports';
import { guessMapping, parseCsv, type ColumnMapping } from '@/lib/parsers/csv';
import { DATE_FORMATS, type DateFormat } from '@/lib/parsers/dates';

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
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(() => ({
    ...guessMapping(table.headers),
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!file || table.headers.length === 0) {
    return (
      <Screen>
        <ThemedText>No transactions found</ThemedText>
      </Screen>
    );
  }

  const set = (patch: Partial<ColumnMapping>) => setMapping((m) => ({ ...m, ...patch }));

  async function save() {
    const hasAmount = mapping.amount || mapping.debit || mapping.credit;
    if (!mapping.date || !mapping.description || !hasAmount) {
      setError('Choose the date, description, and amount columns.');
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

  return (
    <Screen>
      <ThemedText>Match this file&apos;s columns once. The next upload for this account reuses it.</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        First row: {table.rows[0]?.join(' · ')}
      </ThemedText>
      {FIELDS.map((field) => (
        <Card key={field.key}>
          <ThemedText type="smallBold">{field.label}</ThemedText>
          <View style={styles.row}>
            {field.optional ? (
              <Chip label="None" selected={!mapping[field.key]} onPress={() => set({ [field.key]: undefined })} />
            ) : null}
            {table.headers.map((h) => (
              <Chip key={h} label={h} selected={mapping[field.key] === h} onPress={() => set({ [field.key]: h })} />
            ))}
          </View>
        </Card>
      ))}
      <Card>
        <ThemedText type="smallBold">Date format</ThemedText>
        <View style={styles.row}>
          {DATE_FORMATS.map((f) => (
            <Chip key={f} label={f} selected={mapping.dateFormat === f} onPress={() => set({ dateFormat: f as DateFormat })} />
          ))}
        </View>
        <ThemedText type="smallBold">Decimal separator</ThemedText>
        <View style={styles.row}>
          <Chip label="1,234.56" selected={mapping.decimalSeparator === '.'} onPress={() => set({ decimalSeparator: '.' })} />
          <Chip label="1.234,56" selected={mapping.decimalSeparator === ','} onPress={() => set({ decimalSeparator: ',' })} />
        </View>
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save and preview" onPress={save} busy={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
