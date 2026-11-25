import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import type { StepDetail, TurnStepItem } from '@/lib/types';
import { monoFont, radii, type ThemePalette } from '@/theme';

type StepDetailEntry = {
  loading?: boolean;
  error?: string;
  detail?: StepDetail;
};

function stepKey(step: TurnStepItem, index: number): string {
  return step.callId || `${step.kind}-${step.seq ?? 'x'}-${step.index ?? index}`;
}

function stepIcon(step: TurnStepItem): IconName {
  if (step.kind === 'think') return 'bulb-outline';
  const name = step.name || '';
  if (/bash|pwsh|terminal|run_code/.test(name)) return 'terminal-outline';
  if (/read|write|edit|str_replace/.test(name)) return 'document-text-outline';
  if (/grep|glob|search|web_search/.test(name)) return 'search-outline';
  if (/web_fetch/.test(name)) return 'globe-outline';
  return 'construct-outline';
}

function stateIndicator(state: string | undefined, colors: ThemePalette) {
  if (state === 'running' || state === 'pending') {
    return <ActivityIndicator size="small" color={colors.accentBlue} />;
  }
  if (state === 'error' || state === 'failed') {
    return <AppIcon name="close-circle" size={14} color={colors.danger} />;
  }
  if (state === 'stopped') {
    return <AppIcon name="pause-circle-outline" size={14} color={colors.warning} />;
  }
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />;
}

export const TurnProcessCard = memo(function TurnProcessCard({
  steps,
  sessionId,
  parentSessionId,
  subagentMode,
  running = false,
  defaultExpanded = false,
}: {
  steps: TurnStepItem[];
  sessionId: string;
  parentSessionId?: string;
  subagentMode?: 'one-shot' | 'continuable';
  running?: boolean;
  defaultExpanded?: boolean;
}) {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openStepKey, setOpenStepKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, StepDetailEntry>>({});

  const latest = steps[steps.length - 1];
  const headline = (latest?.summary || latest?.name || '').trim() || (running ? '正在分析请求' : '执行过程');
  const countLabel = `${Math.max(steps.length, running ? 1 : 0)} 步`;

  const toggleStep = async (step: TurnStepItem, index: number) => {
    const key = stepKey(step, index);
    if (openStepKey === key) {
      setOpenStepKey(null);
      return;
    }
    setOpenStepKey(key);
    const existing = details[key];
    if (!client || existing?.detail || existing?.loading) return;
    if (step.kind === 'tool' && !step.callId) return;
    if (step.kind === 'think' && (step.index === undefined || step.seq === undefined) && !running) return;

    setDetails((prev) => ({ ...prev, [key]: { loading: true } }));
    try {
      const response = await client.getStepDetail({
        sessionId,
        kind: step.kind,
        ...(step.callId ? { callId: step.callId } : {}),
        ...(typeof step.index === 'number' ? { index: step.index } : {}),
        ...(typeof step.seq === 'number' ? { seq: step.seq } : {}),
        ...(typeof step.resultSeq === 'number' ? { resultSeq: step.resultSeq } : {}),
        ...(parentSessionId && subagentMode ? { parentSessionId, mode: subagentMode } : {}),
      });
      setDetails((prev) => ({ ...prev, [key]: { detail: response.step } }));
    } catch (cause) {
      setDetails((prev) => ({
        ...prev,
        [key]: { error: cause instanceof Error ? cause.message : '无法加载步骤详情' },
      }));
    }
  };

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.headerRow}
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
      >
        <AppIcon
          name="aperture-outline"
          size={16}
          color={running ? colors.accentBlue : colors.textSecondary}
        />
        <Text style={styles.headline} numberOfLines={1}>{headline}</Text>
        <Text style={styles.count}>{countLabel}</Text>
        <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
      </Pressable>

      {expanded && (
        <View style={styles.card}>
          {steps.length === 0 ? (
            <View style={styles.emptyRow}>
              <ActivityIndicator size="small" color={colors.accentBlue} />
              <Text style={styles.emptyText}>正在等待模型响应…</Text>
            </View>
          ) : (
            steps.map((step, index) => {
              const key = stepKey(step, index);
              const isOpen = openStepKey === key;
              const entry = details[key];
              const label = step.summary || step.name || (step.kind === 'think' ? '思考过程' : '工具调用');
              return (
                <View key={key} style={[styles.stepWrap, index > 0 && styles.stepDivider]}>
                  <Pressable
                    style={({ pressed }) => [styles.stepRow, pressed && styles.stepPressed]}
                    onPress={() => void toggleStep(step, index)}
                  >
                    <AppIcon name={stepIcon(step)} size={15} color={colors.textSecondary} />
                    <View style={styles.stepCopy}>
                      <Text style={styles.stepText} numberOfLines={isOpen ? undefined : 1}>
                        {step.kind === 'tool' && step.name && step.summary && step.summary !== step.name
                          ? `${step.name} · ${step.summary}`
                          : label}
                      </Text>
                    </View>
                    {stateIndicator(step.state, colors)}
                    <AppIcon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
                  </Pressable>
                  {isOpen && (
                    <View style={styles.detailBox}>
                      {entry?.loading && (
                        <View style={styles.detailStatus}>
                          <ActivityIndicator size="small" color={colors.muted} />
                          <Text style={styles.detailHint}>正在读取详情…</Text>
                        </View>
                      )}
                      {!!entry?.error && (
                        <Pressable
                          onPress={() => {
                            setDetails((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                            void toggleStep(step, index);
                          }}
                        >
                          <Text style={styles.detailError}>{entry.error} · 点此重试</Text>
                        </Pressable>
                      )}
                      {entry?.detail && (
                        <ScrollView nestedScrollEnabled style={styles.detailScroll}>
                          {entry.detail.kind === 'think' ? (
                            <Text selectable style={styles.detailText}>
                              {entry.detail.text || '（无详细思考内容）'}
                            </Text>
                          ) : (
                            <View style={styles.detailSections}>
                              {!!entry.detail.argsRaw && (
                                <View>
                                  <Text style={styles.detailLabel}>参数</Text>
                                  <Text selectable style={styles.detailCode}>{entry.detail.argsRaw}</Text>
                                </View>
                              )}
                              {!!entry.detail.output && (
                                <View>
                                  <Text style={styles.detailLabel}>结果</Text>
                                  <Text selectable style={styles.detailCode}>{entry.detail.output}</Text>
                                </View>
                              )}
                              {!entry.detail.argsRaw && !entry.detail.output && (
                                <Text style={styles.detailHint}>暂无详细参数或输出</Text>
                              )}
                            </View>
                          )}
                        </ScrollView>
                      )}
                      {!entry && (
                        <Text style={styles.detailHint}>暂无详情</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  root: { marginTop: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  headline: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  count: { color: colors.muted, fontSize: 13 },
  card: {
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  emptyText: { color: colors.muted, fontSize: 13 },
  stepWrap: {},
  stepDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  stepPressed: { backgroundColor: colors.surfaceRaised },
  stepCopy: { flex: 1, minWidth: 0 },
  stepText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  detailBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.codeBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailHint: { color: colors.muted, fontSize: 12 },
  detailError: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  detailScroll: { maxHeight: 260 },
  detailSections: { gap: 10 },
  detailLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  detailText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 19 },
  detailCode: { color: colors.codeText, fontFamily: monoFont, fontSize: 11.5, lineHeight: 18 },
});
