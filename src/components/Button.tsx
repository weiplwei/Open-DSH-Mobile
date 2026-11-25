import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { useTheme } from '@/state/theme';
import type { ThemePalette } from '@/theme';

export function Button({ title, onPress, busy = false, disabled = false, secondary = false, destructive = false, icon, variant, style }: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSecondary = secondary || variant === 'secondary';
  const isDestructive = destructive || variant === 'danger';
  const isGhost = variant === 'ghost';
  const darkText = !isSecondary && !isDestructive && !isGhost;
  const foreground = darkText ? colors.accentText : isDestructive ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, isSecondary && styles.secondary, isGhost && styles.ghost, isDestructive && styles.destructive, (disabled || busy) && styles.disabled, pressed && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator color={foreground} /> : <>
        {icon && <AppIcon name={icon} size={18} color={foreground} />}
        <Text style={[styles.text, { color: foreground }]}>{title}</Text>
      </>}
    </Pressable>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  button: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: colors.accent, paddingHorizontal: 18 },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  destructive: { backgroundColor: colors.dangerMuted, borderWidth: 1, borderColor: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  text: { color: colors.accentText, fontSize: 15, fontWeight: '700' },
});
