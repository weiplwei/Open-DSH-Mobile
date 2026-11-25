import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { useTheme } from '@/state/theme';
import type { ThemePalette } from '@/theme';

export function LoadingView({ label = '正在读取…' }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.center}><ActivityIndicator color={colors.textSecondary} /><Text style={styles.loadingText}>{label}</Text></View>;
}

export function EmptyState({ icon = 'chatbubbles-outline', title, description, message, actionTitle, onAction, action }: {
  icon?: IconName;
  title: string;
  description?: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><AppIcon name={icon} size={28} color={colors.muted} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description || message || ''}</Text>
      {action}
      {actionTitle && onAction && <Pressable onPress={onAction} style={styles.action}><Text style={styles.actionText}>{actionTitle}</Text></Pressable>}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!message) return null;
  return (
    <Pressable disabled={!onRetry} onPress={onRetry} style={styles.error}>
      <AppIcon name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.errorText}>{message}{onRetry ? '\n点这里重试' : ''}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  center: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  loadingText: { color: colors.muted, fontSize: 13 },
  empty: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9, maxWidth: 320 },
  action: { marginTop: 22, backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  actionText: { color: colors.accentText, fontWeight: '700' },
  error: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginHorizontal: 16, marginVertical: 8, padding: 12, borderRadius: 12, backgroundColor: colors.dangerMuted, borderWidth: 1, borderColor: colors.danger },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18 },
});
