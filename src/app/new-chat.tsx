import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, BrandMark, IconButton } from '@/components/AppIcon';
import { ErrorBanner } from '@/components/Feedback';
import { OptionSheet, type OptionItem } from '@/components/Form';
import { DocumentButton, DocumentChips } from '@/components/DocumentAttachments';
import { ModelPickerSheet } from '@/components/ModelPickerSheet';
import { useHost } from '@/state/host';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/state/theme';
import type { AgentPreset, MessageContentPart, ModelCatalog, ModelSelection, WorkspaceItem } from '@/lib/types';
import { documentPrompt, type UploadedDocument } from '@/lib/attachments';
import { triggerHaptic } from '@/lib/alerts';
import { radii, shadow, type ThemePalette } from '@/theme';

type Picker = 'workspace' | 'agent' | 'model' | null;
type DraftImage = { id: string; uri: string; data: string; mediaType: string; name?: string };

export default function NewChatScreen() {
  const params = useLocalSearchParams<{ workspaceId?: string }>();
  const { client, host } = useHost();
  const { prefs } = usePrefs();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [workspaceId, setWorkspaceId] = useState(params.workspaceId ? String(params.workspaceId) : '');
  const [agentPreset, setAgentPreset] = useState('');
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [text, setText] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const [workspaceResponse, presetResponse, modelResponse] = await Promise.all([
        client.listWorkspaces(), client.listAgentPresets(), client.getModels(''),
      ]);
      setWorkspaces(workspaceResponse.items || []);
      setPresets(presetResponse.presets || []);
      setCatalog(modelResponse);
      const defaultWorkspace = workspaceResponse.items.find((item) => item.pinned) || workspaceResponse.items[0];
      if (defaultWorkspace) setWorkspaceId((current) => current || defaultWorkspace.workspaceId);
      const defaultPreset = presetResponse.presets.find((preset) => preset.isDefault) || presetResponse.presets[0];
      if (defaultPreset) setAgentPreset((current) => current || defaultPreset.id);
      const model = modelResponse.defaultModel || modelResponse.current;
      if (model) setSelection((current) => current || model);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取新建会话选项'); }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const models = useMemo(
    () => (catalog?.groups || []).flatMap((group) => group.models.map((model) => ({ ...model, provider: group.id, providerName: group.name }))),
    [catalog],
  );
  const selectedModel = models.find((model) => model.provider === selection?.provider && model.id === selection.model);
  const effortLabel = selectedModel?.reasoning?.efforts.find((effort) => effort.id === selection?.reasoningEffort)?.name || selection?.reasoningEffort;
  const workspace = workspaces.find((item) => item.workspaceId === workspaceId);
  const preset = presets.find((item) => item.id === agentPreset);

  const chooseModel = (provider: string, modelId: string) => {
    const model = models.find((item) => item.provider === provider && item.id === modelId);
    if (!model) return;
    setSelection({
      provider: model.provider,
      model: model.id,
      ...(model.reasoning?.defaultEffort ? { reasoningEffort: model.reasoning.defaultEffort } : {}),
    });
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('需要照片权限', '请允许访问照片后再添加图片。'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 4 - images.length),
      base64: true,
      quality: prefs.imageQuality === 'original' ? 1 : 0.8,
    });
    if (result.canceled) return;
    const accepted = result.assets.filter((asset) => asset.base64 && (!asset.fileSize || asset.fileSize <= 8 * 1024 * 1024));
    if (accepted.length !== result.assets.length) Alert.alert('部分图片未添加', '单张图片不能超过 8 MB。');
    setImages((current) => [
      ...current,
      ...accepted.map((asset, index) => ({
        id: `${Date.now()}-${index}`,
        uri: asset.uri,
        data: asset.base64!,
        mediaType: asset.mimeType || 'image/jpeg',
        name: asset.fileName || undefined,
      })),
    ].slice(0, 4));
  };

  const start = async () => {
    if (!client || sending || (!text.trim() && images.length === 0 && documents.length === 0)) return;
    triggerHaptic('light', prefs.hapticFeedback);
    setSending(true); setError('');
    const prompt = documentPrompt(text, documents);
    try {
      const created = await client.createSession(Crypto.randomUUID(), {
        ...(workspaceId ? { workspaceId } : {}),
        ...(agentPreset ? { agentPreset } : {}),
      });
      if (selection) await client.selectModel(created.sessionId, selection);
      const content: MessageContentPart[] = [
        ...(prompt ? [{ type: 'text', text: prompt }] : []),
        ...images.map((image) => ({ type: 'image', mediaType: image.mediaType, data: image.data, ...(image.name ? { name: image.name } : {}) })),
      ];
      await client.sendMessage(created.sessionId, prompt, Crypto.randomUUID(), { content });
      router.replace({ pathname: '/chat/[sessionId]', params: { sessionId: created.sessionId, title: prompt.slice(0, 50) || '附件会话' } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建会话失败');
      setSending(false);
    }
  };

  const sheetProps = picker === 'workspace' ? {
    title: '选择工作区',
    options: workspaces.map((item): OptionItem => ({
      id: item.workspaceId,
      title: item.title || item.path?.split(/[\\/]/).pop() || item.workspaceId,
      subtitle: `${item.path || ''}${item.git?.branch ? ` · ${item.git.branch}` : ''}`,
    })),
    selectedId: workspaceId,
    onSelect: setWorkspaceId,
  } : {
    title: '选择 Agent 模式',
    options: presets.map((item) => ({ id: item.id, title: item.name || item.id, subtitle: item.description || item.trust })),
    selectedId: agentPreset,
    onSelect: setAgentPreset,
  };

  const hasPayload = Boolean(text.trim() || images.length > 0 || documents.length > 0);
  const workspaceLabel = workspace?.title || workspace?.path?.split(/[\\/]/).pop() || '默认工作区';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <IconButton name="close" onPress={() => router.back()} />
          <Text style={styles.headerTitle}>新聊天</Text>
          <View style={styles.headerSpacer}>{loading && <ActivityIndicator size="small" color={colors.muted} />}</View>
        </View>

        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            <BrandMark size={48} />
            <Text style={styles.heroTitle}>Open DSH</Text>
            <View style={styles.beta}><Text style={styles.betaText}>LAN</Text></View>
          </View>
          <Text style={styles.heroSubtitle}>从一个想法开始，构建任何内容。</Text>
        </View>

        <View style={styles.bottom}>
          {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
          <DocumentChips documents={documents} onRemove={(id) => setDocuments((current) => current.filter((document) => document.id !== id))} />
          {!!images.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachments}>
              {images.map((image) => (
                <View key={image.id} style={styles.attachment}>
                  <Image source={{ uri: image.uri }} style={styles.attachmentImage} />
                  <Pressable style={styles.removeImage} onPress={() => setImages((current) => current.filter((item) => item.id !== image.id))}>
                    <AppIcon name="close" size={13} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar}>
            <View style={styles.chip}>
              <View style={styles.onlineDot} />
              <Text style={styles.chipText} numberOfLines={1}>{host?.name || '电脑'}</Text>
            </View>
            <Pressable style={styles.chip} onPress={() => setPicker('workspace')} disabled={!workspaces.length}>
              <AppIcon name="folder-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.chipText} numberOfLines={1}>{workspaceLabel}</Text>
              <AppIcon name="chevron-down" size={13} color={colors.muted} />
            </Pressable>
            <Pressable style={styles.chip} onPress={() => setPicker('agent')} disabled={!presets.length}>
              <AppIcon name="sparkles-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.chipText} numberOfLines={1}>{preset?.name || agentPreset || '标准模式'}</Text>
              <AppIcon name="chevron-down" size={13} color={colors.muted} />
            </Pressable>
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              multiline
              value={text}
              onChangeText={setText}
              style={styles.input}
              placeholder="描述你想要构建的内容，/ 调用指令，@ 文件或对话"
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
              editable={!sending}
              blurOnSubmit={prefs.enterToSend}
              returnKeyType={prefs.enterToSend ? 'send' : 'default'}
              onSubmitEditing={() => { if (prefs.enterToSend) void start(); }}
            />
            <View style={styles.composerActions}>
              <IconButton name="image-outline" size={22} onPress={() => void pickImages()} label="添加图片" />
              {client && <DocumentButton client={client} documents={documents} onChange={setDocuments} disabled={sending} />}
              <View style={styles.composerSpacer} />
              <Pressable
                style={styles.inlineModelButton}
                onPress={() => setPicker('model')}
                disabled={!models.length}
              >
                <Text style={styles.inlineModelText} numberOfLines={1}>
                  {selectedModel?.name || selection?.model || '默认模型'}
                </Text>
                {!!effortLabel && (
                  <Text style={styles.inlineEffortText} numberOfLines={1}>{effortLabel}</Text>
                )}
                <AppIcon name="chevron-down" size={14} color={colors.muted} />
              </Pressable>
              <Pressable
                disabled={sending || !hasPayload}
                onPress={() => void start()}
                style={({ pressed }) => [
                  styles.send,
                  hasPayload ? styles.sendActive : styles.sendDisabled,
                  pressed && styles.sendPressed,
                ]}
              >
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppIcon name="arrow-up" size={20} color="#FFFFFF" />}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={picker === 'workspace' || picker === 'agent'}
        {...sheetProps}
        onClose={() => setPicker(null)}
      />

      <ModelPickerSheet
        visible={picker === 'model'}
        groups={catalog?.groups || []}
        selection={selection}
        selectedModel={selectedModel}
        onSelectModel={chooseModel}
        onSelectEffort={(reasoningEffort) => setSelection((current) => current ? { ...current, reasoningEffort } : current)}
        onClose={() => setPicker(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  headerSpacer: { width: 38, alignItems: 'center' },
  heroWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  heroTitle: { color: colors.text, fontSize: 31, fontWeight: '700', letterSpacing: -0.8 },
  beta: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  betaText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  heroSubtitle: { textAlign: 'center', color: colors.muted, fontSize: 14, marginTop: 10 },
  bottom: { paddingHorizontal: 14, paddingBottom: 10 },
  attachments: { gap: 9, paddingBottom: 10 },
  attachment: { width: 68, height: 68 },
  attachmentImage: { width: 68, height: 68, borderRadius: 10, backgroundColor: colors.card },
  removeImage: { position: 'absolute', right: -5, top: -5, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  chipBar: { gap: 8, paddingBottom: 10, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  chipText: { color: colors.text, fontSize: 12.5, fontWeight: '500', maxWidth: 130 },
  composer: {
    backgroundColor: colors.composerBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.composerBorder,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 9,
    ...shadow,
  },
  input: { minHeight: 74, maxHeight: 150, color: colors.text, fontSize: 15, lineHeight: 22, padding: 2 },
  composerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  composerSpacer: { flex: 1 },
  inlineModelButton: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%', paddingHorizontal: 4, paddingVertical: 4 },
  inlineModelText: { color: colors.text, fontSize: 13.5, fontWeight: '500', flexShrink: 1 },
  inlineEffortText: { color: colors.accentBlue, fontSize: 13, fontWeight: '600' },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendActive: { backgroundColor: colors.accentBlue },
  sendPressed: { opacity: 0.78 },
  sendDisabled: { backgroundColor: colors.borderStrong },
});
