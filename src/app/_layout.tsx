import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useSession } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

/** Keeps the splash screen up until the stored session has loaded, so no screen flashes first. */
function SessionGate() {
  const { isLoading } = useSession();
  if (isLoading) {
    return null;
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <AnimatedSplashOverlay />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SessionGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
