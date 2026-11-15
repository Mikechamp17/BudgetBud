// Small shared building blocks for BudgetBud screens.
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const Accent = '#208AEF';
export const Danger = '#D93025';

/** A scrolling screen with a centered column that stays readable at laptop width. */
export function Screen({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          {title ? <ThemedText type="subtitle">{title}</ThemedText> : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function Button({
  label,
  onPress,
  busy,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? Accent : theme.backgroundElement, opacity: pressed || busy || disabled ? 0.6 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : theme.text} />
      ) : (
        <ThemedText style={{ color: primary ? '#fff' : theme.text, fontWeight: 600 }}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  return (
    <ThemedText accessibilityRole="alert" style={{ color: Danger }}>
      {children}
    </ThemedText>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? Accent : theme.backgroundElement }]}>
      <ThemedText type="small" style={{ color: selected ? '#fff' : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six * 2,
  },
  button: { borderRadius: 10, padding: Spacing.three, alignItems: 'center' },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
