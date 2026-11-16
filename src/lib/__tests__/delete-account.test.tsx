import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AccountScreen from '@/app/(tabs)/settings/account';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: { signOut: jest.fn() } },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const invoke = supabase.functions.invoke as jest.Mock;
const signOut = supabase.auth.signOut as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('only deletes after DELETE is typed, then signs out', async () => {
  invoke.mockResolvedValue({ data: { deleted: true }, error: null });
  await render(<AccountScreen />);
  await fireEvent.press(screen.getByText('Delete my account'));
  expect(invoke).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByDisplayValue(''), 'DELETE');
  await fireEvent.press(screen.getByText('Delete my account'));
  await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  expect(invoke).toHaveBeenCalledWith('delete-account', { body: {} });
});

it('stays signed in and shows an error when deletion fails', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('boom') });
  await render(<AccountScreen />);
  await fireEvent.changeText(screen.getByDisplayValue(''), 'DELETE');
  await fireEvent.press(screen.getByText('Delete my account'));
  expect(await screen.findByText(/could not be deleted/)).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
});
