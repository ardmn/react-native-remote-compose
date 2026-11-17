import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = {
  background: '#FFFBFE',
  surface: '#F3EDF7',
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  text: '#1D1B20',
  muted: '#49454F',
  error: '#B3261E',
  border: '#CAC4D0',
};

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  selected = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.buttonSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        style={[styles.buttonLabel, selected && styles.buttonLabelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <Text style={styles.mono}>{children}</Text>;
}

export const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  buttonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: { color: colors.text, fontSize: 14 },
  buttonLabelSelected: { color: colors.onPrimary },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: colors.muted },
  player: { width: '100%', height: 220, borderRadius: 12, overflow: 'hidden' },
  playerTall: { height: 320 },
  playerShort: { height: 60 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridCell: { width: '31%', height: 110 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.background,
  },
});
