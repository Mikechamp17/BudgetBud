
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import AuthLayout from '@/app/(auth)/_layout';
import TabsLayout from '@/app/(tabs)/_layout';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import SettingsScreen from '@/app/(tabs)/settings';
import { useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/auth', () => ({ useSession: jest.fn() }));
jest.mock('@/components/app-tabs', () => {
  const { Stack: MockStack } = jest.requireActual('expo-router');
  return { __esModule: true, default: () => <MockStack screenOptions={{ headerShown: false }} /> };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

const mockUseSession = useSession as jest.Mock;
const auth = supabase.auth as unknown as Record<string, jest.Mock>;
const fakeSession = { user: { email: 'owner@example.com' } };

function Dashboard() {
  return <Text>Dashboard</Text>;
}

async function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      '(auth)/_layout': AuthLayout,
      '(tabs)/_layout': TabsLayout,
      '(auth)/sign-in': SignInScreen,
      '(auth)/sign-up': SignUpScreen,
      '(tabs)/index': Dashboard,
      '(tabs)/settings': SettingsScreen,
    },
    { initialUrl },
  );
}

beforeEach(() => jest.clearAllMocks());

it('sends a signed-out user opening the dashboard to sign-in', async () => {
  mockUseSession.mockReturnValue({ session: null, isLoading: false });
  await renderApp('/');
  expect(await screen.findByPlaceholderText('Password')).toBeTruthy();
  expect(screen.queryByText('Dashboard')).toBeNull();
});

it('sends a signed-in user opening sign-in to the dashboard', async () => {
  mockUseSession.mockReturnValue({ session: fakeSession, isLoading: false });
  await renderApp('/sign-in');
  expect(await screen.findByText('Dashboard')).toBeTruthy();
});

it('shows an error and stays signed out after a wrong password', async () => {
  mockUseSession.mockReturnValue({ session: null, isLoading: false });
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
  await renderApp('/sign-in');
  await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'owner@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
  await fireEvent.press(screen.getAllByRole('button')[0]);
  expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  expect(screen.queryByText('Dashboard')).toBeNull();
});

it('shows an error when signing up with an already-registered email', async () => {
  mockUseSession.mockReturnValue({ session: null, isLoading: false });
  auth.signUp.mockResolvedValue({ data: { user: { identities: [] } }, error: null });
  await renderApp('/sign-up');
  await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'owner@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
  await fireEvent.press(screen.getByRole('button'));
  expect(await screen.findByText(/already exists/)).toBeTruthy();
  expect(screen.queryByText('Check your email')).toBeNull();
});

it('shows the check-your-email state after a new sign-up', async () => {
  mockUseSession.mockReturnValue({ session: null, isLoading: false });
  auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
  await renderApp('/sign-up');
  await fireEvent.changeText(await screen.findByPlaceholderText('Email'), 'new@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
  await fireEvent.press(screen.getByRole('button'));
  expect(await screen.findByText('Check your email')).toBeTruthy();
});

it('signs out from settings', async () => {
  mockUseSession.mockReturnValue({ session: fakeSession, isLoading: false });
  await renderApp('/settings');
  await fireEvent.press(await screen.findByText('Sign out'));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
});

it('signs in to the demo account from the sign-in screen', async () => {
  mockUseSession.mockReturnValue({ session: null, isLoading: false });
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  await renderApp('/sign-in');
  await fireEvent.press(await screen.findByText('Try the demo'));
  await waitFor(() =>
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'demo@budgetbud.app', password: 'try-budgetbud-demo' }),
  );
});
