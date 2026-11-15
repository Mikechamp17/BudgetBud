import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import { listReceipts, type Receipt } from '@/lib/receipts';

export default function ReceiptsScreen() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listReceipts().then(setReceipts).catch((e: Error) => setError(e.message));
    }, []),
  );

  return (
    <Screen>
      <Button label="Add receipt" onPress={() => router.push('/receipt/capture')} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {receipts?.length === 0 ? <ThemedText themeColor="textSecondary">No receipts yet.</ThemedText> : null}
      {receipts?.map((r) => (
        <Link key={r.id} href={`/receipt/${r.id}`} asChild>
          <Pressable style={styles.row}>
            <View style={styles.flex}>
              <ThemedText numberOfLines={1}>{r.merchant_name ?? 'Receipt'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.receipt_date} · {r.status === 'matched' ? 'Attached' : 'Waiting for its purchase'}
              </ThemedText>
            </View>
            {r.total_minor !== null && r.currency ? <ThemedText>{formatMoney(r.total_minor, r.currency)}</ThemedText> : null}
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  flex: { flex: 1 },
});
