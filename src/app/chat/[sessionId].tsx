import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import { MessageBubble } from '@/components/MessageBubble';
import { Markdown } from '@/components/Markdown';
import { InteractionCards, type ApprovalRequest, type QuestionRequest } from '@/components/InteractionCards';
import { DocumentChips } from '@/components/DocumentAttachments';
import { TurnProcessCard } from '@/components/TurnProcessCard';
import { SessionStatsBar } from '@/components/SessionStatsBar';
import { ModelPickerSheet } from '@/components/ModelPickerSheet';
import { WorkspaceDrawer, WorkspaceTreeView } from '@/components/WorkspaceDrawer';
import { QueueDock } from '@/components/QueueDock';
import { GoalPlanBanner } from '@/components/GoalPlanBanner';
import { ComposerSuggestions } from '@/components/ComposerSuggestions';
import { useHost } from '@/state/host';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/state/theme';
import type {
  ChatMessage,
  FileReferenceItem,
  LiveStepEntry,
  MessageContentPart,
  ModelCatalog,
  ModelSelection,
  QueueItem,
  SessionItem,
  SessionProjections,
  SessionReferenceItem,
  SlashCommand,
} from '@/lib/types';
import { documentPrompt, type UploadedDocument } from '@/lib/attachments';
import { triggerForegroundAlert, triggerHaptic } from '@/lib/alerts';
import { applyComposerTrigger, detectComposerTrigger } from '@/lib/composer-mentions';
import {
  applyLiveStepsFrame,
  findActiveTurnStartedAt,
  mergeMessages,
  messageKey,
  visibleChatMessages,
  type LiveStepsState,
} from '@/lib/chat-state';
import { formatElapsedDuration } from '@/lib/chat-format';
import { streamSession } from '@/lib/stream';
import { radii, shadow, type ThemePalette } from '@/theme';

type DraftImage = { id: string; uri: string; data: string; mediaType: string; name?: string };
type Picker = 'model' | 'actions' | null;

