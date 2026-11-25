import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import type { PluginEntry } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export default function PluginsScreen() {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [items, setItems] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!client) return;
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const res = await client.listPlugins();
      setItems(res.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取宿主插件清单');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading && items.length === 0) return <LoadingView label="正在读取插件列表…" />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={24} color={colors.accentBlue} label="返回" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>宿主插件</Text>
        <IconButton name="refresh-outline" size={21} color={colors.textSecondary} label="刷新" onPress={() => void load(true)} />
      </View>

      {!!error && <ErrorBanner message={error} onRetry={() => void load(true)} />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.entryId}
        contentContainerStyle={[styles.list, items.length === 0 && styles.empty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={() => (
          <EmptyState
            icon="extension-puzzle-outline"
            title="没有可显示的插件"
            message="这台电脑尚未安装额外插件，或当前宿主版本未开放插件清单。"
          />
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <AppIcon name="extension-puzzle-outline" size={20} color={item.enabled ? colors.accentBlue : colors.muted} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1}>{item.moduleName}</Text>
              <Text style={styles.sub} numberOfLines={1}>{item.entryId}{item.fiberPhase ? ` · ${item.fiberPhase}` : ''}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: item.enabled ? colors.successMuted : colors.surfaceRaised }]}>
              <Text style={[styles.badgeText, { color: item.enabled ? colors.success : colors.muted }]}>
                {item.enabled ? '已启用' : '已停用'}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  list: { padding: 14, paddingBottom: 34, gap: 9 },
  empty: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 11.5, marginTop: 3 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill },
  badgeText: { fontSize: 11.5, fontWeight: '600' },
});
