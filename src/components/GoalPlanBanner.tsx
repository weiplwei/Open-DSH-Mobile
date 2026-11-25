import { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import type { SessionProjections } from '@/lib/types';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export const GoalPlanBanner = memo(function GoalPlanBanner({
  projections,
  busy = false,
  onGoalAction,
}: {
  projections?: SessionProjections | null;
  busy?: boolean;
  onGoalAction: (action: 'pause' | 'resume' | 'clear') => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const planActive = projections?.planMode?.active === true;
  const goal = projections?.goal;
  const objective = typeof goal?.objective === 'string' ? goal.objective.trim() : '';

  if (!planActive && !objective) return null;

  const isPaused = goal?.status === 'paused';
  const hasRef = Boolean(goal && (goal.ref || goal.id));

  return (
    <View style={styles.wrap}>
      {planActive && (
        <View style={styles.planPill}>
          <AppIcon name="document-text-outline" size={14} color={colors.accentBlue} />
          <Text style={styles.planText}>计划模式已启用</Text>
        </View>
      )}
      {!!objective && (
        <View style={styles.goalCard}>
          <AppIcon name="locate-outline" size={16} color={isPaused ? colors.warning : colors.accentBlue} />
          <View style={styles.goalCopy}>
            <Text style={styles.goalLabel}>{isPaused ? '长期目标（已暂停）' : '长期目标'}</Text>
            <Text style={styles.goalText} numberOfLines={2}>{objective}</Text>
          </View>
          {hasRef && (
            <View style={styles.goalActions}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.accentBlue} />
              ) : (
                <>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => onGoalAction(isPaused ? 'resume' : 'pause')}
                    hitSlop={6}
                  >
                    <AppIcon name={isPaused ? 'play-outline' : 'pause-outline'} size={16} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => onGoalAction('clear')}
                    hitSlop={6}
                  >
                    <AppIcon name="close-circle-outline" size={16} color={colors.muted} />
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  wrap: { gap: 6, marginBottom: 8 },
  planPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.accentBlueMuted,
  },
  planText: { color: colors.accentBlue, fontSize: 12, fontWeight: '600' },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  goalCopy: { flex: 1, minWidth: 0 },
  goalLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  goalText: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 1 },
  goalActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: { padding: 3 },
});
