import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import type { SubagentEntry } from '@/lib/types';
import { radii, type ThemePalette } from '@/theme';

export default function SubagentsScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const parentSessionId = String(sessionId || '');
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<SubagentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!client || !parentSessionId) return;
    if (refresh) setRefreshing(true);
    try {
      const response = await client.listSubagents(parentSessionId);
      setEntries(response.entries || []);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取子代理'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [client, parentSessionId]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => { if (entries.some((entry) => entry.activity === 'running')) void load(); }, 5000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [entries, load]);

  const open = (entry: SubagentEntry) => {
    if (entry.kind !== 'child' || entry.targetAvailable === false || !entry.parentSessionId) return;
    router.push({
      pathname: '/chat/[sessionId]',
      params: {
        sessionId: entry.id,
        parentSessionId: entry.parentSessionId,
        mode: entry.mode === 'one-shot' ? 'one-shot' : 'continuable',
        title: entry.name || entry.label || '子代理',
      },
    });
  };

  if (loading && !entries.length) return <LoadingView label="正在读取子代理…" />;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}><IconButton name="chevron-back" size={25} onPress={() => router.back()} /><Text style={styles.headerTitle}>子代理</Text><IconButton name="refresh" onPress={() => void load(true)} /></View>
      {!!error && <ErrorBanner message={error} onRetry={() => void load(true)} />}
      <FlatList
        data={entries}
        keyExtractor={(entry, index) => `${entry.kind}-${entry.id}-${index}`}
        contentContainerStyle={[styles.list, !entries.length && styles.empty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={() => <EmptyState icon="people-outline" title="没有子代理" message="这个会话还没有分派可继续对话的子代理。" />}
        renderItem={({ item }) => {
          const diagnostic = item.kind !== 'child';
          const running = item.activity === 'running';
          return (
            <Pressable disabled={diagnostic || item.targetAvailable === false} onPress={() => open(item)} style={({ pressed }) => [styles.card, pressed && styles.pressed, { marginLeft: 16 + Math.min(item.depth || 0, 4) * 16 }]}>
              <View style={[styles.icon, running && styles.iconRunning]}><AppIcon name={diagnostic ? 'warning-outline' : running ? 'pulse' : 'person-outline'} size={19} color={running ? colors.success : colors.textSecondary} /></View>
              <View style={styles.copy}>
                <View style={styles.titleRow}><Text style={styles.title} numberOfLines={1}>{item.name || item.label || item.id}</Text>{running && <View style={styles.runningBadge}><Text style={styles.runningText}>运行中</Text></View>}</View>
                <Text style={styles.subtitle} numberOfLines={2}>{diagnostic ? `无法读取：${item.reason || 'unknown'}` : item.description || (item.mode === 'one-shot' ? '一次性子代理' : item.mode === 'continuable' ? '可继续对话' : '子代理会话')}</Text>
                <Text style={styles.path} numberOfLines={1}>{item.path || item.id}</Text>
              </View>
              {!diagnostic && item.targetAvailable !== false && <AppIcon name="chevron-forward" size={18} color={colors.muted} />}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 30 },
  empty: { flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, marginBottom: 9, marginRight: 0, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  icon: { width: 39, height: 39, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  iconRunning: { backgroundColor: colors.successMuted },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  path: { color: colors.muted, fontSize: 10, marginTop: 5 },
  runningBadge: { backgroundColor: colors.successMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill },
  runningText: { color: colors.success, fontSize: 9, fontWeight: '600' },
});
