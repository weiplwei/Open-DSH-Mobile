import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, BrandMark } from './AppIcon';
import { Button } from './Button';
import { EmptyState, ErrorBanner, LoadingView } from './Feedback';
import { OptionSheet, SearchInput } from './Form';
import { formatRelativeCompact } from '@/lib/chat-format';
import type { SessionItem, SessionSearchHit, WorkspaceItem } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { radii, shadow, type ThemePalette } from '@/theme';

function normalizePath(p?: string): string {
  return (p || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function projectName(cwd?: string): string {
  if (!cwd) return '其他会话';
  const normalized = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.split('/').pop() || normalized;
}

type WorkspaceGroup = {
  key: string;
  title: string;
  path?: string;
  workspaceId?: string;
  sessions: SessionItem[];
};

export function WorkspaceTreeView({
  currentSessionId,
  onSelectSession,
  onNavigate,
  isDrawer = false,
}: {
  currentSessionId?: string;
  onSelectSession: (item: SessionItem) => void;
  onNavigate?: () => void;
  isDrawer?: boolean;
}) {
  const { client, host } = useHost();
  const { isDark, setMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [items, setItems] = useState<SessionItem[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [archived, setArchived] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SessionSearchHit[]>([]);
  const [searchingBody, setSearchingBody] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [menuSession, setMenuSession] = useState<SessionItem | null>(null);
  const [movingSession, setMovingSession] = useState<SessionItem | null>(null);
  const [menuWorkspace, setMenuWorkspace] = useState<WorkspaceGroup | null>(null);
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceGroup | null>(null);
  const [workspaceNameText, setWorkspaceNameText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async (refresh = false) => {
    if (!client) return;
    if (refresh) setRefreshing(true);
    setError('');
    const started = Date.now();
    try {
      const [sessionRes, wsRes] = await Promise.all([
        client.listSessions(),
        client.listWorkspaces().catch(() => ({ ok: true, items: [] as WorkspaceItem[] })),
      ]);
      if (!mounted.current) return;
      setItems((sessionRes.items || []).filter((item) => item.origin !== 'subagent' && !item.parentSessionId));
      setWorkspaces(wsRes.items || []);
      setLatency(Date.now() - started);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '无法读取会话');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [client]);

  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => { void load(); }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
    };
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (!client || !searchOpen || q.length < 2) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchingBody(true);
      client.searchSessions(q)
        .then((res) => { if (!cancelled) setSearchHits(res.items || []); })
        .catch(() => { if (!cancelled) setSearchHits([]); })
        .finally(() => { if (!cancelled) setSearchingBody(false); });
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query, searchOpen]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, SessionItem>();
    for (const item of items) map.set(item.sessionId, item);
    return map;
  }, [items]);

  const resolvedHits = useMemo(() => {
    if (!searchOpen || query.trim().length < 2) return [];
    return searchHits
      .map((hit) => ({ hit, session: sessionMap.get(hit.sessionId) }))
      .filter((entry): entry is { hit: SessionSearchHit; session: SessionItem } => {
        if (!entry.session) return false;
        const isArchived = entry.session.archived === true || typeof entry.session.archivedAt === 'number';
        return isArchived === archived;
      });
  }, [archived, query, searchHits, searchOpen, sessionMap]);

  const archivedCount = useMemo(
    () => items.filter((item) => item.archived === true || typeof item.archivedAt === 'number').length,
    [items],
  );

  const groups = useMemo<WorkspaceGroup[]>(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      const isArchived = item.archived === true || typeof item.archivedAt === 'number';
      if (isArchived !== archived) return false;
      if (!needle) return true;
      return `${item.title || ''}\n${item.cwd || ''}`.toLocaleLowerCase().includes(needle);
    });

    const wsByNormPath = new Map<string, WorkspaceItem>();
    for (const ws of workspaces) {
      if (ws.path) wsByNormPath.set(normalizePath(ws.path), ws);
    }

    const bucketMap = new Map<string, WorkspaceGroup>();
    if (!archived && !needle) {
      for (const ws of workspaces) {
        const key = ws.path ? normalizePath(ws.path) : ws.workspaceId;
        bucketMap.set(key, {
          key,
          title: ws.title || projectName(ws.path),
          path: ws.path,
          workspaceId: ws.workspaceId,
          sessions: [],
        });
      }
    }

    for (const item of filtered) {
      const norm = normalizePath(item.cwd);
      const matchedWs = norm ? wsByNormPath.get(norm) : undefined;
      const key = norm || '__other__';
      const existing = bucketMap.get(key);
      if (existing) {
        existing.sessions.push(item);
      } else {
        bucketMap.set(key, {
          key,
          title: matchedWs?.title || projectName(item.cwd),
          path: item.cwd,
          workspaceId: matchedWs?.workspaceId,
          sessions: [item],
        });
      }
    }

    return [...bucketMap.values()]
      .filter((group) => group.sessions.length > 0 || (!archived && !needle && group.workspaceId))
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        }),
      }))
      .sort((a, b) => {
        const aTop = a.sessions[0]?.updatedAt || 0;
        const bTop = b.sessions[0]?.updatedAt || 0;
        if (aTop !== bTop) return bTop - aTop;
        return a.title.localeCompare(b.title);
      });
  }, [archived, items, query, workspaces]);

  const performAction = async (fn: () => Promise<unknown>) => {
    if (!client || busy) return;
    setBusy(true);
    try {
      await fn();
      setMenuSession(null);
      setMenuWorkspace(null);
      await load(true);
    } catch (cause) {
      Alert.alert('操作失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const navigateTo = (path: '/stats' | '/settings' | '/schedule' | '/new-chat', params?: Record<string, string>) => {
    onNavigate?.();
    if (params) router.push({ pathname: path, params });
    else router.push(path);
  };

  const confirmClearArchived = () => {
    if (!client || archivedCount === 0) return;
    Alert.alert(
      '清空所有已归档会话？',
      `这会将 ${archivedCount} 条已归档会话加入删除队列，操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认清理',
          style: 'destructive',
          onPress: () => void performAction(() => client.clearArchivedSessions()),
        },
      ],
    );
  };

  if (!client || !host) {
    return <EmptyState icon="link-outline" title="尚未连接" message="请先扫描电脑端的配对二维码。" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <BrandMark size={26} />
          <Text style={styles.brandText}>Open DSH</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            style={({ pressed }) => [styles.circleBtn, pressed && styles.circleBtnPressed]}
            onPress={() => navigateTo('/stats')}
            accessibilityLabel="统计"
          >
            <AppIcon name="bar-chart-outline" size={17} color={colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.circleBtn, pressed && styles.circleBtnPressed]}
            onPress={() => void setMode(isDark ? 'light' : 'dark')}
            accessibilityLabel="切换主题"
          >
            <AppIcon name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.circleBtn, pressed && styles.circleBtnPressed]}
            onPress={() => navigateTo('/settings')}
            accessibilityLabel="设置"
          >
            <AppIcon name="settings-outline" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabRow}>
        <View style={styles.tabs}>
          <Pressable onPress={() => setArchived(false)} style={styles.tabBtn}>
            <Text style={[styles.tabText, !archived && styles.tabTextActive]}>工作区</Text>
          </Pressable>
          <View style={styles.tabSep} />
          <Pressable onPress={() => setArchived(true)} style={styles.tabBtn}>
            <Text style={[styles.tabText, archived && styles.tabTextActive]}>已归档</Text>
          </Pressable>
        </View>
        <View style={styles.tabTools}>
          <Pressable
            style={styles.toolIconBtn}
            onPress={() => setSearchOpen((prev) => {
              if (prev) {
                setQuery('');
                setSearchHits([]);
              }
              return !prev;
            })}
            accessibilityLabel="搜索会话"
          >
            <AppIcon name="search-outline" size={19} color={searchOpen ? colors.accentBlue : colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.toolIconBtn}
            onPress={() => navigateTo('/schedule')}
            accessibilityLabel="定时任务"
          >
            <AppIcon name="time-outline" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {searchOpen && (
        <View style={styles.searchWrap}>
          <SearchInput value={query} onChangeText={setQuery} placeholder="搜索标题、目录或对话正文" autoFocus />
        </View>
      )}

      <View style={styles.hostRow}>
        <AppIcon name="desktop-outline" size={15} color={colors.textSecondary} />
        <Text style={styles.hostName} numberOfLines={1}>{host.name}</Text>
        <View style={styles.hostRight}>
          {latency !== null && (
            <View style={styles.latencyBox}>
              <Text style={styles.latencyText}>局域网 {latency} ms</Text>
              <View style={styles.signalBars}>
                {[0, 1, 2, 3, 4, 5].map((bar) => (
                  <View key={bar} style={styles.signalBar} />
                ))}
              </View>
            </View>
          )}
          <Pressable
            style={styles.toolIconBtn}
            onPress={() => {
              setNewWorkspacePath('');
              setAddingWorkspace(true);
            }}
            accessibilityLabel="添加工作区"
          >
            <AppIcon name="folder-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.toolIconBtn}
            onPress={() => navigateTo('/new-chat')}
            accessibilityLabel="新建对话"
          >
            <AppIcon name="create-outline" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {archived && archivedCount > 0 && (
        <Pressable style={styles.clearArchivedBar} onPress={confirmClearArchived}>
          <AppIcon name="trash-outline" size={14} color={colors.danger} />
          <Text style={styles.clearArchivedText}>清空所有已归档 ({archivedCount})</Text>
        </Pressable>
      )}

      {!!error && <ErrorBanner message={error} onRetry={() => void load(true)} />}

      {loading && items.length === 0 ? (
        <LoadingView label="正在读取工作区…" />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, groups.length === 0 && resolvedHits.length === 0 && styles.emptyScroll]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.textSecondary} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {searchOpen && query.trim().length >= 2 && (searchingBody || resolvedHits.length > 0) && (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <AppIcon name="search-outline" size={15} color={colors.accentBlue} />
                <Text style={[styles.groupTitle, { color: colors.accentBlue }]}>正文匹配</Text>
                {searchingBody && <ActivityIndicator size="small" color={colors.accentBlue} />}
              </View>
              {resolvedHits.map(({ hit, session }) => (
                <Pressable
                  key={`hit-${hit.sessionId}`}
                  style={({ pressed }) => [styles.hitRow, pressed && styles.sessionRowPressed]}
                  onPress={() => onSelectSession(session)}
                >
                  <Text style={styles.sessionTitle} numberOfLines={1}>{session.title || '未命名会话'}</Text>
                  {!!hit.snippet && <Text style={styles.hitSnippet} numberOfLines={2}>{hit.snippet}</Text>}
                </Pressable>
              ))}
            </View>
          )}

          {groups.length === 0 && resolvedHits.length === 0 ? (
            <EmptyState
              icon={archived ? 'archive-outline' : 'chatbubbles-outline'}
              title={query ? '没有匹配结果' : archived ? '没有已归档会话' : '开始一个新会话'}
              message={query ? '试试其他关键词。' : '点击右上角新建对话。'}
            />
          ) : (
            groups.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.key]);
              const visibleSessions = isExpanded ? group.sessions : group.sessions.slice(0, 5);
              const hiddenCount = Math.max(0, group.sessions.length - 5);

              return (
                <View key={group.key} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <AppIcon name="folder-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.groupTitle} numberOfLines={1}>{group.title}</Text>
                    {(!!group.path || !!group.workspaceId) && (
                      <Pressable
                        style={styles.groupMoreBtn}
                        onPress={() => setMenuWorkspace(group)}
                        hitSlop={6}
                      >
                        <AppIcon name="ellipsis-horizontal" size={15} color={colors.muted} />
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.newChatPill}
                      onPress={() => navigateTo('/new-chat', group.workspaceId ? { workspaceId: group.workspaceId } : undefined)}
                      hitSlop={4}
                    >
                      <AppIcon name="add-circle-outline" size={15} color={colors.textSecondary} />
                      <Text style={styles.newChatText}>对话</Text>
                    </Pressable>
                  </View>

                  {visibleSessions.map((session) => {
                    const active = session.sessionId === currentSessionId;
                    const statusColor = session.pendingInteraction
                      ? colors.warning
                      : session.lastTurnError
                        ? colors.danger
                        : session.running
                          ? colors.success
                          : '';

                    return (
                      <Pressable
                        key={session.sessionId}
                        style={({ pressed }) => [
                          styles.sessionRow,
                          active && styles.sessionRowActive,
                          pressed && !active && styles.sessionRowPressed,
                        ]}
                        onPress={() => onSelectSession(session)}
                        onLongPress={() => setMenuSession(session)}
                      >
                        {!!statusColor && <View style={[styles.statusDot, { backgroundColor: statusColor }]} />}
                        <Text
                          style={[styles.sessionTitle, active && styles.sessionTitleActive]}
                          numberOfLines={1}
                        >
                          {session.title || '未命名会话'}
                        </Text>

                        {active ? (
                          <View style={styles.activeIcons}>
                            <Pressable
                              onPress={() => setMenuSession(session)}
                              hitSlop={6}
                              style={styles.inlineActionBtn}
                            >
                              <AppIcon name="ellipsis-horizontal" size={15} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable
                              onPress={() => void performAction(() => client.setSessionArchived(session.sessionId, !archived))}
                              hitSlop={6}
                              style={styles.inlineActionBtn}
                            >
                              <AppIcon name={archived ? 'arrow-undo-outline' : 'archive-outline'} size={15} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable
                              onPress={() => void performAction(() => client.setSessionPinned(session.sessionId, !session.pinned))}
                              hitSlop={6}
                              style={styles.inlineActionBtn}
                            >
                              <AppIcon name={session.pinned ? 'pin' : 'pin-outline'} size={15} color={session.pinned ? colors.accentBlue : colors.textSecondary} />
                            </Pressable>
                          </View>
                        ) : (
                          <Text style={styles.relTime}>{formatRelativeCompact(session.updatedAt)}</Text>
                        )}
                      </Pressable>
                    );
                  })}

                  {hiddenCount > 0 && (
                    <Pressable
                      style={styles.expandGroupBtn}
                      onPress={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !isExpanded }))}
                    >
                      <AppIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={!!menuSession && !renaming} transparent animationType="fade" onRequestClose={() => setMenuSession(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuSession(null)} />
          <View style={styles.sheetCard}>
            {busy && <ActivityIndicator size="small" color={colors.accentBlue} />}
            <Text style={styles.sheetTitle} numberOfLines={1}>{menuSession?.title || '会话操作'}</Text>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                if (menuSession) {
                  setRenameText(menuSession.title || '');
                  setRenaming(true);
                }
              }}
            >
              <AppIcon name="create-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.sheetLabel}>重命名</Text>
            </Pressable>
            {workspaces.length > 0 && (
              <Pressable
                style={styles.sheetRow}
                onPress={() => {
                  const target = menuSession;
                  setMenuSession(null);
                  if (target) setMovingSession(target);
                }}
              >
                <AppIcon name="folder-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.sheetLabel}>移动到工作区</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.sheetRow}
              onPress={() => menuSession && void performAction(() => client.setSessionPinned(menuSession.sessionId, !menuSession.pinned))}
            >
              <AppIcon name={menuSession?.pinned ? 'pin-outline' : 'pin'} size={18} color={colors.textSecondary} />
              <Text style={styles.sheetLabel}>{menuSession?.pinned ? '取消置顶' : '置顶会话'}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={async () => {
                if (!menuSession || busy) return;
                setBusy(true);
                try {
                  const res = await client.forkSession(menuSession.sessionId);
                  setMenuSession(null);
                  if (res.sessionId) {
                    onNavigate?.();
                    router.push({ pathname: '/chat/[sessionId]', params: { sessionId: res.sessionId, title: `${menuSession.title || '会话'} · 分支` } });
                  }
                } catch (cause) {
                  Alert.alert('分支创建失败', cause instanceof Error ? cause.message : '请稍后重试');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <AppIcon name="git-branch-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.sheetLabel}>创建分支</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => menuSession && void performAction(() => client.setSessionArchived(menuSession.sessionId, !archived))}
            >
              <AppIcon name={archived ? 'arrow-undo-outline' : 'archive-outline'} size={18} color={colors.warning} />
              <Text style={[styles.sheetLabel, { color: colors.warning }]}>{archived ? '移出归档' : '归档会话'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!menuWorkspace} transparent animationType="fade" onRequestClose={() => setMenuWorkspace(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuWorkspace(null)} />
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{menuWorkspace?.title || '工作区'}</Text>
            {!!menuWorkspace?.path && (
              <>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const path = menuWorkspace.path!;
                    setMenuWorkspace(null);
                    onNavigate?.();
                    router.push({ pathname: '/files', params: { path } });
                  }}
                >
                  <AppIcon name="folder-open-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.sheetLabel}>浏览电脑文件</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const path = menuWorkspace.path!;
                    setMenuWorkspace(null);
                    onNavigate?.();
                    router.push({ pathname: '/git', params: { path } });
                  }}
                >
                  <AppIcon name="git-network-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.sheetLabel}>Git 源代码管理</Text>
                </Pressable>
              </>
            )}
            {!!menuWorkspace?.workspaceId && (
              <>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const target = menuWorkspace;
                    setMenuWorkspace(null);
                    setWorkspaceNameText(target.title);
                    setRenamingWorkspace(target);
                  }}
                >
                  <AppIcon name="create-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.sheetLabel}>重命名工作区</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    const wsId = menuWorkspace.workspaceId!;
                    const wsTitle = menuWorkspace.title;
                    setMenuWorkspace(null);
                    Alert.alert('移除工作区', `确认移除「${wsTitle}」的登记？电脑上的目录和会话日志不会被删除。`, [
                      { text: '取消', style: 'cancel' },
                      { text: '移除', style: 'destructive', onPress: () => void performAction(() => client.deleteWorkspace(wsId)) },
                    ]);
                  }}
                >
                  <AppIcon name="trash-outline" size={18} color={colors.danger} />
                  <Text style={[styles.sheetLabel, { color: colors.danger }]}>移除工作区</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>重命名会话</Text>
            <TextInput
              autoFocus
              value={renameText}
              onChangeText={setRenameText}
              style={styles.dialogInput}
              placeholder="会话名称"
              placeholderTextColor={colors.muted}
              selectTextOnFocus
            />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setRenaming(false)} style={styles.dialogBtn} />
              <Button
                title={busy ? '保存中…' : '保存'}
                onPress={() => {
                  const next = renameText.trim();
                  if (!next || !menuSession) return;
                  void performAction(async () => {
                    await client.renameSession(menuSession.sessionId, next);
                    setRenaming(false);
                  });
                }}
                style={styles.dialogBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addingWorkspace} transparent animationType="fade" onRequestClose={() => setAddingWorkspace(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>添加工作区</Text>
            <TextInput
              autoFocus
              value={newWorkspacePath}
              onChangeText={setNewWorkspacePath}
              style={styles.dialogInput}
              placeholder="电脑上的项目绝对路径，如 D:\\AI\\repo"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setAddingWorkspace(false)} style={styles.dialogBtn} />
              <Button
                title={busy ? '添加中…' : '添加'}
                onPress={() => {
                  const targetPath = newWorkspacePath.trim();
                  if (!targetPath) return;
                  void performAction(async () => {
                    await client.createWorkspace(targetPath);
                    setAddingWorkspace(false);
                  });
                }}
                style={styles.dialogBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!renamingWorkspace} transparent animationType="fade" onRequestClose={() => setRenamingWorkspace(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>重命名工作区</Text>
            <TextInput
              autoFocus
              value={workspaceNameText}
              onChangeText={setWorkspaceNameText}
              style={styles.dialogInput}
              placeholder="工作区名称"
              placeholderTextColor={colors.muted}
              selectTextOnFocus
            />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setRenamingWorkspace(null)} style={styles.dialogBtn} />
              <Button
                title={busy ? '保存中…' : '保存'}
                onPress={() => {
                  const next = workspaceNameText.trim();
                  if (!next || !renamingWorkspace?.workspaceId) return;
                  const wsId = renamingWorkspace.workspaceId;
                  void performAction(async () => {
                    await client.renameWorkspace(wsId, next);
                    setRenamingWorkspace(null);
                  });
                }}
                style={styles.dialogBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <OptionSheet
        visible={!!movingSession}
        title="移动到工作区"
        options={workspaces.map((ws) => ({
          id: ws.workspaceId,
          title: ws.title || projectName(ws.path),
          subtitle: ws.path,
        }))}
        onClose={() => setMovingSession(null)}
        onSelect={(targetWsId) => {
          const s = movingSession;
          setMovingSession(null);
          if (!s) return;
          void performAction(() => client.moveSessionToWorkspace(targetWsId, s.sessionId));
        }}
      />

      {isDrawer && <View style={styles.bottomPad} />}
    </View>
  );
}

export function WorkspaceDrawer({
  visible,
  currentSessionId,
  onClose,
  onSelectSession,
}: {
  visible: boolean;
  currentSessionId?: string;
  onClose: () => void;
  onSelectSession: (item: SessionItem) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerRoot}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.drawerPanel}>
          <WorkspaceTreeView
            currentSessionId={currentSessionId}
            onSelectSession={onSelectSession}
            onNavigate={onClose}
            isDrawer
          />
        </SafeAreaView>
        <Pressable style={styles.drawerScrim} onPress={onClose} accessibilityLabel="关闭侧栏" />
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerPanel: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  drawerScrim: { flex: 1, backgroundColor: colors.overlay },
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnPressed: { opacity: 0.72 },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabBtn: { paddingVertical: 2 },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: colors.accentBlue, fontWeight: '600' },
  tabSep: { width: 1, height: 13, backgroundColor: colors.borderStrong },
  tabTools: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolIconBtn: { padding: 3 },
  searchWrap: { paddingHorizontal: 14, paddingTop: 10 },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hostName: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '600' },
  hostRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  latencyBox: { alignItems: 'flex-end', gap: 2 },
  latencyText: { color: colors.muted, fontSize: 11 },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  signalBar: { width: 2.5, height: 4, borderRadius: 1, backgroundColor: colors.success },
  clearArchivedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.dangerMuted,
  },
  clearArchivedText: { color: colors.danger, fontSize: 12.5, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 10, paddingBottom: 24 },
  emptyScroll: { flexGrow: 1 },
  group: { marginBottom: 14 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  groupTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  groupMoreBtn: { padding: 4 },
  newChatPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingLeft: 4 },
  newChatText: { color: colors.textSecondary, fontSize: 12.5 },
  hitRow: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    marginVertical: 1,
  },
  hitSnippet: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginVertical: 1,
  },
  sessionRowActive: { backgroundColor: colors.userBubble },
  sessionRowPressed: { backgroundColor: colors.surfaceRaised },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  sessionTitle: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19 },
  sessionTitleActive: { fontWeight: '500' },
  activeIcons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 },
  inlineActionBtn: { padding: 2 },
  relTime: { color: colors.muted, fontSize: 12, marginLeft: 8 },
  expandGroupBtn: { alignItems: 'center', paddingVertical: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 16,
    ...shadow,
  },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 46,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetLabel: { flex: 1, color: colors.text, fontSize: 14.5 },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 18,
  },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 12 },
  dialogInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    fontSize: 15,
    padding: 12,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  dialogBtn: { minWidth: 84 },
  bottomPad: { height: 4 },
});
