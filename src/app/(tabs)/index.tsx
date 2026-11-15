import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Button, Card, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import {
  compareCategories,
  fetchMonthlySpending,
  monthLabel,
  monthStart,
  percentChange,
  shiftMonth,
  type MonthlySpending,
} from '@/lib/spending';

export default function DashboardScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [data, setData] = useState<{ current: MonthlySpending; previous: MonthlySpending } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchMonthlySpending(month), fetchMonthlySpending(shiftMonth(month, -1))])
        .then(([current, previous]) => active && setData({ current, previous }))
        .catch((e: Error) => active && setError(e.message));
      return () => {
        active = false;
      };
    }, [month]),
  );

  const current = data?.current.month === month ? data.current : null;
  const rows = current && data ? compareCategories(current.categories, data.previous.categories) : [];
  const largest = Math.max(1, ...rows.map((r) => r.total_minor));
  const change = current && data ? percentChange(current.total_minor, data.previous.total_minor) : null;

  return (
    <Screen>
      <View style={styles.switcher}>
        <Button kind="secondary" label="‹" onPress={() => setMonth(shiftMonth(month, -1))} />
        <ThemedText type="subtitle" style={styles.monthLabel}>
          {monthLabel(month)}
        </ThemedText>
        <Button kind="secondary" label="›" onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!current ? <ThemedText themeColor="textSecondary">Loading…</ThemedText> : null}
      {current && rows.length === 0 ? (
        <Card>
          <ThemedText>No spending this month.</ThemedText>
          <Link href="/import">
            <ThemedText type="linkPrimary">Import a statement</ThemedText>
          </Link>
        </Card>
      ) : null}
      {current && rows.length > 0 ? (
        <>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Spent this month
            </ThemedText>
            <ThemedText type="title">{formatMoney(current.total_minor, 'EUR')}</ThemedText>
            {change !== null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {change >= 0 ? '+' : ''}
                {change}% against {monthLabel(shiftMonth(month, -1))}
              </ThemedText>
            ) : null}
          </Card>
          {current.unconverted > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {current.unconverted} purchases in other currencies have no exchange rate yet and are not counted.
            </ThemedText>
          ) : null}
          {rows.map((row) => (
            <Link
              key={row.category_id ?? 'none'}
              href={{ pathname: '/purchases', params: { month, categoryId: row.category_id ?? '' } }}
              asChild>
              <Pressable style={styles.row}>
                <View style={styles.rowText}>
                  <ThemedText style={styles.flex}>{row.name ?? 'Uncategorized'}</ThemedText>
                  <ThemedText>{formatMoney(row.total_minor, 'EUR')}</ThemedText>
                </View>
                <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.bar, { width: `${(row.total_minor / largest) * 100}%` }]} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.change === null ? 'New this month' : `${row.change >= 0 ? '+' : ''}${row.change}% vs last month`}
                </ThemedText>
              </Pressable>
            </Link>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  monthLabel: { flex: 1, textAlign: 'center' },
  row: { gap: Spacing.one, paddingVertical: Spacing.two },
  rowText: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: Accent },
});
