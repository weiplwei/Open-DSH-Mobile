import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/state/theme';
import { hitSlop, type ThemePalette } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function AppIcon({ name, size = 20, color }: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.textSecondary} />;
}

export function IconButton({ name, onPress, size = 20, color, label, disabled = false }: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  label?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || name}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <AppIcon name={name} size={size} color={color ?? colors.textSecondary} />
    </Pressable>
  );
}

export function BrandMark({ size = 34 }: { size?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.brand, { width: size, height: size, borderRadius: size * 0.31 }]}>
      <View style={[styles.brandLine, { width: size * 0.46, height: 2 }]} />
      <View style={[styles.brandLine, { width: size * 0.30, height: 2 }]} />
      <View style={[styles.brandDot, { width: size * 0.11, height: size * 0.11, borderRadius: size }]} />
    </View>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  button: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.cardPressed, opacity: 0.8 },
  disabled: { opacity: 0.35 },
  brand: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', gap: 4 },
  brandLine: { backgroundColor: colors.accentText, borderRadius: 2 },
  brandDot: { position: 'absolute', right: '22%', bottom: '24%', backgroundColor: colors.accentText },
});
