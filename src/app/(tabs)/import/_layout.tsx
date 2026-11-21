import { Stack } from 'expo-router';

export default function ImportLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Import' }} />
      <Stack.Screen name="new-account" options={{ title: 'New account' }} />
      <Stack.Screen name="map-columns" options={{ title: 'Match columns' }} />
      <Stack.Screen name="preview" options={{ title: 'Preview' }} />
      <Stack.Screen name="pdf-review" options={{ title: 'Review PDF' }} />
      <Stack.Screen name="receipts" options={{ title: 'Receipts' }} />
    </Stack>
  );
}
