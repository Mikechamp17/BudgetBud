import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import { candidatePurchases, getReceipt, linkReceipt, type Receipt } from '@/lib/receipts';

type Candidate = { id: string; booking_date: string; amount_minor: number; currency: string; description: string };

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getReceipt(id).then(setReceipt).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (receipt?.status !== 'pending') return;
    let active = true;
    candidatePurchases(receipt, search)
      .then((c) => active && setCandidates(c))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [receipt, search]);

  async function link(purchaseId: string) {
    try {
      await linkReceipt(id, purchaseId);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!receipt) {
    return <Screen>{error ? <ErrorText>{error}</ErrorText> : <ThemedText>Loading…</ThemedText>}</Screen>;
  }

  return (
    <Screen title={receipt.merchant_name ?? 'Receipt'}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <ThemedText type="subtitle">
          {receipt.total_minor !== null && receipt.currency ? formatMoney(receipt.total_minor, receipt.currency) : 'No total'}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{receipt.receipt_date}</ThemedText>
        {receipt.status === 'matched' && receipt.purchase_id ? (
          <Pressable onPress={() => router.push(`/purchase/${receipt.purchase_id}`)}>
            <ThemedText type="linkPrimary">Attached to a purchase. Open it</ThemedText>
          </Pressable>
        ) : (
          <ThemedText themeColor="textSecondary">Waiting for its purchase to arrive.</ThemedText>
        )}
      </Card>
      {receipt.receipt_items?.map((item) => (
        <View key={item.id} style={styles.row}>
          <ThemedText style={styles.flex}>
            {item.quantity && item.quantity !== 1 ? `${item.quantity} × ` : ''}
            {item.description}
          </ThemedText>
          {item.amount_minor !== null && receipt.currency ? (
            <ThemedText>{formatMoney(item.amount_minor, receipt.currency)}</ThemedText>
          ) : null}
        </View>
      ))}
      {receipt.status === 'pending' ? (
        <>
          <ThemedText type="smallBold">Link to a purchase</ThemedText>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Search purchases"
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {candidates.length === 0 ? (
            <ThemedText themeColor="textSecondary">No purchases within 7 days in this currency.</ThemedText>
          ) : null}
          {candidates.map((p) => (
            <Pressable key={p.id} onPress={() => link(p.id)} style={styles.row}>
              <ThemedText style={styles.flex} numberOfLines={1}>
                {p.booking_date} · {p.description}
              </ThemedText>
              <ThemedText>{formatMoney(p.amount_minor, p.currency)}</ThemedText>
            </Pressable>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', paddingVertical: Spacing.one },
  flex: { flex: 1 },
  input: { borderRadius: 10, padding: Spacing.three, fontSize: 16 },
});