const BUILTIN_COMMAND_NAMES = new Set(['goal', 'plan', 'export']);

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    sessionId: string;
    title?: string;
    parentSessionId?: string;
    mode?: 'one-shot' | 'continuable';
  }>();
  const sessionId = String(params.sessionId || '');
  const parentSessionId = params.parentSessionId ? String(params.parentSessionId) : undefined;
  const subagentMode: 'one-shot' | 'continuable' | undefined =
    params.mode === 'one-shot' ? 'one-shot' : params.mode === 'continuable' ? 'continuable' : undefined;
  const isSubagent = Boolean(parentSessionId && subagentMode);

  const { width } = useWindowDimensions();
  const splitLayout = width >= 820 && !isSubagent;

  const { client } = useHost();
  const { prefs, updatePrefs, rememberSession } = usePrefs();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<SessionItem | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [projections, setProjections] = useState<SessionProjections | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueBusyId, setQueueBusyId] = useState('');
  const [goalBusy, setGoalBusy] = useState(false);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [refFiles, setRefFiles] = useState<FileReferenceItem[]>([]);
  const [refSessions, setRefSessions] = useState<SessionReferenceItem[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [narration, setNarration] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveStepsState>({ turn: null, steps: [] });
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [input, setInput] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<'queue' | 'steer'>('queue');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestSeq, setOldestSeq] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState('');
  const [exportingLog, setExportingLog] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [question, setQuestion] = useState<QuestionRequest | null>(null);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'closed' | 'offline'>('connecting');

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const nearBottom = useRef(true);
  const requestGeneration = useRef(0);
  const streamCursor = useRef(0);

  const resolvedTitle = session?.title || params.title || '会话';
  const prefsRef = useRef(prefs);
  const titleRef = useRef(resolvedTitle);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { titleRef.current = resolvedTitle; }, [resolvedTitle]);

  useEffect(() => {
    if (!isSubagent && sessionId) {
      void rememberSession(sessionId, resolvedTitle);
    }
  }, [isSubagent, rememberSession, resolvedTitle, sessionId]);

  useEffect(() => {
    if (!client || !sessionId || isSubagent) return;
    void client.markSessionRead(sessionId).catch(() => undefined);
  }, [client, isSubagent, sessionId]);

  const load = useCallback(async (loadMode: 'replace' | 'incremental' = 'incremental', showRefreshSpinner = false) => {
    if (!client || !sessionId) return;
    const generation = ++requestGeneration.current;
    if (showRefreshSpinner) setRefreshing(true);
    try {
      const subagentQuery = isSubagent ? { parentSessionId, mode: subagentMode } : {};
      const useIncremental = loadMode === 'incremental' && streamCursor.current > 0;

      const [initialMessageResponse, sessionResponse, statsResponse] = await Promise.all([
        client.listMessages(sessionId, {
          ...subagentQuery,
          ...(useIncremental ? { afterSeq: streamCursor.current } : {}),
        }),
        isSubagent
          ? client.getSession(sessionId).then((response) => response.session).catch(() => null)
          : client.listSessions().then((response) => response.items.find((item) => item.sessionId === sessionId) || null).catch(() => null),
        !isSubagent
          ? client.getSessionStats(sessionId).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (generation !== requestGeneration.current) return;

      let messageResponse = initialMessageResponse;
      let mergeKind: 'replace' | 'append' = useIncremental ? 'append' : 'replace';
      if (useIncremental && messageResponse.resyncRequired) {
        messageResponse = await client.listMessages(sessionId, subagentQuery);
        if (generation !== requestGeneration.current) return;
        mergeKind = 'replace';
      }

      const incoming = messageResponse.items || [];
      let mergedSnapshot: ChatMessage[] = [];
      setMessages((current) => {
        mergedSnapshot = mergeMessages(current, incoming, mergeKind);
        return mergedSnapshot;
      });

      streamCursor.current = Math.max(
        streamCursor.current,
        messageResponse.lastSeq || 0,
        ...incoming.map((item) => item.seq || 0),
      );
      if (mergeKind === 'replace') {
        setHasMore(messageResponse.hasMore === true);
        setOldestSeq(messageResponse.oldestSeq ?? incoming[0]?.seq);
      }

      if (sessionResponse) {
        setSession(sessionResponse);
        if (sessionResponse.running) {
          const activeStart = findActiveTurnStartedAt(mergedSnapshot);
          setTurnStartedAt((prev) => activeStart ?? prev ?? Date.now());
        } else {
          setTurnStartedAt(null);
          setLiveSteps({ turn: null, steps: [] });
          setQueueItems([]);
        }
      }
      if (statsResponse?.projections) {
        setProjections(statsResponse.projections);
      }
      setError('');
    } catch (cause) {
      if (generation === requestGeneration.current) {
        setError(cause instanceof Error ? cause.message : '无法读取消息');
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [client, isSubagent, parentSessionId, sessionId, subagentMode]);

  useEffect(() => {
    const initial = setTimeout(() => { void load('replace', true); }, 0);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load('incremental', false);
    }, 15_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      requestGeneration.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!client || !sessionId || loading) return;
    const controller = new AbortController();
    let stopped = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer || stopped) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void load('incremental', false);
      }, 160);
    };
    const connect = async () => {
      try {
        await streamSession(client, {
          sessionId,
          ...(isSubagent ? { parentSessionId, mode: subagentMode } : {}),
          lastSeq: streamCursor.current,
          signal: controller.signal,
          onState: (state) => { if (state === 'live') attempts = 0; setStreamState(state); },
          onPayload: (payload, record) => {
            const seq = Number(record.id?.split(':').at(-1));
            if (Number.isFinite(seq)) streamCursor.current = Math.max(streamCursor.current, seq);

            if (payload.type === 'session/live-steps') {
              if (payload.sessionId && payload.sessionId !== sessionId) return;
              setLiveSteps((current) => applyLiveStepsFrame(current, payload as {
                full?: boolean;
                turn?: number | null;
                steps?: LiveStepEntry[];
              }));
              return;
            }
            if (payload.type === 'session/projection') {
              if (payload.sessionId && payload.sessionId !== sessionId) return;
              if (payload.values && typeof payload.values === 'object') {
                setProjections((current) => ({ ...(current || {}), ...(payload.values as SessionProjections) }));
              }
              return;
            }
            if (payload.type === 'session/queue') {
              if (payload.sessionId && payload.sessionId !== sessionId) return;
              if (Array.isArray(payload.items)) {
                setQueueItems(payload.items as QueueItem[]);
              }
              return;
            }

            const wrapped = payload.type === 'session/event' && payload.event && typeof payload.event === 'object'
              ? payload.event as Record<string, unknown>
              : payload;
            if (wrapped.sessionId && wrapped.sessionId !== sessionId) return;

            if (wrapped.type === 'approval/requested' && typeof wrapped.rpcId === 'string' && typeof wrapped.approvalId === 'string') {
              setApproval(wrapped as unknown as ApprovalRequest);
              if (prefsRef.current.notifyOnInteraction) {
                void triggerForegroundAlert({
                  title: '需要你的批准',
                  body: `${typeof wrapped.toolName === 'string' && wrapped.toolName ? wrapped.toolName : '工具'} 请求继续执行`,
                  kind: 'interaction',
                  sound: prefsRef.current.notifySound,
                  vibrate: prefsRef.current.hapticFeedback,
                });
              }
            } else if (wrapped.type === 'approval/resolved') {
              setApproval((current) => current?.approvalId === wrapped.approvalId ? null : current);
            } else if (wrapped.type === 'question/requested' && typeof wrapped.rpcId === 'string' && Array.isArray(wrapped.questions)) {
              setQuestion(wrapped as unknown as QuestionRequest);
              if (prefsRef.current.notifyOnInteraction) {
                void triggerForegroundAlert({
                  title: '助手需要你确认',
                  body: titleRef.current || '请回答问题以继续任务',
                  kind: 'interaction',
                  sound: prefsRef.current.notifySound,
                  vibrate: prefsRef.current.hapticFeedback,
                });
              }
            } else if (wrapped.type === 'question/resolved') {
              setQuestion((current) => current?.rpcId === wrapped.questionRpcId ? null : current);
            }

            const type = typeof wrapped.type === 'string' ? wrapped.type : '';
            if (type === 'assistant/chunk') {
              const data = wrapped.data && typeof wrapped.data === 'object' ? wrapped.data as Record<string, unknown> : {};
              const chunk = data.chunk && typeof data.chunk === 'object' ? data.chunk as Record<string, unknown> : {};
              if ((chunk.type === 'text-delta' || !chunk.type) && typeof chunk.text === 'string') {
                setDraft((current) => current + chunk.text);
              }
              return;
            }
            if (type === 'session/heartbeat') return;
            if (type === 'turn/start') {
              setDraft('');
              setLiveSteps({ turn: null, steps: [] });
              const startedAt = typeof wrapped.time === 'number' ? wrapped.time : Date.now();
              setTurnStartedAt(startedAt);
              setNowMs(Date.now());
              setSession((current) => current ? { ...current, running: true } : current);
            }
            if (type === 'assistant/message') {
              setDraft('');
            }
            if (type === 'turn/end') {
              setDraft('');
              setTurnStartedAt(null);
              setLiveSteps({ turn: null, steps: [] });
              setSession((current) => current ? { ...current, running: false } : current);
              if (!isSubagent && AppState.currentState === 'active') {
                void client.markSessionRead(sessionId).catch(() => undefined);
              }
              if (prefsRef.current.notifyOnComplete) {
                void triggerForegroundAlert({
                  title: titleRef.current || '对话已完成',
                  body: '任务已回复完成',
                  kind: 'complete',
                  sound: prefsRef.current.notifySound,
                  vibrate: prefsRef.current.hapticFeedback,
                });
              }
            }
            scheduleRefresh();
          },
        });
      } catch {
        if (!stopped) setStreamState('offline');
      }
      if (!stopped && !controller.signal.aborted) {
        attempts += 1;
        reconnectTimer = setTimeout(() => { void connect(); }, Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
      }
    };
    const initial = setTimeout(() => { void connect(); }, 0);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(initial);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [client, isSubagent, load, loading, parentSessionId, sessionId, subagentMode]);

  useEffect(() => {
    if (!client || !sessionId || isSubagent) return;
    client.getModels(sessionId).then((response) => {
      setCatalog(response);
      if (response.current) setSelection(response.current);
      else if (response.defaultModel) setSelection(response.defaultModel);
    }).catch(() => undefined);
    client.getCommands(sessionId)
      .then((res) => setCommands(res.items || []))
      .catch(() => setCommands([]));
  }, [client, isSubagent, sessionId]);

  useEffect(() => {
    if (picker !== 'actions' || !client || isSubagent) return;
    client.getNarration()
      .then((res) => setNarration(Boolean(res.enabled)))
      .catch(() => undefined);
  }, [client, isSubagent, picker]);

  const composerTrigger = useMemo(
    () => (isSubagent ? null : detectComposerTrigger(input)),
    [input, isSubagent],
  );

  useEffect(() => {
    if (!client || !sessionId || !composerTrigger || composerTrigger.kind !== 'mention') {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setRefLoading(true);
      Promise.all([
        client.listFileReferences(sessionId, composerTrigger.query).then((res) => res.items || []).catch(() => []),
        client.listSessionReferences(sessionId, composerTrigger.query).then((res) => res.items || []).catch(() => []),
      ])
        .then(([files, sessions]) => {
          if (cancelled) return;
          setRefFiles(files);
          setRefSessions(sessions);
        })
        .finally(() => { if (!cancelled) setRefLoading(false); });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, composerTrigger, sessionId]);

  const running = session?.running === true;

  useEffect(() => {
    if (!running) return;
    const initialTick = setTimeout(() => setNowMs(Date.now()), 0);
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(interval);
    };
  }, [running]);

  const models = useMemo(
    () => (catalog?.groups || []).flatMap((group) => group.models.map((model) => ({ ...model, provider: group.id, providerName: group.name }))),
    [catalog],
  );
  const selectedModel = models.find((model) => model.provider === selection?.provider && model.id === selection.model);
  const effortLabel = selectedModel?.reasoning?.efforts.find((effort) => effort.id === selection?.reasoningEffort)?.name || selection?.reasoningEffort;

  const visibleMessages = useMemo(() => visibleChatMessages(messages), [messages]);
  const turnsWithProcess = useMemo(() => {
    const set = new Set<number>();
    for (const item of messages) {
      if (typeof item.turn === 'number' && item.turnProcess?.steps?.length) {
        set.add(item.turn);
      }
    }
    return set;
  }, [messages]);
  const extraCommands = useMemo(
    () => commands.filter((cmd) => !BUILTIN_COMMAND_NAMES.has(cmd.name.toLowerCase())),
    [commands],
  );

  const loadEarlier = async () => {
    if (!client || loadingEarlier || !hasMore || !oldestSeq) return;
    setLoadingEarlier(true);
    try {
      const response = await client.listMessages(sessionId, {
        beforeSeq: oldestSeq,
        ...(isSubagent ? { parentSessionId, mode: subagentMode } : {}),
      });
      setMessages((current) => mergeMessages(current, response.items || [], 'prepend'));
      setHasMore(response.hasMore === true);
      setOldestSeq(response.oldestSeq ?? response.items?.[0]?.seq ?? oldestSeq);
    } catch (cause) {
      Alert.alert('无法加载更早的消息', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setLoadingEarlier(false);
    }
  };

  const appendImageAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const accepted = assets.filter((asset) => asset.base64 && (!asset.fileSize || asset.fileSize <= 8 * 1024 * 1024));
    if (accepted.length !== assets.length) Alert.alert('部分图片未添加', '单张图片不能超过 8 MB。');
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

  const takePhoto = async () => {
    setAttachSheetOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('需要相机权限', '请允许使用相机拍照。'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: prefs.imageQuality === 'original' ? 1 : 0.8,
    });
    if (!result.canceled) appendImageAssets(result.assets);
  };

  const pickImages = async () => {
    setAttachSheetOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('需要照片权限', '请允许访问照片后再添加图片。'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 4 - images.length),
      base64: true,
      quality: prefs.imageQuality === 'original' ? 1 : 0.8,
    });
    if (!result.canceled) appendImageAssets(result.assets);
  };

  const pickDocuments = async () => {
    setAttachSheetOpen(false);
    if (!client || uploadingDoc || documents.length >= 4) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const remaining = Math.max(0, 4 - documents.length);
      const assets = result.assets.slice(0, remaining);
      let nextDocuments = documents;
      for (const asset of assets) {
        if (asset.size && asset.size > 20 * 1024 * 1024) {
          Alert.alert('文件过大', `${asset.name} 超过 20 MB，请选择较小的文件。`);
          continue;
        }
        setUploadingDoc(`读取 ${asset.name}`);
        const encoded = await new File(asset.uri).base64();
        const uploaded = await client.uploadBase64(asset.name, encoded, {
          sessionId,
          onProgress: (received, total) => setUploadingDoc(`上传 ${asset.name} ${Math.round(received / Math.max(total, 1) * 100)}%`),
        });
        nextDocuments = [...nextDocuments, { id: uploaded.uploadId, name: uploaded.name, path: uploaded.path, size: uploaded.bytes }];
        setDocuments(nextDocuments);
      }
    } catch (cause) {
      Alert.alert('附件上传失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setUploadingDoc('');
    }
  };

  const exportLog = async () => {
    setAttachSheetOpen(false);
    if (!client || exportingLog) return;
    setExportingLog(true);
    try {
      const result = await client.downloadSessionLog(sessionId);
      const target = new File(Paths.cache, `open-dsh-session-${sessionId.slice(0, 8)}-${Date.now()}.zip`);
      target.write(result.data);
      await Sharing.shareAsync(target.uri, { mimeType: 'application/zip' });
    } catch (cause) {
      Alert.alert('导出日志失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setExportingLog(false);
    }
  };

  const insertSlashCommand = (cmdName: string) => {
    setAttachSheetOpen(false);
    const prefix = cmdName.startsWith('/') ? cmdName : `/${cmdName}`;
    setInput((current) => (current.trim() ? `${prefix} ${current}` : `${prefix} `));
  };

  const toggleNarration = async (enabled: boolean) => {
    if (!client || narrationBusy) return;
    setNarration(enabled);
    setNarrationBusy(true);
    try {
      const res = await client.setNarration(enabled);
      setNarration(Boolean(res.enabled));
    } catch (cause) {
      setNarration(!enabled);
      Alert.alert('过程播报切换失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setNarrationBusy(false);
    }
  };

  const handleQueueAction = async (
    itemId: string,
    action: { kind: 'remove' } | { kind: 'steer' } | { kind: 'edit'; content: { type: 'text'; text: string }[] },
  ) => {
    if (!client || queueBusyId) return;
    setQueueBusyId(itemId);
    try {
      await client.updateQueue(sessionId, itemId, action);
      if (action.kind === 'remove' || action.kind === 'steer') {
        setQueueItems((cur) => cur.filter((item) => item.id !== itemId));
      } else {
        setQueueItems((cur) => cur.map((item) => (
          item.id === itemId ? { ...item, message: { ...item.message, content: action.content } } : item
        )));
      }
      await load('incremental', false);
    } catch (cause) {
      Alert.alert('队列操作失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setQueueBusyId('');
    }
  };

  const handleGoalAction = async (action: 'pause' | 'resume' | 'clear') => {
    const goal = projections?.goal;
    const ref = goal?.ref || (goal?.id ? { id: goal.id, revision: goal.revision } : null);
    if (!client || !ref || goalBusy) return;
    setGoalBusy(true);
    try {
      await client.updateGoal(sessionId, action, ref);
      const stats = await client.getSessionStats(sessionId).catch(() => null);
      if (stats?.projections) setProjections(stats.projections);
    } catch (cause) {
      Alert.alert('目标操作失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setGoalBusy(false);
    }
  };

  const send = async () => {
    if (!client || sending || (!input.trim() && images.length === 0 && documents.length === 0)) return;
    triggerHaptic('light', prefs.hapticFeedback);
    setSending(true);
    setError('');
    const text = documentPrompt(input, documents);
    const content: MessageContentPart[] = [
      ...(text ? [{ type: 'text', text }] : []),
      ...images.map((image) => ({ type: 'image', mediaType: image.mediaType, data: image.data, ...(image.name ? { name: image.name } : {}) })),
    ];
    try {
      if (isSubagent && parentSessionId) {
        await client.promptSubagent(parentSessionId, sessionId, text, Crypto.randomUUID());
      } else {
        await client.sendMessage(sessionId, text, Crypto.randomUUID(), { content, ...(running ? { mode: deliveryMode } : {}) });
      }
      setInput('');
      setImages([]);
      setDocuments([]);
      nearBottom.current = true;
      setShowScrollFab(false);
      await load('incremental', false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    if (!client) return;
    triggerHaptic('light', prefs.hapticFeedback);
    try {
      if (isSubagent && parentSessionId) await client.interruptSubagent(parentSessionId, sessionId);
      else await client.stopSession(sessionId);
      await load('incremental', false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '停止失败');
    }
  };

  const answerApproval = async (outcome: 'allowed-once' | 'rejected') => {
    if (!client || !approval || interactionBusy) return;
    triggerHaptic('light', prefs.hapticFeedback);
    setInteractionBusy(true);
    setError('');
    try {
      await client.respondApproval({ sessionId, rpcId: approval.rpcId, approvalId: approval.approvalId, outcome });
      setApproval(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审批提交失败');
    } finally {
      setInteractionBusy(false);
    }
  };

  const answerQuestion = async (answers: { id: string; selected: string[]; custom?: string }[]) => {
    if (!client || !question || interactionBusy) return;
    triggerHaptic('light', prefs.hapticFeedback);
    setInteractionBusy(true);
    setError('');
    try {
      await client.respondQuestion({ sessionId, rpcId: question.rpcId, answers });
      setQuestion(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回答提交失败');
    } finally {
      setInteractionBusy(false);
    }
  };

  const chooseModel = async (provider: string, modelId: string) => {
    const model = models.find((item) => item.provider === provider && item.id === modelId);
    if (!model || !client) return;
    const next = {
      provider: model.provider,
      model: model.id,
      ...(model.reasoning?.defaultEffort ? { reasoningEffort: model.reasoning.defaultEffort } : {}),
    };
    setSelection(next);
    try {
      await client.selectModel(sessionId, next);
    } catch (cause) {
      Alert.alert('模型切换失败', cause instanceof Error ? cause.message : '请稍后重试');
    }
  };

  const chooseEffort = async (reasoningEffort: string) => {
    if (!selection || !client) return;
    const next = { ...selection, reasoningEffort };
    setSelection(next);
    try {
      await client.selectModel(sessionId, next);
    } catch (cause) {
      Alert.alert('思考等级切换失败', cause instanceof Error ? cause.message : '请稍后重试');
    }
  };

  if (loading && messages.length === 0) return <LoadingView label="正在打开会话…" />;

  const hasPayload = Boolean(input.trim() || images.length > 0 || documents.length > 0);
  const elapsedText = formatElapsedDuration(Math.max(0, nowMs - (turnStartedAt ?? nowMs)));
  const liveStepItems = liveSteps.steps.map((entry) => entry.step);
  const showFooterProcess = running && (liveStepItems.length > 0 || !draft);

  const chatColumn = (
    <View style={styles.chatColumn}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          {splitLayout ? (
            <View style={styles.headerSpacer} />
          ) : (
            <IconButton
              name={isSubagent ? 'chevron-back' : 'menu-outline'}
              size={isSubagent ? 24 : 23}
              color={colors.text}
              label={isSubagent ? '返回' : '打开工作区侧栏'}
              onPress={() => {
                if (isSubagent) router.back();
                else setDrawerOpen(true);
              }}
            />
          )}
          <Pressable style={styles.headerCopy} onPress={() => setPicker('model')} disabled={isSubagent}>
            <Text style={styles.headerTitle} numberOfLines={1}>{resolvedTitle}</Text>
          </Pressable>
          <IconButton
            name="ellipsis-horizontal"
            size={22}
            color={colors.accentBlue}
            label="更多操作"
            onPress={() => {
              setAttachSheetOpen(false);
              setRenameTitle(resolvedTitle);
              setPicker((current) => current === 'actions' ? null : 'actions');
            }}
          />
        </View>

        {(streamState === 'offline' || streamState === 'closed') && (
          <View style={styles.reconnectStrip}>
            <View style={styles.reconnectDot} />
            <Text style={styles.reconnectText}>实时连接已断开，正在重连…</Text>
          </View>
        )}

        {!!error && <ErrorBanner message={error} onRetry={() => void load('replace', true)} />}

        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={messageKey}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                sessionId={sessionId}
                parentSessionId={parentSessionId}
                subagentMode={subagentMode}
                hasTurnProcess={typeof item.turn === 'number' && turnsWithProcess.has(item.turn)}
              />
            )}
            contentContainerStyle={[styles.messages, visibleMessages.length === 0 && styles.emptyMessages]}
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load('replace', true)}
                tintColor={colors.textSecondary}
              />
            )}
            ListHeaderComponent={() => hasMore ? (
              <Button
                title={loadingEarlier ? '加载中…' : '加载更早的消息'}
                variant="ghost"
                onPress={() => void loadEarlier()}
                disabled={loadingEarlier}
                style={styles.earlier}
              />
            ) : null}
            ListEmptyComponent={() => (draft || running) ? null : (
              <EmptyState icon="chatbubble-ellipses-outline" title="开始对话" message="描述任务、粘贴代码，或添加一张图片。" />
            )}
            ListFooterComponent={() => (showFooterProcess || draft || running) ? (
              <View style={styles.liveFooter}>
                {showFooterProcess && (
                  <TurnProcessCard
                    steps={liveStepItems}
                    sessionId={sessionId}
                    parentSessionId={parentSessionId}
                    subagentMode={subagentMode}
                    running
                  />
                )}
                {!!draft && (
                  <View style={styles.draft}>
                    <Markdown sessionId={sessionId}>{draft}</Markdown>
                  </View>
                )}
                {running && (
                  <View style={styles.runningRow}>
                    <AppIcon name="aperture-outline" size={15} color={colors.accentBlue} />
                    <Text style={styles.runningText}>正在处理，用时 {elapsedText} ···</Text>
                  </View>
                )}
              </View>
            ) : null}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const isNear = contentOffset.y + layoutMeasurement.height >= contentSize.height - 180;
              nearBottom.current = isNear;
              setShowScrollFab(!isNear && contentSize.height > layoutMeasurement.height + 120);
            }}
            onContentSizeChange={() => {
              if ((prefs.followAiReply && nearBottom.current) || sending) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            scrollEventThrottle={100}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />

          <Pressable
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            onPress={() => {
              if (showScrollFab) {
                nearBottom.current = true;
                setShowScrollFab(false);
                listRef.current?.scrollToEnd({ animated: true });
              } else {
                router.push({ pathname: '/chat/subagents', params: { sessionId } });
              }
            }}
            accessibilityLabel={showScrollFab ? '回到底部' : '子代理列表'}
          >
            <AppIcon name={showScrollFab ? 'arrow-down' : 'layers-outline'} size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.bottom}>
          {!isSubagent && (
            <GoalPlanBanner
              projections={projections}
              busy={goalBusy}
              onGoalAction={(action) => void handleGoalAction(action)}
            />
          )}
          {!isSubagent && (
            <QueueDock
              items={queueItems}
              busyId={queueBusyId}
              onSteer={(id) => void handleQueueAction(id, { kind: 'steer' })}
              onEdit={(id, text) => void handleQueueAction(id, { kind: 'edit', content: [{ type: 'text', text }] })}
              onRemove={(id) => void handleQueueAction(id, { kind: 'remove' })}
            />
          )}
          {!isSubagent && (
            <ComposerSuggestions
              trigger={composerTrigger}
              commands={commands}
              files={refFiles}
              sessions={refSessions}
              loading={refLoading}
              onPick={(replacement) => {
                if (!composerTrigger) return;
                setInput((cur) => applyComposerTrigger(cur, composerTrigger.start, replacement));
              }}
            />
          )}
          <DocumentChips
            documents={documents}
            onRemove={(id) => setDocuments((current) => current.filter((document) => document.id !== id))}
          />
          {!!images.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachments}>
              {images.map((image) => (
                <View key={image.id} style={styles.attachment}>
                  <Image source={{ uri: image.uri }} style={styles.attachmentImage} />
                  <Pressable
                    style={styles.removeImage}
                    onPress={() => setImages((current) => current.filter((item) => item.id !== image.id))}
                  >
                    <AppIcon name="close" size={13} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <InteractionCards
            key={approval?.rpcId || question?.rpcId || 'no-interaction'}
            approval={approval}
            question={question}
            busy={interactionBusy}
            onApproval={(outcome) => void answerApproval(outcome)}
            onQuestion={(answers) => void answerQuestion(answers)}
          />

          <View style={styles.composer}>
            <TextInput
              multiline
              value={input}
              onChangeText={setInput}
              style={styles.input}
              placeholder={running ? '继续补充要求，或点击发送排队/插话' : '发消息或创建任务，/ 调用指令，@ 文件或对话'}
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
              editable={!sending}
              blurOnSubmit={prefs.enterToSend}
              returnKeyType={prefs.enterToSend ? 'send' : 'default'}
              onSubmitEditing={() => { if (prefs.enterToSend) void send(); }}
            />
            {!!uploadingDoc && <Text style={styles.uploadingText}>{uploadingDoc}</Text>}
            {exportingLog && <Text style={styles.uploadingText}>正在导出会话日志…</Text>}
            <View style={styles.composerActions}>
              {!isSubagent && (
                <Pressable
                  style={({ pressed }) => [styles.plusButton, pressed && styles.plusPressed]}
                  onPress={() => {
                    setPicker(null);
                    setAttachSheetOpen((prev) => !prev);
                  }}
                  accessibilityLabel="添加内容与指令"
                >
                  {uploadingDoc || exportingLog ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <AppIcon name="add" size={20} color={colors.text} />
                  )}
                </Pressable>
              )}

              {running ? (
                <Pressable
                  onPress={() => setDeliveryMode((value) => value === 'queue' ? 'steer' : 'queue')}
                  style={({ pressed }) => [styles.shieldModeButton, pressed && styles.plusPressed]}
                  accessibilityLabel="切换发送方式"
                >
                  <AppIcon name="shield-outline" size={16} color={colors.muted} />
                  <Text style={styles.shieldModeText}>{deliveryMode === 'queue' ? '排队' : '插话'}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => Alert.alert('端到端加密连接', '局域网端到端加密 · 敏感工具需你手动批准')}
                  style={styles.shieldIconButton}
                  hitSlop={8}
                  accessibilityLabel="安全状态"
                >
                  <AppIcon name="shield-outline" size={18} color={colors.muted} />
                </Pressable>
              )}

              <View style={styles.composerSpacer} />

              {!isSubagent && (
                <Pressable
                  style={styles.inlineModelButton}
                  onPress={() => setPicker('model')}
                  disabled={!models.length}
                >
                  <Text style={styles.inlineModelText} numberOfLines={1}>
                    {selectedModel?.name || selection?.model || '当前模型'}
                  </Text>
                  {!!effortLabel && (
                    <Text style={styles.inlineEffortText} numberOfLines={1}>{effortLabel}</Text>
                  )}
                  <AppIcon name="chevron-down" size={14} color={colors.muted} />
                </Pressable>
              )}

              {running ? (
                <View style={styles.runningActions}>
                  {hasPayload && (
                    <Pressable
                      disabled={sending}
                      onPress={() => void send()}
                      style={({ pressed }) => [styles.sendMini, pressed && styles.sendPressed]}
                      accessibilityLabel="发送"
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <AppIcon name="arrow-up" size={18} color="#FFFFFF" />
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => void stop()}
                    style={({ pressed }) => [styles.stopButton, pressed && styles.sendPressed]}
                    accessibilityLabel="停止生成"
                  >
                    <View style={styles.stopSquare} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  disabled={sending || !hasPayload}
                  onPress={() => void send()}
                  style={({ pressed }) => [
                    styles.send,
                    hasPayload ? styles.sendActive : styles.sendDisabled,
                    pressed && styles.sendPressed,
                  ]}
                  accessibilityLabel="发送"
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <AppIcon name="arrow-up" size={20} color="#FFFFFF" />
                  )}
                </Pressable>
              )}
            </View>
          </View>

          {!isSubagent && <SessionStatsBar projections={projections} />}
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {splitLayout ? (
        <View style={styles.splitRoot}>
          <View style={styles.splitSidebar}>
            <WorkspaceTreeView
              currentSessionId={sessionId}
              onSelectSession={(item) => {
                if (item.sessionId !== sessionId) {
                  router.replace({
                    pathname: '/chat/[sessionId]',
                    params: { sessionId: item.sessionId, title: item.title || '会话' },
                  });
                }
              }}
            />
          </View>
          {chatColumn}
        </View>
      ) : (
        chatColumn
      )}

      {!isSubagent && !splitLayout && (
        <WorkspaceDrawer
          visible={drawerOpen}
          currentSessionId={sessionId}
          onClose={() => setDrawerOpen(false)}
          onSelectSession={(item) => {
            if (prefs.tapSessionClosesDrawer) setDrawerOpen(false);
            if (item.sessionId !== sessionId) {
              router.replace({
                pathname: '/chat/[sessionId]',
                params: { sessionId: item.sessionId, title: item.title || '会话' },
              });
            }
          }}
        />
      )}

      {!isSubagent && (
        <ModelPickerSheet
          visible={picker === 'model'}
          groups={catalog?.groups || []}
          selection={selection}
          selectedModel={selectedModel}
          onSelectModel={(provider, modelId) => void chooseModel(provider, modelId)}
          onSelectEffort={(effort) => void chooseEffort(effort)}
          onClose={() => setPicker(null)}
        />
      )}

      {attachSheetOpen && (
        <View style={styles.popoverOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAttachSheetOpen(false)} />
          <View style={[styles.plusPopover, splitLayout && styles.plusPopoverSplit]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.popoverSection}>添加</Text>
              <View style={styles.plusRow}>
                <Pressable style={styles.plusRowMain} onPress={() => void takePhoto()}>
                  <AppIcon name="camera-outline" size={20} color={colors.text} />
                  <Text style={styles.plusRowTitle}>拍照</Text>
                </Pressable>
                <View style={styles.qualityPill}>
                  <Pressable
                    style={[styles.qualityOption, prefs.imageQuality === 'original' && styles.qualityOptionActive]}
                    onPress={() => void updatePrefs({ imageQuality: 'original' })}
                  >
                    <Text style={[styles.qualityText, prefs.imageQuality === 'original' && styles.qualityTextActive]}>原图</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.qualityOption, prefs.imageQuality === 'compressed' && styles.qualityOptionActive]}
                    onPress={() => void updatePrefs({ imageQuality: 'compressed' })}
                  >
                    <Text style={[styles.qualityText, prefs.imageQuality === 'compressed' && styles.qualityTextActive]}>压缩</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.plusRow}>
                <Pressable style={styles.plusRowMain} onPress={() => void pickImages()}>
                  <AppIcon name="image-outline" size={20} color={colors.text} />
                  <Text style={styles.plusRowTitle}>添加媒体</Text>
                </Pressable>
                <View style={styles.qualityPill}>
                  <Pressable
                    style={[styles.qualityOption, prefs.imageQuality === 'original' && styles.qualityOptionActive]}
                    onPress={() => void updatePrefs({ imageQuality: 'original' })}
                  >
                    <Text style={[styles.qualityText, prefs.imageQuality === 'original' && styles.qualityTextActive]}>原图</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.qualityOption, prefs.imageQuality === 'compressed' && styles.qualityOptionActive]}
                    onPress={() => void updatePrefs({ imageQuality: 'compressed' })}
                  >
                    <Text style={[styles.qualityText, prefs.imageQuality === 'compressed' && styles.qualityTextActive]}>压缩</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable style={styles.plusRow} onPress={() => void pickDocuments()}>
                <AppIcon name="attach-outline" size={20} color={colors.text} />
                <Text style={styles.plusRowTitle}>添加文件</Text>
                <Text style={styles.plusRowHint} numberOfLines={1}>从手机里选择文件</Text>
              </Pressable>

              <Pressable style={styles.plusRow} onPress={() => insertSlashCommand('goal')}>
                <AppIcon name="locate-outline" size={20} color={colors.text} />
                <Text style={styles.plusRowTitle}>目标</Text>
                <Text style={styles.plusRowCode}>/goal</Text>
                <Text style={styles.plusRowHint} numberOfLines={1}>设置或查看长期任务目标</Text>
              </Pressable>

              <Pressable style={styles.plusRow} onPress={() => insertSlashCommand('plan')}>
                <AppIcon name="document-text-outline" size={20} color={colors.text} />
                <Text style={styles.plusRowTitle}>计划</Text>
                <Text style={styles.plusRowCode}>/plan</Text>
                <Text style={styles.plusRowHint} numberOfLines={1}>进入或退出计划模式</Text>
              </Pressable>

              {running && (
                <Pressable
                  style={styles.plusRow}
                  onPress={() => {
                    setDeliveryMode((value) => value === 'queue' ? 'steer' : 'queue');
                    setAttachSheetOpen(false);
                  }}
                >
                  <AppIcon name="swap-horizontal-outline" size={20} color={colors.text} />
                  <Text style={styles.plusRowTitle}>发送方式</Text>
                  <Text style={styles.plusRowHint}>{deliveryMode === 'queue' ? '当前：排队' : '当前：插话'}</Text>
                </Pressable>
              )}

              <Text style={[styles.popoverSection, { marginTop: 8 }]}>指令</Text>
              <Pressable style={styles.plusRow} onPress={() => void exportLog()}>
                <AppIcon name="download-outline" size={20} color={colors.text} />
                <Text style={styles.plusRowTitle}>下载日志</Text>
                <Text style={styles.plusRowCode}>/export</Text>
                <Text style={styles.plusRowHint} numberOfLines={1}>将当前会话内容导出为 ZIP</Text>
              </Pressable>

              {extraCommands.map((cmd) => (
                <Pressable key={cmd.name} style={styles.plusRow} onPress={() => insertSlashCommand(cmd.name)}>
                  <Text style={styles.slashBadge}>/{cmd.name}</Text>
                  <Text style={styles.plusRowHint} numberOfLines={1}>{cmd.description}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {picker === 'actions' && (
        <View style={styles.popoverOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.menuPopover}>
            {!isSubagent && (
              <View style={styles.menuRow}>
                <AppIcon name="chatbox-ellipses-outline" size={19} color={colors.text} />
                <Text style={styles.menuLabel}>过程播报</Text>
                <Switch
                  value={narration}
                  disabled={narrationBusy}
                  onValueChange={(value) => void toggleNarration(value)}
                  trackColor={{ true: colors.green, false: colors.borderStrong }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setPicker(null);
                router.push('/stats');
              }}
            >
              <AppIcon name="bar-chart-outline" size={19} color={colors.text} />
              <Text style={styles.menuLabel}>统计总览</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setPicker(null);
                router.push({ pathname: '/chat/subagents', params: { sessionId } });
              }}
            >
              <AppIcon name="people-outline" size={19} color={colors.text} />
              <Text style={styles.menuLabel}>子代理列表</Text>
            </Pressable>
            {!!session?.cwd && (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setPicker(null);
                  router.push({ pathname: '/files', params: { path: session.cwd!, sessionId } });
                }}
              >
                <AppIcon name="folder-open-outline" size={19} color={colors.text} />
                <Text style={styles.menuLabel}>电脑文件</Text>
              </Pressable>
            )}
            {!!session?.cwd && (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setPicker(null);
                  router.push({ pathname: '/git', params: { path: session.cwd! } });
                }}
              >
                <AppIcon name="git-network-outline" size={19} color={colors.text} />
                <Text style={styles.menuLabel}>Git 源代码管理</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setPicker(null);
                setRenaming(true);
              }}
            >
              <AppIcon name="create-outline" size={19} color={colors.text} />
              <Text style={styles.menuLabel}>重命名</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={async () => {
                setPicker(null);
                if (!client) return;
                try {
                  const result = await client.forkSession(sessionId);
                  if (result.sessionId) {
                    router.push({
                      pathname: '/chat/[sessionId]',
                      params: { sessionId: result.sessionId, title: `${resolvedTitle} · 分支` },
                    });
                  }
                } catch (cause) {
                  Alert.alert('分支创建失败', cause instanceof Error ? cause.message : '请稍后重试');
                }
              }}
            >
              <AppIcon name="git-branch-outline" size={19} color={colors.text} />
              <Text style={styles.menuLabel}>创建分支</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setPicker(null);
                void client?.setSessionPinned(sessionId, !session?.pinned)
                  .then(() => load('incremental', false))
                  .catch((cause) => Alert.alert('操作失败', String(cause)));
              }}
            >
              <AppIcon name={session?.pinned ? 'pin-outline' : 'pin'} size={19} color={colors.text} />
              <Text style={styles.menuLabel}>{session?.pinned ? '取消置顶' : '置顶会话'}</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setPicker(null);
                void client?.setSessionArchived(sessionId, true)
                  .then(() => router.replace('/sessions'))
                  .catch((cause) => Alert.alert('归档失败', String(cause)));
              }}
            >
              <AppIcon name="archive-outline" size={19} color={colors.warning} />
              <Text style={[styles.menuLabel, { color: colors.warning }]}>归档会话</Text>
            </Pressable>
            <Pressable
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => {
                setPicker(null);
                router.replace('/sessions');
              }}
            >
              <AppIcon name="chevron-back" size={19} color={colors.text} />
              <Text style={styles.menuLabel}>返回首页</Text>
            </Pressable>
          </View>
        </View>
      )}

      {renaming && (
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>重命名会话</Text>
            <TextInput
              autoFocus
              value={renameTitle}
              onChangeText={setRenameTitle}
              style={styles.dialogInput}
              selectTextOnFocus
            />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setRenaming(false)} />
              <Button
                title="保存"
                onPress={() => {
                  const next = renameTitle.trim();
                  if (!next || !client) return;
                  void client.renameSession(sessionId, next)
                    .then(() => {
                      setSession((current) => current ? { ...current, title: next } : current);
                      setRenaming(false);
                    })
                    .catch((cause) => Alert.alert('重命名失败', String(cause)));
                }}
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  splitRoot: { flex: 1, flexDirection: 'row' },
  splitSidebar: {
    width: 310,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  chatColumn: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.bg,
  },
  headerSpacer: { width: 38 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  reconnectStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reconnectDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  reconnectText: { color: colors.muted, fontSize: 11.5 },
  listWrap: { flex: 1, position: 'relative' },
  messages: { paddingTop: 10, paddingBottom: 68 },
  emptyMessages: { flexGrow: 1 },
  liveFooter: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 12, gap: 10 },
  draft: { marginTop: 4 },
  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 2 },
  runningText: { color: colors.accentBlue, fontSize: 13.5, fontWeight: '500' },
  earlier: { alignSelf: 'center', marginBottom: 14 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.floatingBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabPressed: { opacity: 0.78 },
  bottom: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6, backgroundColor: colors.bg },
  attachments: { gap: 9, paddingBottom: 9 },
  attachment: { width: 62, height: 62 },
  attachmentImage: { width: 62, height: 62, borderRadius: 9, backgroundColor: colors.card },
  removeImage: {
    position: 'absolute',
    right: -5,
    top: -5,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  input: {
    minHeight: 42,
    maxHeight: 140,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  uploadingText: { color: colors.muted, fontSize: 11, marginTop: 4 },
  composerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  plusButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPressed: { opacity: 0.75 },
  shieldIconButton: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  shieldModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  shieldModeText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '500' },
  composerSpacer: { flex: 1 },
  inlineModelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '48%',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  inlineModelText: { color: colors.text, fontSize: 13.5, fontWeight: '500', flexShrink: 1 },
  inlineEffortText: { color: colors.accentBlue, fontSize: 13, fontWeight: '600' },
  runningActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendMini: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentBlue, alignItems: 'center', justifyContent: 'center' },
  sendActive: { backgroundColor: colors.accentBlue },
  sendDisabled: { backgroundColor: colors.borderStrong },
  sendPressed: { opacity: 0.8 },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2.5, backgroundColor: '#FFFFFF' },
  popoverOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 15,
  },
  menuPopover: {
    position: 'absolute',
    top: 96,
    right: 14,
    width: 224,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...shadow,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuLabel: { flex: 1, color: colors.text, fontSize: 14.5 },
  plusPopover: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 136,
    maxHeight: '58%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadow,
  },
  plusPopoverSplit: {
    left: 324,
  },
  popoverSection: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
  },
  plusRowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  plusRowTitle: { color: colors.text, fontSize: 15, fontWeight: '500' },
  plusRowCode: { color: colors.muted, fontSize: 13 },
  plusRowHint: { flex: 1, textAlign: 'right', color: colors.muted, fontSize: 12.5 },
  slashBadge: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  qualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qualityOption: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  qualityOptionActive: { backgroundColor: colors.card },
  qualityText: { color: colors.muted, fontSize: 12 },
  qualityTextActive: { color: colors.text, fontWeight: '600' },
  dialogOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 20,
  },
  dialogTitle: { color: colors.text, fontSize: 19, fontWeight: '600', marginBottom: 15 },
  dialogInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    fontSize: 16,
    padding: 13,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
});
