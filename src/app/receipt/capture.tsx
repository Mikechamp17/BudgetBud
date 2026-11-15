import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorText, Screen } from '@/components/ui/kit';
import { captureReceipt } from '@/lib/receipts';

export default function CaptureReceiptScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(source: 'camera' | 'library') {
    setError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera access is off. Allow it in Settings, or choose a photo instead.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const photo = result.assets[0];
    setBusy(true);
    try {
      const id = await captureReceipt({ uri: photo.uri, width: photo.width, height: photo.height }, purchaseId || undefined);
      router.replace(`/receipt/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ThemedText>
        {purchaseId
          ? 'The receipt will attach to this purchase.'
          : 'The receipt attaches to its purchase now, or as soon as that purchase is imported.'}
      </ThemedText>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {busy ? <ThemedText themeColor="textSecondary">Reading the receipt…</ThemedText> : null}
      {Platform.OS !== 'web' ? <Button label="Take photo" onPress={() => run('camera')} busy={busy} /> : null}
      <Button kind="secondary" label="Choose a photo" onPress={() => run('library')} disabled={busy} />
    </Screen>
  );
}
