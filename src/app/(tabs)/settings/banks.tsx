import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Screen } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';
import {
  connectBank,
  linkHealth,
  listBanks,
  listLinks,
  mapBankAccounts,
  pendingLinkResult,
  removeBankLink,
  syncNow,
  type BankLink,
  type CompleteResult,
} from '@/lib/banks';
import type { Account } from '@/lib/import-flow';
import { listAccounts } from '@/lib/imports';

const COUNTRIES = ['MT', 'IE', 'LT', 'DE', 'IT', 'FR', 'ES', 'NL'];

function statusText(link: BankLink) {
  const health = linkHealth(link);
  switch (health.state) {
    case 'expiring':
      return `Needs reconnecting in ${health.daysLeft} days`;
    case 'expired':
      return 'Expired. Reconnect to keep syncing';
    case 'failed':
      return link.last_error ?? 'Link failed';
    case 'pending':
      return 'Waiting for the bank';
    default:
      return link.last_synced_at ? `Last synced ${new Date(link.last_synced_at).toLocaleString()}` : 'Not synced yet';
  }
}

/** Lets the user attach each new bank account to an account they already import into, or make a new one. */
function MapAccounts({ result, accounts, onDone }: { result: CompleteResult; accounts: Account[]; onDone: () => void }) {
  const [choice, setChoice] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await mapBankAccounts(
        result.link_id,
        (result.unmapped_accounts ?? []).map((a) => ({
          provider_account_id: a.providerAccountId,
          financial_account_id: choice[a.providerAccountId] ?? null,
        })),
      );
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <ThemedText type="smallBold">New bank accounts</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        If you already upload statements for an account, pick it, so the same purchases merge instead of doubling.
      </ThemedText>
      {result.unmapped_accounts?.map((a) => (
        <View key={a.providerAccountId} style={styles.block}>
          <ThemedText>
            {a.name} ({a.currency})
          </ThemedText>
          <View style={styles.chips}>
            <Chip label="New account" selected={!choice[a.providerAccountId]} onPress={() => setChoice((c) => ({ ...c, [a.providerAccountId]: null }))} />
            {accounts
              .filter((acc) => acc.currency === a.currency)
              .map((acc) => (
                <Chip
                  key={acc.id}
                  label={acc.name}
                  selected={choice[a.providerAccountId] === acc.id}
                  onPress={() => setChoice((c) => ({ ...c, [a.providerAccountId]: acc.id }))}
                />
              ))}
          </View>
        </View>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save accounts" onPress={save} busy={busy} />
    </Card>
  );
}

export default function BanksScreen() {
  const [links, setLinks] = useState<BankLink[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [country, setCountry] = useState('MT');
  const [banks, setBanks] = useState<{ name: string; country: string }[] | null>(null);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listLinks(), listAccounts()])
      .then(([l, a]) => {
        setLinks(l);
        setAccounts(a);
      })
      .catch((e: Error) => setError(e.message));
    const pending = pendingLinkResult.get();
    if (pending) {
      pendingLinkResult.set(null);
      Promise.resolve().then(() => setResult(pending));
    }
  }, []);

  useFocusEffect(load);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  }

  async function connect(input: Parameters<typeof connectBank>[0]) {
    await run('connect', async () => {
      const done = await connectBank(input);
      if (done?.status === 'failed') setMessage(done.message ?? 'The bank link failed.');
      else if (done?.unmapped_accounts?.length) setResult(done);
    });
  }

  return (
    <Screen>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {message ? <ThemedText>{message}</ThemedText> : null}
      {result?.unmapped_accounts?.length ? (
        <MapAccounts
          result={result}
          accounts={accounts}
          onDone={() => {
            setResult(null);
            load();
          }}
        />
      ) : null}
      {links?.map((link) => (
        <Card key={link.id}>
          <ThemedText type="smallBold">{link.institution_name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {statusText(link)}
          </ThemedText>
          <View style={styles.row}>
            {link.status !== 'failed' ? (
              <Button kind="secondary" label="Reconnect" busy={busy === 'connect'} onPress={() => connect({ linkId: link.id })} />
            ) : null}
            <Button kind="secondary" label="Remove" busy={busy === link.id} onPress={() => run(link.id, () => removeBankLink(link.id))} />
          </View>
        </Card>
      ))}
      {links?.some((l) => l.status === 'active') ? (
        <Button
          kind="secondary"
          label="Sync now"
          busy={busy === 'sync'}
          onPress={() =>
            run('sync', async () => {
              const r = await syncNow();
              setMessage(`${r.created} new, ${r.merged} merged, ${r.skipped} already had`);
            })
          }
        />
      ) : null}
      <Card>
        <ThemedText type="smallBold">Link a bank</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Purchases arrive every day without uploads. Links last up to 180 days, then you reconnect.
        </ThemedText>
        <View style={styles.chips}>
          {COUNTRIES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={country === c}
              onPress={() => {
                setCountry(c);
                setBanks(null);
              }}
            />
          ))}
        </View>
        {banks === null ? (
          <Button kind="secondary" label="Show banks" busy={busy === 'banks'} onPress={() => run('banks', async () => setBanks(await listBanks(country)))} />
        ) : (
          <View style={styles.chips}>
            {banks.map((b) => (
              <Chip key={b.name} label={b.name} selected={false} onPress={() => connect({ bank: b })} />
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  block: { gap: Spacing.one },
});
