import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { formatSessionStats } from '@/lib/chat-format';
import type { SessionProjections } from '@/lib/types';
import { useTheme } from '@/state/theme';
import type { ThemePalette } from '@/theme';

export const SessionStatsBar = memo(function SessionStatsBar({
  projections,
}: {
  projections?: SessionProjections | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stats = useMemo(() => formatSessionStats(projections), [projections]);

  if (!stats.hasAny) return null;

  const contextColor =
    stats.contextTone === 'danger'
      ? colors.danger
      : stats.contextTone === 'warning'
        ? colors.warning
        : colors.muted;

  return (
    <View style={styles.row}>
      <View style={styles.group}>
        {!!stats.leftText && (
          <>
            <AppIcon name="speedometer-outline" size={12.5} color={colors.muted} />
            <Text style={styles.text} numberOfLines={1}>{stats.leftText}</Text>
          </>
        )}
      </View>
      <View style={styles.group}>
        {!!stats.middleText && (
          <>
            <AppIcon name="server-outline" size={12.5} color={colors.muted} />
            <Text style={styles.text} numberOfLines={1}>{stats.middleText}</Text>
          </>
        )}
      </View>
      {stats.contextPercent !== null && (
        <View style={styles.rightGroup}>
          <AppIcon name="pie-chart-outline" size={12.5} color={contextColor} />
          <Text style={[styles.text, { color: contextColor }]} numberOfLines={1}>{stats.contextPercent}%</Text>
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 7,
    paddingBottom: 2,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  text: { color: colors.muted, fontSize: 11, lineHeight: 15 },
});
