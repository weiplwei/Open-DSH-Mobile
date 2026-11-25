import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '@/components/AppIcon';
import { ErrorBanner, LoadingView } from '@/components/Feedback';
import { formatCompactTokens, formatElapsedDuration } from '@/lib/chat-format';
import type { StatsOverviewBucket, StatsRange } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

const RANGE_TABS: { id: StatsRange; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'yesterday', label: '昨天' },
  { id: '3d', label: '近 3 天' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: 'all', label: '全部' },
];

const HEATMAP_WEEK_LABELS: Record<number, string> = { 0: '一', 2: '三', 4: '五' };

function shortDayLabel(isoDay: string): string {
  const parts = isoDay.split('-');
  if (parts.length !== 3) return isoDay;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export default function StatsScreen() {
  const { client } = useHost();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [range, setRange] = useState<StatsRange>('today');
  const [cache, setCache] = useState<Partial<Record<StatsRange, StatsOverviewBucket>>>({});
  const cacheRef = useRef<Partial<Record<StatsRange, StatsOverviewBucket>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (targetRange: StatsRange, fresh = false) => {
    if (!client) return;
    if (!fresh && cacheRef.current[targetRange]) {
      setLoading(false);
      return;
    }
    if (fresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await client.getStatsOverview(targetRange, fresh);
      const nextCache: Partial<Record<StatsRange, StatsOverviewBucket>> = {
        ...cacheRef.current,
        ...(res.ranges || {}),
        [targetRange]: res.overview,
      };
      cacheRef.current = nextCache;
      setCache(nextCache);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取统计数据');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(range, false); }, 0);
    return () => clearTimeout(initial);
  }, [load, range]);

  const bucket = cache[range];
  const kpi = bucket?.kpi;
  const billedTokens = kpi
    ? kpi.uncachedInputTokens + kpi.cacheReadTokens + kpi.cacheWriteTokens + kpi.outputTokens
    : 0;
  const inputTotal = kpi ? kpi.uncachedInputTokens + kpi.cacheReadTokens + kpi.cacheWriteTokens : 0;
  const cacheHitPct = kpi && inputTotal > 0 ? Math.round((kpi.cacheReadTokens / inputTotal) * 100) : 0;

  const comp = bucket?.composition;
  const compTotal = comp ? comp.systemTokens + comp.toolsTokens + comp.messageTokens : 0;

  const chartDays = useMemo(() => {
    const days = bucket?.days || [];
    return days.length > 14 ? days.slice(days.length - 14) : days;
  }, [bucket?.days]);

  const maxDayTokens = useMemo(() => {
    let max = 0;
    for (const d of chartDays) {
      const total = d.uncachedInputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens;
      if (total > max) max = total;
    }
    return max;
  }, [chartDays]);

  const heatmapGrid = useMemo(() => {
    const raw = (bucket?.heatmap || []).slice(-63);
    const maxTokens = raw.reduce((m, cell) => Math.max(m, cell.tokens), 0);
    const cols: { day: string; tokens: number; tier: number }[][] = [];
    for (let c = 0; c < 9; c += 1) {
      const slice = raw.slice(c * 7, c * 7 + 7);
      if (slice.length === 0) continue;
      cols.push(
        slice.map((cell) => {
          let tier = 0;
          if (cell.tokens > 0 && maxTokens > 0) {
            const ratio = cell.tokens / maxTokens;
            tier = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
          }
          return { ...cell, tier };
        }),
      );
    }
    return cols;
  }, [bucket?.heatmap]);

  const heatColor = (tier: number): string => {
    if (tier === 0) return colors.surfaceRaised;
    if (tier === 1) return isDark ? '#25315A' : '#DCE3FE';
    if (tier === 2) return isDark ? '#324482' : '#B4C4FD';
    if (tier === 3) return isDark ? '#435BB5' : '#859DFB';
    return colors.accentBlue;
  };

  if (loading && !bucket) return <LoadingView label="正在统计用量…" />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={24} color={colors.accentBlue} label="返回" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>统计</Text>
        <IconButton name="refresh-outline" size={21} color={colors.textSecondary} label="刷新" onPress={() => void load(range, true)} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(range, true)} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {RANGE_TABS.map((tab) => {
            const active = range === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabPill, active && styles.tabPillActive]}
                onPress={() => setRange(tab.id)}
              >
                <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!!error && <ErrorBanner message={error} onRetry={() => void load(range, true)} />}

        {kpi && (
          <View style={styles.card}>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>会话</Text>
                <Text style={styles.kpiValue}>{kpi.sessions}</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>计费 token</Text>
                <Text style={styles.kpiValue}>{formatCompactTokens(billedTokens)}</Text>
                <Text style={styles.kpiSub}>缓存读 {formatCompactTokens(kpi.cacheReadTokens)}</Text>
              </View>
            </View>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>轮次</Text>
                <Text style={styles.kpiValue}>{kpi.turns}</Text>
                <Text style={styles.kpiSub}>{kpi.steps} 步</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>缓存命中</Text>
                <Text style={styles.kpiValue}>{cacheHitPct}%</Text>
                <Text style={styles.kpiSub}>输入里复用缓存</Text>
              </View>
            </View>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>耗时合计</Text>
                <Text style={styles.kpiValue}>{formatElapsedDuration(kpi.activeMs)}</Text>
              </View>
              <View style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>有记录</Text>
                <Text style={styles.kpiValue}>{kpi.days} 天</Text>
                <Text style={styles.kpiSub}>有量的日子</Text>
              </View>
            </View>
          </View>
        )}

        {comp && compTotal > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>上下文构成</Text>
            <View style={styles.compBody}>
              <View style={styles.ringOuter}>
                <View style={styles.ringInner}>
                  <Text style={styles.ringLabel}>合计</Text>
                  <Text style={styles.ringValue}>{formatCompactTokens(compTotal)}</Text>
                </View>
              </View>
              <View style={styles.compBars}>
                {[
                  { label: '系统提示词', value: comp.systemTokens, color: colors.muted },
                  { label: '工具', value: comp.toolsTokens, color: colors.purple },
                  { label: '对话消息', value: comp.messageTokens, color: colors.accentBlue },
                ].map((item) => {
                  const pct = compTotal > 0 ? Math.round((item.value / compTotal) * 100) : 0;
                  return (
                    <View key={item.label} style={styles.compItem}>
                      <View style={styles.compItemTop}>
                        <View style={styles.compLabelRow}>
                          <View style={[styles.dot, { backgroundColor: item.color }]} />
                          <Text style={styles.compLabel}>{item.label}</Text>
                        </View>
                        <Text style={styles.compPct}>{pct}%</Text>
                        <Text style={styles.compTok}>{formatCompactTokens(item.value)}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.max(pct, item.value > 0 ? 3 : 0)}%`, backgroundColor: item.color }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {chartDays.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>每日用量</Text>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.accentBlue }]} /><Text style={styles.legendText}>输入</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.muted }]} /><Text style={styles.legendText}>缓存读</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.purple }]} /><Text style={styles.legendText}>输出</Text></View>
              </View>
            </View>

            <View style={styles.chartWrap}>
              <View style={styles.yAxis}>
                <Text style={styles.axisLabel}>{formatCompactTokens(maxDayTokens)}</Text>
                <Text style={styles.axisLabel}>{formatCompactTokens(Math.round(maxDayTokens / 2))}</Text>
                <Text style={styles.axisLabel}>0</Text>
              </View>
              <View style={styles.barsArea}>
                {chartDays.map((day) => {
                  const inputPart = day.uncachedInputTokens + day.cacheWriteTokens;
                  const cachePart = day.cacheReadTokens;
                  const outPart = day.outputTokens;
                  const total = inputPart + cachePart + outPart;
                  const heightPct = maxDayTokens > 0 ? Math.max(total > 0 ? 6 : 0, Math.round((total / maxDayTokens) * 100)) : 0;
                  const outPct = total > 0 ? (outPart / total) * 100 : 0;
                  const cachePct = total > 0 ? (cachePart / total) * 100 : 0;
                  const inPct = Math.max(0, 100 - outPct - cachePct);
                  return (
                    <View key={day.day} style={styles.barCol}>
                      <View style={styles.barSlot}>
                        <View style={[styles.barStack, { height: `${heightPct}%` }]}>
                          <View style={{ flex: outPct, backgroundColor: colors.purple }} />
                          <View style={{ flex: cachePct, backgroundColor: colors.muted }} />
                          <View style={{ flex: inPct, backgroundColor: colors.accentBlue }} />
                        </View>
                      </View>
                      <Text style={styles.xAxisLabel} numberOfLines={1}>{shortDayLabel(day.day)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {heatmapGrid.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>最近 9 周</Text>
            <View style={styles.heatmapBody}>
              <View style={styles.heatmapDays}>
                {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                  <Text key={row} style={styles.heatmapDayLabel}>{HEATMAP_WEEK_LABELS[row] || ''}</Text>
                ))}
              </View>
              <View style={styles.heatmapCols}>
                {heatmapGrid.map((col, colIdx) => (
                  <View key={colIdx} style={styles.heatmapCol}>
                    {col.map((cell) => (
                      <View key={cell.day} style={[styles.heatCell, { backgroundColor: heatColor(cell.tier) }]} />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {!!bucket?.models?.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>模型分布</Text>
            {bucket.models.slice(0, 6).map((item, idx) => (
              <View key={`${item.provider}-${item.model}`} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle} numberOfLines={1}>{item.modelName || item.model}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{item.providerName || item.provider} · {item.turns} 轮</Text>
                </View>
                <Text style={styles.listValue}>{formatCompactTokens(item.billedTokens)} tok</Text>
              </View>
            ))}
          </View>
        )}

        {!!bucket?.sessions?.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>活跃会话</Text>
            {bucket.sessions.slice(0, 6).map((item, idx) => (
              <Pressable
                key={item.sessionId}
                style={[styles.listRow, idx > 0 && styles.listRowBorder]}
                disabled={item.gone}
                onPress={() => router.push({ pathname: '/chat/[sessionId]', params: { sessionId: item.sessionId, title: item.title || '会话' } })}
              >
                <View style={styles.listCopy}>
                  <Text style={styles.listTitle} numberOfLines={1}>{item.title || '未命名会话'}</Text>
                  <Text style={styles.listSub} numberOfLines={1}>{item.workspaceName || item.cwd || ''} · {item.turns} 轮</Text>
                </View>
                <Text style={styles.listValue}>{formatCompactTokens(item.billedTokens)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 14, paddingBottom: 32, gap: 14 },
  tabsRow: { gap: 8, paddingVertical: 4 },
  tabPill: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillActive: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  tabPillText: { color: colors.textSecondary, fontSize: 13.5, fontWeight: '500' },
  tabPillTextActive: { color: '#FFFFFF', fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiRow: { flexDirection: 'row', gap: 12 },
  kpiCell: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  kpiLabel: { color: colors.muted, fontSize: 12 },
  kpiValue: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  kpiSub: { color: colors.muted, fontSize: 11 },
  compBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringOuter: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 11,
    borderColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: { alignItems: 'center' },
  ringLabel: { color: colors.muted, fontSize: 11 },
  ringValue: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 1 },
  compBars: { flex: 1, gap: 12 },
  compItem: { gap: 5 },
  compItemTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  compLabel: { color: colors.text, fontSize: 13 },
  compPct: { color: colors.text, fontSize: 13, fontWeight: '600', width: 34, textAlign: 'right' },
  compTok: { color: colors.muted, fontSize: 11.5, width: 42, textAlign: 'right' },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { color: colors.muted, fontSize: 11.5 },
  chartWrap: { flexDirection: 'row', height: 150, gap: 8 },
  yAxis: { justifyContent: 'space-between', paddingBottom: 18, alignItems: 'flex-end', width: 42 },
  axisLabel: { color: colors.muted, fontSize: 10.5 },
  barsArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 18 },
  barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barSlot: { flex: 1, width: '72%', maxWidth: 22, justifyContent: 'flex-end' },
  barStack: { width: '100%', borderRadius: 4, overflow: 'hidden' },
  xAxisLabel: { position: 'absolute', bottom: -16, color: colors.muted, fontSize: 10 },
  heatmapBody: { flexDirection: 'row', gap: 6 },
  heatmapDays: { justifyContent: 'space-between', paddingVertical: 2 },
  heatmapDayLabel: { color: colors.muted, fontSize: 11, height: 22, lineHeight: 22 },
  heatmapCols: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  heatmapCol: { flex: 1, gap: 4 },
  heatCell: { aspectRatio: 1, borderRadius: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listCopy: { flex: 1, minWidth: 0 },
  listTitle: { color: colors.text, fontSize: 14, fontWeight: '500' },
  listSub: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  listValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
