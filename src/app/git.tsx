import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import { OptionSheet, SectionHeader } from '@/components/Form';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import type { GitBranches, GitChange, GitCommitDetail, GitLog, GitRepo, GitStatus, WorkspaceItem } from '@/lib/types';
import { monoFont, radii, type ThemePalette } from '@/theme';

type Diff = { path: string; binary: boolean; truncated: boolean; additions: number; deletions: number; hunks: { header: string; lines: string[] }[] };

export default function GitScreen() {
  const params = useLocalSearchParams<{ path?: string }>();
  const cwd = params.path ? String(params.path) : '';
  const { client } = useHost();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [workspace, setWorkspace] = useState<WorkspaceItem | null>(null);
  const [repo, setRepo] = useState<GitRepo | null>(null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [log, setLog] = useState<GitLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [branchPicker, setBranchPicker] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [commitDetail, setCommitDetail] = useState<GitCommitDetail | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const workspaces = await client.listWorkspaces();
      const selected = workspaces.items.find((item) => item.path === cwd) || workspaces.items.find((item) => cwd.startsWith(`${item.path}/`) || cwd.startsWith(`${item.path}\\`));
      if (!selected) throw new Error('这个目录不在已注册工作区中，请先在工作区管理中添加。');
      setWorkspace(selected);
      const [repoResult, statusResult, branchResult, logResult] = await Promise.all([
        client.getGitRepo(selected.workspaceId), client.getGitStatus(selected.workspaceId), client.getGitBranches(selected.workspaceId), client.getGitLog(selected.workspaceId),
      ]);
      setRepo(repoResult); setStatus(statusResult); setBranches(branchResult); setLog(logResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取 Git 仓库'); }
    finally { setLoading(false); }
  }, [client, cwd]);

  useEffect(() => { const initial = setTimeout(() => { void load(); }, 0); return () => clearTimeout(initial); }, [load]);

  const changes = useMemo(() => [
    { title: '已暂存', items: status?.staged || [], staged: true },
    { title: '未暂存', items: status?.unstaged || [], staged: false },
    { title: '未跟踪', items: status?.untracked || [], staged: false },
    { title: '冲突', items: status?.conflicted || [], staged: false },
  ], [status]);
  const changeCount = changes.reduce((sum, group) => sum + group.items.length, 0);

  const run = async (action: () => Promise<unknown>) => {
    if (!workspace || busy) return;
    setBusy(true); setError('');
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Git 操作失败'); }
    finally { setBusy(false); }
  };

  const openDiff = async (change: GitChange) => {
    if (!workspace || change.binary) return;
    setBusy(true);
    try { setDiff(await client!.getGitDiff(workspace.workspaceId, change.path, change.stage === 'staged')); }
    catch (cause) { Alert.alert('无法读取差异', cause instanceof Error ? cause.message : '请稍后重试'); }
    finally { setBusy(false); }
  };

  const openCommit = async (hash: string) => {
    if (!workspace || !client) return;
    setBusy(true);
    try {
      setCommitDetail(await client.getGitShow(workspace.workspaceId, hash));
    } catch (cause) {
      Alert.alert('无法读取提交详情', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const generateAiMessage = async () => {
    if (!workspace || !client || aiBusy) return;
    setAiBusy(true);
    try {
      const catalog = await client.getModels('');
      const picked = catalog.defaultModel || catalog.current || (
        catalog.groups?.[0]?.models?.[0]
          ? { provider: catalog.groups[0].id, model: catalog.groups[0].models[0].id }
          : null
      );
      if (!picked?.provider || !picked?.model) throw new Error('没有可用的模型来生成提交说明');
      const res = await client.generateCommitMessage(workspace.workspaceId, picked.provider, picked.model);
      if (res.message) setMessage(res.message);
    } catch (cause) {
      Alert.alert('生成提交说明失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setAiBusy(false);
    }
  };

  const push = () => Alert.alert('推送到已有上游', '只会推送当前分支，不会强制推送。确认继续？', [
    { text: '取消', style: 'cancel' },
    { text: '推送', onPress: () => void run(async () => { const result = await client!.pushGit(workspace!.workspaceId); Alert.alert('推送完成', `${result.branch} 已同步到上游。`); }) },
  ]);

  if (loading && !status) return <LoadingView label="正在读取 Git 状态…" />;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}><IconButton name="chevron-back" size={25} onPress={() => router.back()} /><View style={styles.headerCopy}><Text style={styles.headerTitle}>源代码管理</Text><Text style={styles.path} numberOfLines={1}>{cwd}</Text></View><IconButton name="refresh" onPress={() => void load()} /></View>
      {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {busy && <ActivityIndicator color={colors.textSecondary} />}
      {!status && !loading ? <EmptyState icon="git-branch-outline" title="没有 Git 状态" message="请确认此工作区是 Git 仓库。" /> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.repoCard}>
            <View style={styles.repoTop}><View style={styles.repoIcon}><AppIcon name="git-branch" size={22} color={colors.text} /></View><View style={styles.repoCopy}><Text style={styles.repoName}>{repo?.name || workspace?.title || '仓库'}</Text><Text style={styles.repoPath} numberOfLines={1}>{repo?.root}</Text></View></View>
            <View style={styles.repoActions}><Button title={`分支 · ${branches?.current || 'DETACHED'}`} variant="secondary" icon="git-branch-outline" onPress={() => setBranchPicker(true)} style={styles.repoButton} /><Button title="推送" variant="secondary" icon="cloud-upload-outline" onPress={push} style={styles.repoButton} /></View>
            <View style={styles.counters}><Text style={styles.counter}>{changeCount} 个变更</Text>{!!repo?.ahead && <Text style={styles.counter}>↑ {repo.ahead}</Text>}{!!repo?.behind && <Text style={styles.counter}>↓ {repo.behind}</Text>}{!!repo?.conflictedCount && <Text style={[styles.counter, { color: colors.danger }]}>{repo.conflictedCount} 个冲突</Text>}</View>
          </View>
          <View style={styles.commitBar}><View style={styles.commitCopy}><Text style={styles.commitTitle}>{status?.staged.length || 0} 个文件已暂存</Text><Text style={styles.commitHint}>提交前可点击文件查看差异</Text></View><Button title="提交" icon="checkmark" disabled={!status?.staged.length} onPress={() => setCommitOpen(true)} /></View>
          {changes.map((group) => <View key={group.title} style={styles.group}><SectionHeader title={`${group.title} (${group.items.length})`} />{group.items.map((change) => <View key={`${change.stage}-${change.path}`} style={styles.change}><Pressable style={styles.changeCopy} onPress={() => void openDiff(change)} disabled={change.binary}><View style={styles.changeTitle}><Text style={[styles.changeStatus, { color: change.status === 'D' ? colors.danger : change.status === '?' || change.status === 'A' ? colors.success : colors.warning }]}>{change.status}</Text><Text style={styles.changePath} numberOfLines={1}>{change.path}</Text></View><Text style={styles.diffCount}><Text style={{ color: colors.success }}>+{change.additions}</Text>  <Text style={{ color: colors.danger }}>−{change.deletions}</Text>{change.binary ? ' · 二进制' : ''}</Text></Pressable><IconButton name={change.stage === 'staged' ? 'remove-circle-outline' : 'add-circle-outline'} size={21} onPress={() => void run(() => client!.setGitStaged(workspace!.workspaceId, [change.path], change.stage !== 'staged'))} /></View>)}</View>)}
          <SectionHeader title="最近提交" />
          {(log?.commits || []).slice(0, 15).map((commit) => (
            <Pressable key={commit.hash} style={styles.commit} onPress={() => void openCommit(commit.hash)}>
              <View style={styles.commitDot} />
              <View style={styles.commitBody}>
                <Text style={styles.commitSubject}>{commit.subject}</Text>
                <Text style={styles.commitMeta}>{commit.shortHash} · {commit.author} · {commit.time}</Text>
              </View>
              <AppIcon name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <OptionSheet visible={branchPicker} title="切换本地分支" options={(branches?.branches || []).filter((branch) => !branch.name.startsWith('remotes/')).map((branch) => ({ id: branch.name, title: branch.name, subtitle: branch.upstream || undefined }))} selectedId={branches?.current || undefined} onClose={() => setBranchPicker(false)} onSelect={(branch) => void run(() => client!.checkoutGitBranch(workspace!.workspaceId, branch))} />

      <Modal visible={commitOpen} transparent animationType="fade" onRequestClose={() => setCommitOpen(false)}>
        <View style={styles.dialogRoot}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>提交暂存的变更</Text>
              <Pressable style={styles.aiButton} onPress={() => void generateAiMessage()} disabled={aiBusy}>
                {aiBusy ? <ActivityIndicator size="small" color={colors.accentBlue} /> : <AppIcon name="sparkles-outline" size={15} color={colors.accentBlue} />}
                <Text style={styles.aiButtonText}>{aiBusy ? '生成中…' : 'AI 写说明'}</Text>
              </Pressable>
            </View>
            <TextInput autoFocus multiline value={message} onChangeText={setMessage} placeholder="提交说明" placeholderTextColor={colors.muted} style={styles.dialogInput} />
            <View style={styles.dialogButtons}><Button title="取消" variant="ghost" onPress={() => setCommitOpen(false)} style={styles.dialogButton} /><Button title="提交" disabled={!message.trim() || busy} onPress={() => void run(async () => { const result = await client!.commitGit(workspace!.workspaceId, message.trim()); setMessage(''); setCommitOpen(false); Alert.alert('提交完成', result.shortHash); })} style={styles.dialogButton} /></View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!diff} animationType="slide" onRequestClose={() => setDiff(null)}>
        <SafeAreaView style={styles.safe}><View style={styles.header}><IconButton name="close" onPress={() => setDiff(null)} /><View style={styles.headerCopy}><Text style={styles.previewTitle} numberOfLines={1}>{diff?.path}</Text><Text style={styles.path}>+{diff?.additions} / −{diff?.deletions}{diff?.truncated ? ' · 已截断' : ''}</Text></View></View><ScrollView contentContainerStyle={styles.diffContent}>{diff?.hunks.map((hunk, index) => <View key={index} style={styles.hunk}><Text style={styles.hunkHeader}>{hunk.header}</Text>{hunk.lines.map((line, lineIndex) => <Text key={lineIndex} style={[styles.diffLine, line.startsWith('+') ? styles.addLine : line.startsWith('-') ? styles.delLine : undefined]}>{line || ' '}</Text>)}</View>)}</ScrollView></SafeAreaView>
      </Modal>

      <Modal visible={!!commitDetail} animationType="slide" onRequestClose={() => setCommitDetail(null)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <IconButton name="close" onPress={() => setCommitDetail(null)} />
            <View style={styles.headerCopy}>
              <Text style={styles.previewTitle} numberOfLines={1}>{commitDetail?.shortHash || commitDetail?.hash?.slice(0, 7)}</Text>
              <Text style={styles.path}>{commitDetail?.author} · {commitDetail?.time || commitDetail?.date}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.diffContent}>
            <Text style={styles.commitDetailSubject}>{commitDetail?.subject}</Text>
            {!!commitDetail?.body && <Text style={styles.commitDetailBody}>{commitDetail.body}</Text>}
            {Array.isArray(commitDetail?.files) && commitDetail.files.map((f, idx) => (
              <View key={idx} style={styles.commitFileRow}>
                <Text style={styles.changePath} numberOfLines={1}>{f.path}</Text>
                {(f.additions !== undefined || f.deletions !== undefined) && (
                  <Text style={styles.diffCount}>+{f.additions ?? 0} −{f.deletions ?? 0}</Text>
                )}
              </View>
            ))}
            {Array.isArray(commitDetail?.hunks) && commitDetail.hunks.map((hunk, index) => (
              <View key={index} style={styles.hunk}>
                <Text style={styles.hunkHeader}>{hunk.header}</Text>
                {hunk.lines.map((line, lineIndex) => (
                  <Text key={lineIndex} style={[styles.diffLine, line.startsWith('+') ? styles.addLine : line.startsWith('-') ? styles.delLine : undefined]}>
                    {line || ' '}
                  </Text>
                ))}
              </View>
            ))}
            {typeof commitDetail?.diff === 'string' && commitDetail.diff.length > 0 && (
              <View style={styles.hunk}>
                <Text selectable style={styles.diffLine}>{commitDetail.diff}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 9 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '600' },
  path: { color: colors.muted, fontSize: 10, marginTop: 2 },
  content: { padding: 14, paddingBottom: 40 },
  repoCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 15, marginBottom: 12 },
  repoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  repoIcon: { width: 43, height: 43, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  repoCopy: { flex: 1, minWidth: 0 },
  repoName: { color: colors.text, fontSize: 18, fontWeight: '600' },
  repoPath: { color: colors.muted, fontSize: 10, marginTop: 4 },
  repoActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  repoButton: { flex: 1 },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 13 },
  counter: { color: colors.muted, fontSize: 11 },
  commitBar: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, gap: 10 },
  commitCopy: { flex: 1 },
  commitTitle: { color: colors.text, fontSize: 14, fontWeight: '500' },
  commitHint: { color: colors.muted, fontSize: 11, marginTop: 3 },
  group: { marginTop: 9 },
  change: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 5 },
  changeCopy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  changeTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  changeStatus: { fontFamily: monoFont, fontSize: 13, fontWeight: '700', width: 16 },
  changePath: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  diffCount: { color: colors.muted, fontSize: 10, marginLeft: 25, marginTop: 4 },
  commit: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  commitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
  commitBody: { flex: 1 },
  commitSubject: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  commitMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  dialogRoot: { flex: 1, justifyContent: 'center', backgroundColor: colors.overlay, padding: 20 },
  dialog: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 18 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  aiButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.accentBlueMuted },
  aiButtonText: { color: colors.accentBlue, fontSize: 12, fontWeight: '600' },
  dialogInput: { minHeight: 100, textAlignVertical: 'top', color: colors.text, backgroundColor: colors.input, borderRadius: radii.md, padding: 12, fontSize: 15 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  dialogButton: { minWidth: 90 },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  diffContent: { padding: 12, paddingBottom: 40 },
  commitDetailSubject: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  commitDetailBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginBottom: 12 },
  commitFileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: 6 },
  hunk: { backgroundColor: colors.codeBg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  hunkHeader: { color: colors.purple, backgroundColor: colors.surfaceRaised, fontFamily: monoFont, fontSize: 11, padding: 8 },
  diffLine: { color: colors.codeText, fontFamily: monoFont, fontSize: 11, lineHeight: 18, paddingHorizontal: 8 },
  addLine: { color: isDark ? '#a5d6a7' : '#166534', backgroundColor: isDark ? '#1d3525' : '#dcfce7' },
  delLine: { color: isDark ? '#ef9a9a' : '#991b1b', backgroundColor: isDark ? '#3a2327' : '#fee2e2' },
});
