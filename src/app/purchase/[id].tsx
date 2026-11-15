import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import { receiptsForPurchase, type Receipt } from '@/lib/receipts';
import {
  dismissNewPlace,
  getPurchase,
  listCategories,
  setPurchaseCategory,
  splitSource,
  toEurMinor,
  type PurchaseDetail,
} from '@/lib/spending';

const SOURCE_LABELS: Record<string, string> = { bank: 'Bank sync', csv: 'CSV file', ofx: 'OFX file', pdf: 'PDF statement' };

export default function PurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [eur, setEur] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const load = useCallback(() => {
    getPurchase(id)
      .then(async (p) => {
        setPurchase(p);
        if (p.currency !== 'EUR') {
          setEur(await toEurMinor(p.amount_minor, p.currency, p.booking_date));
        }
      })
      .catch((e: Error) => setError(e.message));
    receiptsForPurchase(id).then(setReceipts).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    listCategories().then(setCategories).catch((e: Error) => setError(e.message));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!purchase) {
    return <Screen>{error ? <ErrorText>{error}</ErrorText> : <ThemedText>Loading…</ThemedText>}</Screen>;
  }

  return (
    <Screen title={purchase.merchants?.display_name ?? purchase.description}>
      <Card>
        <ThemedText type="title">{formatMoney(purchase.amount_minor, purchase.currency)}</ThemedText>
        {purchase.currency !== 'EUR' ? (
          <ThemedText themeColor="textSecondary">
            {eur === null ? 'No exchange rate yet' : `≈ ${formatMoney(eur, 'EUR')}`}
          </ThemedText>
        ) : null}
        <ThemedText themeColor="textSecondary">
          {purchase.booking_date} · {purchase.financial_accounts?.name}
        </ThemedText>
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {purchase.is_new_place ? (
        <Card>
          <ThemedText>First purchase at this place.</ThemedText>
          <Button kind="secondary" label="Dismiss" onPress={() => run(() => dismissNewPlace(purchase.id))} />
        </Card>
      ) : null}
      <ThemedText type="smallBold">Category</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Changing it also sorts future purchases from this place.
      </ThemedText>
      <View style={styles.chips}>
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.id === purchase.category_id}
            onPress={() => run(() => setPurchaseCategory(purchase.id, c.id))}
          />
        ))}
      </View>
      <ThemedText type="smallBold">Receipt</ThemedText>
      {receipts.map((r) => (
        <Card key={r.id}>
          {r.receipt_items?.map((item) => (
            <View key={item.id} style={styles.item}>
              <ThemedText style={styles.flex}>{item.description}</ThemedText>
              {item.amount_minor !== null && r.currency ? (
                <ThemedText>{formatMoney(item.amount_minor, r.currency)}</ThemedText>
              ) : null}
            </View>
          ))}
        </Card>
      ))}
      {receipts.length === 0 ? (
        <Button
          kind="secondary"
          label="Attach receipt"
          onPress={() => router.push({ pathname: '/receipt/capture', params: { purchaseId: purchase.id } })}
        />
      ) : null}
      <ThemedText type="smallBold">Sources</ThemedText>
      {purchase.source_records.map((s) => (
        <Card key={s.id}>
          <ThemedText>{SOURCE_LABELS[s.kind] ?? s.kind}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {s.booking_date} · {s.description}
          </ThemedText>
          {purchase.source_records.length > 1 ? (
            <Button
              kind="secondary"
              label="This is two purchases"
              onPress={() => run(async () => router.replace(`/purchase/${await splitSource(s.id)}`))}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  item: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
