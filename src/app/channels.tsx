import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import type { ChannelItem } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

const PROTOCOLS = [
  { id: 'openai-completions', label: 'OpenAI Chat' },
  { id: 'openai-responses', label: 'OpenAI Resp' },
  { id: 'anthropic-messages', label: 'Anthropic' },
  { id: 'google-generative-ai', label: 'Gemini' },
] as const;

export default function ChannelsScreen() {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<string>('openai-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsText, setModelsText] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!client) return;
    if (refresh) setRefreshing(true);
    setError('');
    try {
      const res = await client.listChannels();
      setChannels(res.channels || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取模型渠道');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const openNew = () => {
    setEditingId('');
    setName('');
    setProtocol('openai-completions');
    setBaseUrl('');
    setApiKey('');
    setModelsText('');
    setEditorOpen(true);
  };

  const openEdit = (ch: ChannelItem) => {
    setEditingId(ch.id);
    setName(ch.name);
    setProtocol(ch.protocol || 'openai-completions');
    setBaseUrl(ch.baseUrl || '');
    setApiKey('');
    setModelsText((ch.models || []).map((m) => m.id).join('\n'));
    setEditorOpen(true);
  };

  const save = async () => {
    if (!client || busy) return;
    const modelIds = modelsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || !baseUrl.trim() || modelIds.length === 0) {
      Alert.alert('信息不完整', '请填写渠道名称、Base URL 和至少一个模型 ID。');
      return;
    }
    if (!editingId && !apiKey.trim()) {
      Alert.alert('缺少 API Key', '新建自建渠道需要填写 API Key。');
      return;
    }
    setBusy(true);
    try {
      await client.saveChannel({
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        protocol,
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        models: modelIds.map((id) => ({ id })),
      });
      setEditorOpen(false);
      await load(true);
    } catch (cause) {
      Alert.alert('保存失败', cause instanceof Error ? cause.message : '请检查输入后重试');
    } finally {
      setBusy(false);
    }
  };

  const remove = (ch: ChannelItem) => {
    if (!client) return;
    Alert.alert('删除自建渠道', `确认删除渠道「${ch.name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await client.deleteChannel(ch.id);
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

  const externalChannels = useMemo(() => channels.filter((c) => c.source === 'external'), [channels]);
  const customChannels = useMemo(() => channels.filter((c) => c.source === 'custom'), [channels]);

  if (loading && channels.length === 0) return <LoadingView label="正在读取模型渠道…" />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={24} color={colors.accentBlue} label="返回" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>模型与渠道</Text>
        <View style={styles.addBtn}><IconButton name="add" color={colors.primaryText} label="新增渠道" onPress={openNew} /></View>
      </View>

      {!!error && <ErrorBanner message={error} onRetry={() => void load(true)} />}
      {busy && <ActivityIndicator color={colors.accentBlue} style={{ marginVertical: 4 }} />}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.textSecondary} />}
      >
        {channels.length === 0 ? (
          <EmptyState
            icon="hardware-chip-outline"
            title="暂无模型渠道"
            message="可以添加一个自定义 API 渠道，或在电脑端启用插件渠道。"
            action={<Button title="添加自建渠道" onPress={openNew} />}
          />
        ) : (
          <>
            {customChannels.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>自建渠道 ({customChannels.length})</Text>
                {customChannels.map((ch) => (
                  <View key={ch.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardTitle}>{ch.name}</Text>
                        <Text style={styles.cardSub} numberOfLines={1}>{ch.protocol} · {ch.baseUrl}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: ch.keySet ? colors.successMuted : colors.surfaceRaised }]}>
                        <Text style={[styles.badgeText, { color: ch.keySet ? colors.success : colors.muted }]}>
                          {ch.keySet ? 'Key 已配置' : 'Key 状态未知'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modelsWrap}>
                      {ch.models.map((m) => (
                        <View key={m.id} style={styles.modelChip}>
                          <Text style={styles.modelChipText}>{m.name || m.id}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.cardActions}>
                      <Button title="编辑" variant="secondary" icon="create-outline" onPress={() => openEdit(ch)} style={styles.actionBtn} />
                      <IconButton name="trash-outline" color={colors.danger} onPress={() => remove(ch)} />
                    </View>
                  </View>
                ))}
              </>
            )}

            {externalChannels.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>插件提供方 ({externalChannels.length})</Text>
                {externalChannels.map((ch) => (
                  <View key={ch.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardTitle}>{ch.name}</Text>
                        <Text style={styles.cardSub}>{ch.id}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: ch.active ? colors.successMuted : colors.surfaceRaised }]}>
                        <Text style={[styles.badgeText, { color: ch.active ? colors.success : colors.muted }]}>
                          {ch.active ? '已就绪' : '未启用'}
                        </Text>
                      </View>
                    </View>
                    {ch.models.length > 0 && (
                      <View style={styles.modelsWrap}>
                        {ch.models.slice(0, 8).map((m) => (
                          <View key={m.id} style={styles.modelChip}>
                            <Text style={styles.modelChipText}>{m.name || m.id}</Text>
                          </View>
                        ))}
                        {ch.models.length > 8 && (
                          <Text style={styles.moreModels}>+{ch.models.length - 8} 个</Text>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          <View style={styles.header}>
            <IconButton name="close" onPress={() => setEditorOpen(false)} />
            <Text style={styles.headerTitle}>{editingId ? '编辑自建渠道' : '新建自建渠道'}</Text>
            <View style={{ width: 38 }} />
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>渠道名称</Text>
            <TextInput value={name} onChangeText={setName} placeholder="例如：中转 OpenAI" placeholderTextColor={colors.muted} style={styles.input} />

            <Text style={styles.fieldLabel}>协议类型</Text>
            <View style={styles.protoRow}>
              {PROTOCOLS.map((p) => {
                const active = protocol === p.id;
                return (
                  <Pressable key={p.id} style={[styles.protoChip, active && styles.protoChipActive]} onPress={() => setProtocol(p.id)}>
                    <Text style={[styles.protoText, active && styles.protoTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Base URL</Text>
            <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.example.com/v1" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} />

            <Text style={styles.fieldLabel}>{editingId ? 'API Key（留空则保持不变）' : 'API Key'}</Text>
            <TextInput value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} />

            <Text style={styles.fieldLabel}>模型 ID（逗号或换行分隔）</Text>
            <TextInput value={modelsText} onChangeText={setModelsText} placeholder={'gpt-4o\ndeepseek-chat'} placeholderTextColor={colors.muted} multiline autoCapitalize="none" style={[styles.input, styles.modelsInput]} />

            <Button title={busy ? '保存中…' : '保存渠道'} onPress={() => void save()} disabled={busy} style={{ marginTop: 14 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  addBtn: { backgroundColor: colors.primary, borderRadius: 11, overflow: 'hidden' },
  content: { padding: 14, paddingBottom: 34, gap: 10 },
  sectionTitle: { color: colors.muted, fontSize: 12.5, fontWeight: '600', marginTop: 8, marginBottom: 4, marginLeft: 4 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.text, fontSize: 15.5, fontWeight: '600' },
  cardSub: { color: colors.muted, fontSize: 11.5, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  badgeText: { fontSize: 11, fontWeight: '600' },
  modelsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  modelChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised },
  modelChipText: { color: colors.textSecondary, fontSize: 11.5 },
  moreModels: { color: colors.muted, fontSize: 11.5 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  actionBtn: { flex: 1 },
  form: { padding: 16, paddingBottom: 40, gap: 10 },
  fieldLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  input: { backgroundColor: colors.input, color: colors.text, borderRadius: radii.md, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 },
  modelsInput: { minHeight: 100, textAlignVertical: 'top' },
  protoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  protoChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  protoChipActive: { backgroundColor: colors.accentBlueMuted, borderColor: colors.accentBlue },
  protoText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '500' },
  protoTextActive: { color: colors.accentBlue, fontWeight: '600' },
});
