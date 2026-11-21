import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** Below this width the tabs sit in a bar along the bottom, like a phone app. */
const COMPACT_WIDTH = 700;

export default function AppTabs() {
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH;

  const list = (
    <TabList asChild>
      <CustomTabList compact={compact}>
        <TabTrigger name="home" href="/" asChild>
          <TabButton>Home</TabButton>
        </TabTrigger>
        <TabTrigger name="purchases" href="/purchases" asChild>
          <TabButton>Purchases</TabButton>
        </TabTrigger>
        <TabTrigger name="import" href="/import" asChild>
          <TabButton>Import</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton>Settings</TabButton>
        </TabTrigger>
      </CustomTabList>
    </TabList>
  );

  // The bar takes its own space instead of floating over the page, so content is never hidden under it.
  return (
    <Tabs style={styles.root}>
      {compact ? null : list}
      <TabSlot style={styles.slot} />
      {compact ? list : null}
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <ThemedView type={isFocused ? 'backgroundSelected' : 'backgroundElement'} style={styles.tabButtonView}>
        <ThemedText type="small" numberOfLines={1} themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList({ compact, ...props }: TabListProps & { compact: boolean }) {
  return (
    <ThemedView type="backgroundElement" {...props} style={[styles.bar, compact ? styles.barBottom : styles.barTop]}>
      <View style={[styles.inner, compact && styles.innerCompact]}>
        {compact ? null : (
          <ThemedText type="smallBold" style={styles.brandText}>
            BudgetBud
          </ThemedText>
        )}
        {props.children}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slot: { flex: 1 },
  bar: { width: '100%', alignItems: 'center' },
  barTop: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  barBottom: { paddingTop: Spacing.one, paddingBottom: Spacing.two, paddingHorizontal: Spacing.one },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  innerCompact: { gap: Spacing.one, justifyContent: 'space-between' },
  brandText: { marginRight: 'auto' },
  button: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  tabButtonView: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
