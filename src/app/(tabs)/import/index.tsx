import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, ErrorText, Screen } from '@/components/ui/kit';
import { fileKind, nextStep, pendingImport, type Account } from '@/lib/import-flow';
import { listAccounts } from '@/lib/imports';

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset) {
  if (Platform.OS === 'web' && asset.file) {
    return asset.file.text();
  }
  return new File(asset.uri).text();
}

export default function ImportScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listAccounts()
        .then((list) => {
          setAccounts(list);
          setAccountId((current) => current ?? list[0]?.id ?? null);
        })
        .catch((e: Error) => setError(e.message));
    }, []),
  );

  async function pickFile() {
    const account = accounts?.find((a) => a.id === accountId);
    if (!account) return;
    setError(null);
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const kind = fileKind(asset.name);
      if (!kind) {
        setError('Choose a CSV or OFX file. PDF statements come later.');
        return;
      }
      const file = { name: asset.name, kind, text: await readPickedFile(asset) };
      pendingImport.set(file);
      router.push({ pathname: `/import/${nextStep(file, account)}`, params: { accountId: account.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ThemedText>Upload a CSV or OFX statement. Purchases you already have are merged, not doubled.</ThemedText>
      <Card>
        <ThemedText type="smallBold">Account</ThemedText>
        {accounts === null ? <ThemedText themeColor="textSecondary">Loading accounts…</ThemedText> : null}
        {accounts?.length === 0 ? (
          <ThemedText themeColor="textSecondary">Add the account this statement belongs to.</ThemedText>
        ) : null}
        {accounts?.map((a) => (
          <Chip key={a.id} label={`${a.name} (${a.currency})`} selected={a.id === accountId} onPress={() => setAccountId(a.id)} />
        ))}
        <Button kind="secondary" label="Add account" onPress={() => router.push('/import/new-account')} />
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Choose statement file" onPress={pickFile} busy={busy} disabled={!accountId} />
    </Screen>
  );
}
