import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { listAccounts } from '@/lib/imports';
import { formatMoney } from '@/lib/money';
import {
  listCategories,
  listPurchases,
  monthLabel,
  monthStart,
  shiftMonth,
  type PurchaseRow,
} from '@/lib/spending';

type Option = { id: string; name: string };

function FilterRow({ options, value, onChange }: { options: Option[]; value: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      <Chip label="All" selected={!value} onPress={() => onChange('')} />
      {options.map((o) => (
        <Chip key={o.id} label={o.name} selected={value === o.id} onPress={() => onChange(o.id)} />
      ))}
    </ScrollView>
  );
}

export default function PurchasesScreen() {
  const params = useLocalSearchParams<{ month?: string; categoryId?: string }>();
  const [month, setMonth] = useState(params.month || monthStart(new Date()));
  const [categoryId, setCategoryId] = useState(params.categoryId ?? '');
  const [accountId, setAccountId] = useState('');
  const [newPlacesOnly, setNewPlacesOnly] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listCategories(), listAccounts()])
      .then(([c, a]) => {
        setCategories(c);
        setAccounts(a);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listPurchases({ month, categoryId, accountId, newPlacesOnly })
        .then((r) => active && setRows(r))
        .catch((e: Error) => active && setError(e.message));
      return () => {
        active = false;
      };
    }, [month, categoryId, accountId, newPlacesOnly]),
  );

  return (
    <Screen>
      <View style={styles.switcher}>
        <Button kind="secondary" label="‹" onPress={() => setMonth(shiftMonth(month, -1))} />
        <ThemedText type="subtitle" style={styles.monthLabel}>
          {monthLabel(month)}
        </ThemedText>
        <Button kind="secondary" label="›" onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <FilterRow options={categories} value={categoryId} onChange={setCategoryId} />
      {accounts.length > 1 ? <FilterRow options={accounts} value={accountId} onChange={setAccountId} /> : null}
      <View style={styles.chips}>
        <Chip label="New places only" selected={newPlacesOnly} onPress={() => setNewPlacesOnly((v) => !v)} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rows?.length === 0 ? <ThemedText themeColor="textSecondary">No purchases match.</ThemedText> : null}
      {rows?.map((p) => (
        <Link key={p.id} href={`/purchase/${p.id}`} asChild>
          <Pressable style={styles.row}>
            <View style={styles.flex}>
              <ThemedText numberOfLines={1}>
                {p.merchants?.display_name ?? p.description}
                {p.is_new_place ? '  • New place' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.booking_date} · {p.categories?.name ?? 'Uncategorized'}
              </ThemedText>
            </View>
            <ThemedText>{formatMoney(p.amount_minor, p.currency)}</ThemedText>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  monthLabel: { flex: 1, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  flex: { flex: 1 },
});
