import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pendingPdf, type Account } from '@/lib/import-flow';
import { extractStatementRange, getAccount, runImport, uploadToBucket, type IngestResult } from '@/lib/imports';
import { formatMoney, minorDigits } from '@/lib/money';
import { editLine, extractAllPages, lineProblem, toRecords, type ReviewLine } from '@/lib/pdf-review';

function amountText(line: ReviewLine) {
  if (line.amount_minor === null) return '';
  return (line.amount_minor / 10 ** minorDigits(line.currency)).toFixed(minorDigits(line.currency));
}

export default function PdfReviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const file = pendingPdf.get();
  const [account, setAccount] = useState<Account | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [lines, setLines] = useState<ReviewLine[] | null>(null);
  const [progress, setProgress] = useState('Uploading…');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  // Uploads once, then extracts. A failed extraction keeps the uploaded file so "Try again" skips the upload.
  const extract = useCallback(async () => {
    if (!file) return;
    try {
      let storagePath = path;
      if (!storagePath) {
        storagePath = await uploadToBucket('statements', file.name, await file.read(), 'application/pdf');
        setPath(storagePath);
      }
      setProgress('Reading pages…');
      const found = await extractAllPages(
        (start) => extractStatementRange(storagePath, start),
        (done, total) => setProgress(`Read ${done} of ${total} pages…`),
      );
      setLines(found);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [file, path]);

  useEffect(() => {
    getAccount(accountId).then(setAccount).catch((e: Error) => setError(e.message));
    Promise.resolve().then(extract);
    // Run once on open. Retries go through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function save() {
    if (!account || !file || !lines) return;
    setBusy(true);
    setError(null);
    try {
      const records = toRecords(lines);
      setResult(await runImport(account, { kind: 'pdf', name: file.name, storagePath: path ?? undefined }, records));
      pendingPdf.set(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <Screen>
        <ThemedText>Choose a PDF statement from the Import tab.</ThemedText>
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen title="Import finished">
        <Card>
          <ThemedText>{result.created} new purchases</ThemedText>
          <ThemedText>{result.merged} merged with purchases you already had</ThemedText>
          <ThemedText>{result.skipped} already imported, skipped</ThemedText>
        </Card>
        <Button label="See purchases" onPress={() => router.navigate('/purchases')} />
      </Screen>
    );
  }

  const input = [styles.input, { color: theme.text, backgroundColor: theme.background }];
  const kept = lines?.filter((l) => !l.deleted) ?? [];

  return (
    <Screen title={file.name}>
      {error ? (
        <>
          <ErrorText>{error}</ErrorText>
          {!lines ? <Button
              label="Try again"
              onPress={() => {
                setError(null);
                extract();
              }}
            /> : null}
        </>
      ) : null}
      {!lines && !error ? <ThemedText themeColor="textSecondary">{progress}</ThemedText> : null}
      {lines?.length === 0 ? <ThemedText>No transactions found</ThemedText> : null}
      {lines && lines.length > 0 ? (
        <>
          <ThemedText>Check each line. Fix anything misread, or remove it, then save.</ThemedText>
          <Button label={`Save ${kept.length} transactions`} onPress={save} busy={busy} disabled={!kept.length} />
          {lines.map((line) => (
            <Card key={line.key} style={line.deleted ? styles.deleted : undefined}>
              <View style={styles.row}>
                <TextInput
                  style={[input, styles.date]}
                  value={line.booking_date}
                  onChangeText={(t) => setLines((ls) => ls && editLine(ls, line.key, { booking_date: t }))}
                />
                <TextInput
                  style={[input, styles.amount]}
                  defaultValue={amountText(line)}
                  keyboardType="numbers-and-punctuation"
                  onChangeText={(t) => setLines((ls) => ls && editLine(ls, line.key, { amountText: t }))}
                />
                <ThemedText type="small">{line.currency}</ThemedText>
              </View>
              <TextInput
                style={input}
                value={line.description}
                onChangeText={(t) => setLines((ls) => ls && editLine(ls, line.key, { description: t }))}
              />
              <View style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  {lineProblem(line) ?? (line.amount_minor !== null ? formatMoney(line.amount_minor, line.currency) : '')}
                </ThemedText>
                <Button
                  kind="secondary"
                  label={line.deleted ? 'Keep' : 'Remove'}
                  onPress={() => setLines((ls) => ls && editLine(ls, line.key, { deleted: !line.deleted }))}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, fontSize: 15 },
  date: { width: 120 },
  amount: { flex: 1 },
  flex: { flex: 1 },
  deleted: { opacity: 0.4 },
});
