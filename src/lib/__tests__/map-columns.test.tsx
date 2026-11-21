import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react-native';

import MapColumnsScreen from '@/app/(tabs)/import/map-columns';
import { pendingImport } from '@/lib/import-flow';

jest.mock('@/lib/imports', () => ({ saveMapping: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ accountId: 'a1' }),
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

it('guesses the columns of a statement with a summary first and reads the first transaction', async () => {
  const text = readFileSync(join(__dirname, '..', 'parsers', '__fixtures__', 'revolut-statement.csv'), 'utf8');
  pendingImport.set({ name: 'statement.csv', kind: 'csv', text });
  await render(<MapColumnsScreen />);
  expect(screen.getByLabelText(/^Date: Started Date/)).toBeTruthy();
  expect(screen.getByLabelText(/^Amount \(one column\): Amount/)).toBeTruthy();
  expect(screen.getByText(/2026-11-03 · Lidl/)).toBeTruthy();
});
