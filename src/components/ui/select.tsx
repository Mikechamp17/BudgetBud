// A dropdown that works on iOS, Android, and the web: shows the current choice and opens a list to pick from.
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent } from '@/components/ui/kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SelectOption = { value: string; label: string };

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
}: {
  label: string;
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={[styles.control, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText numberOfLines={1} style={styles.flex} themeColor={current ? 'text' : 'textSecondary'}>
          {current?.label ?? placeholder}
        </ThemedText>
        <ThemedText themeColor="textSecondary">▾</ThemedText>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <ThemedView style={styles.sheet}>
            <ThemedText type="smallBold" style={styles.sheetTitle}>
              {label}
            </ThemedText>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.value === value }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: item.value === value ? theme.backgroundSelected : 'transparent' },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <ThemedText style={item.value === value ? { color: Accent } : undefined}>{item.label}</ThemedText>
                </Pressable>
              )}
            />
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth / 1.5,
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
  sheetTitle: { marginBottom: Spacing.two },
  option: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.two, borderRadius: 8 },
});
