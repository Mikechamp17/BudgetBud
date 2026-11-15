import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { buildPreview, NO_TRANSACTIONS, pendingImport, type Account } from '@/lib/import-flow';
import { getAccount, runImport, type IngestResult } from '@/lib/imports';
import { formatMoney } from '@/lib/money';
import type { ParseResult } from '@/lib/parsers/types';

export default function PreviewScreen() {
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const file = pendingImport.get();
  const [account, setAccount] = useState<Account | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    getAccount(accountId)
      .then((a) => {
        setAccount(a);
        setPreview(buildPreview(file, a));
      })
      .catch((e: Error) => setError(e.message));
  }, [accountId, file]);

  async function save() {
    if (!account || !file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await runImport(account, file, preview.records));
      pendingImport.set(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Screen title="Import finished">
        <Card>
          <ThemedText>{result.created} new purchases</ThemedText>
          <ThemedText>{result.merged} merged with purchases you already had</ThemedText>
          <ThemedText>{result.skipped} already imported, skipped</ThemedText>
        </Card>
        <Button label="See purchases" onPress={() => router.navigate('/')} />
      </Screen>
    );
  }

  if (!file || (preview && preview.records.length === 0 && preview.errors.length === 0)) {
    return (
      <Screen>
        <ThemedText>{NO_TRANSACTIONS}</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen title={file.name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {preview ? (
        <>
          <ThemedText>
            {preview.records.length} transactions ready
            {preview.errors.length ? `, ${preview.errors.length} rows could not be read` : ''}
          </ThemedText>
          {preview.errors.map((e) => (
            <ErrorText key={e.row}>
              Row {e.row}: {e.message}
            </ErrorText>
          ))}
          <Button label={`Save ${preview.records.length} transactions`} onPress={save} busy={busy} disabled={!preview.records.length} />
          {preview.records.slice(0, 100).map((r, i) => (
            <View key={i} style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
                {r.booking_date}
              </ThemedText>
              <ThemedText type="small" style={styles.desc} numberOfLines={1}>
                {r.description}
              </ThemedText>
              <ThemedText type="small">{formatMoney(r.amount_minor, r.currency)}</ThemedText>
            </View>
          ))}
        </>
      ) : (
        <ThemedText themeColor="textSecondary">Reading file…</ThemedText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  date: { width: 90 },
  desc: { flex: 1 },
});
