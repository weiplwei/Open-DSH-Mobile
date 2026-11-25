import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import type { AgentPreset, AgentPresetDetail } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { monoFont, radii, type ThemePalette } from '@/theme';

export default function PresetsScreen() {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<AgentPreset | null>(null);
  const [detail, setDetail] = useState<AgentPresetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyId, setCopyId] = useState('');
  const [copyName, setCopyName] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!client) return;
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const res = await client.listAgentPresets();
      setPresets(res.presets || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取 Agent 预设');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const openPreset = async (preset: AgentPreset) => {
    if (!client) return;
    setSelected(preset);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await client.readAgentPreset(preset.id));
    } catch (cause) {
      Alert.alert('无法读取预设详情', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setDetailLoading(false);
    }
  };

  const makeDefault = async (id: string) => {
    if (!client || busy) return;
    setBusy(true);
    try {
      await client.setDefaultAgentPreset(id);
      await load(true);
      Alert.alert('已设为默认', `新对话将默认使用「${id}」。`);
    } catch (cause) {
      Alert.alert('设置失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const submitCopy = async () => {
    if (!client || !selected || !copyId.trim() || busy) return;
    setBusy(true);
    try {
      await client.copyAgentPreset(selected.id, copyId.trim(), copyName.trim() || undefined);
      setCopyOpen(false);
      setSelected(null);
      await load(true);
    } catch (cause) {
      Alert.alert('复制失败', cause instanceof Error ? cause.message : '请检查标识格式后重试');
    } finally {
      setBusy(false);
    }
  };

  const removePreset = (preset: AgentPreset) => {
    if (!client) return;
    Alert.alert('删除预设', `确认删除自定义预设「${preset.name || preset.id}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await client.removeAgentPreset(preset.id);
              setSelected(null);
              await load(true);
            } catch (cause) {
              Alert.alert('删除失败', cause instanceof Error ? cause.message : '请稍后重试');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  if (loading && presets.length === 0) return <LoadingView label="正在读取 Agent 预设…" />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={24} color={colors.accentBlue} label="返回" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Agent 预设</Text>
        <IconButton name="refresh-outline" size={21} color={colors.textSecondary} label="刷新" onPress={() => void load(true)} />
      </View>

      {!!error && <ErrorBanner message={error} onRetry={() => void load(true)} />}

      <FlatList
        data={presets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, presets.length === 0 && styles.empty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={() => (
          <EmptyState icon="sparkles-outline" title="没有 Agent 预设" message="这台电脑尚未配置可选的 Agent 预设。" />
        )}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => void openPreset(item)}>
            <View style={styles.cardTop}>
              <Text style={styles.title} numberOfLines={1}>{item.name || item.id}</Text>
              {item.isDefault && (
                <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>默认</Text></View>
              )}
              <View style={styles.trustBadge}>
                <Text style={styles.trustBadgeText}>{item.trust === 'user' ? '自定义' : '系统'}</Text>
              </View>
            </View>
            <Text style={styles.sub} numberOfLines={2}>{item.description || item.id}</Text>
          </Pressable>
        )}
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          <View style={styles.header}>
            <IconButton name="close" onPress={() => setSelected(null)} />
            <Text style={styles.headerTitle} numberOfLines={1}>{selected?.name || selected?.id}</Text>
            <View style={{ width: 38 }} />
          </View>
          {detailLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.accentBlue} /></View>
          ) : (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <Text style={styles.detailId}>标识：{selected?.id} · {detail?.trust === 'user' ? '自定义' : '系统自带'}</Text>
              {!!detail?.description && <Text style={styles.detailDesc}>{detail.description}</Text>}
              <View style={styles.codeBox}>
                <Text selectable style={styles.codeText}>{detail?.content || '（无正文内容）'}</Text>
              </View>
              <View style={styles.detailActions}>
                {!selected?.isDefault && selected && (
                  <Button title="设为默认" icon="checkmark-circle-outline" disabled={busy} onPress={() => void makeDefault(selected.id)} />
                )}
                {selected && (
                  <Button
                    title="复制为新预设"
                    variant="secondary"
                    icon="copy-outline"
                    disabled={busy}
                    onPress={() => {
                      setCopyId(`${selected.id}-copy`);
                      setCopyName(`${selected.name || selected.id} 副本`);
                      setCopyOpen(true);
                    }}
                  />
                )}
                {detail?.trust === 'user' && selected && (
                  <Button title="删除预设" variant="danger" icon="trash-outline" disabled={busy} onPress={() => removePreset(selected)} />
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={copyOpen} transparent animationType="fade" onRequestClose={() => setCopyOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>复制为新预设</Text>
            <TextInput value={copyId} onChangeText={setCopyId} placeholder="新预设标识（英文/数字/连字符）" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.dialogInput} />
            <TextInput value={copyName} onChangeText={setCopyName} placeholder="显示名称（可选）" placeholderTextColor={colors.muted} style={styles.dialogInput} />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setCopyOpen(false)} style={styles.dialogBtn} />
              <Button title="创建" disabled={!copyId.trim() || busy} onPress={() => void submitCopy()} style={styles.dialogBtn} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  list: { padding: 14, paddingBottom: 34, gap: 9 },
  empty: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  pressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.accentBlueMuted },
  defaultBadgeText: { color: colors.accentBlue, fontSize: 11, fontWeight: '600' },
  trustBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
  trustBadgeText: { color: colors.muted, fontSize: 11 },
  detailScroll: { padding: 16, paddingBottom: 40, gap: 12 },
  detailId: { color: colors.muted, fontSize: 12 },
  detailDesc: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
  codeBox: { backgroundColor: colors.codeBg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 13 },
  codeText: { color: colors.codeText, fontFamily: monoFont, fontSize: 12.5, lineHeight: 19 },
  detailActions: { gap: 10, marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: 18, gap: 10 },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  dialogInput: { backgroundColor: colors.input, color: colors.text, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong, fontSize: 15, padding: 12 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  dialogBtn: { minWidth: 84 },
});
