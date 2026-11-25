import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import { OptionSheet, SectionHeader } from '@/components/Form';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import type { ScheduleDeliveryRecord, ScheduleRecord, ScheduleTarget, WorkspaceItem } from '@/lib/types';
import { buildScheduleTiming, scheduleTimingLabel } from '@/lib/schedule';
import { radii, type ThemePalette } from '@/theme';

const weekNames = ['日', '一', '二', '三', '四', '五', '六'];

function dateLabel(value?: string | number) {
  if (!value) return '尚未运行';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ScheduleScreen() {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ScheduleRecord | null>(null);
  const [workspacePicker, setWorkspacePicker] = useState(false);
  const [targetKind, setTargetKind] = useState<'new_once' | 'new'>('new_once');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'cron' | 'every' | 'after'>('daily');
  const [time, setTime] = useState('09:00');
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [cron, setCron] = useState('0 9 * * 1-5');
  const [intervalMinutes, setIntervalMinutes] = useState('60');

  const [historyFor, setHistoryFor] = useState<ScheduleRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<ScheduleDeliveryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const [response, workspaceResponse] = await Promise.all([client.listSchedules(), client.listWorkspaces()]);
      setRecords(response.records || []); setWorkspaces(workspaceResponse.items || []);
      if (!workspaceId && workspaceResponse.items[0]) setWorkspaceId(workspaceResponse.items[0].workspaceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取定时任务'); }
    finally { setLoading(false); }
  }, [client, workspaceId]);

  useEffect(() => { const initial = setTimeout(() => { void load(); }, 0); return () => clearTimeout(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  };

  const openCreate = () => {
    setEditingRecord(null);
    setTitle('');
    setPrompt('');
    setFrequency('daily');
    setTime('09:00');
    setWeekdays([1, 2, 3, 4, 5]);
    setCron('0 9 * * 1-5');
    setIntervalMinutes('60');
    setTargetKind('new_once');
    setEditorOpen(true);
  };

  const openEdit = (record: ScheduleRecord) => {
    setEditingRecord(record);
    setTitle(record.title || '');
    setPrompt(record.prompt || '');
    const t = record.timing;
    if (t?.kind === 'weekly') {
      setFrequency('weekly');
      const w = t.weekly as { time?: string; weekdays?: number[] } | undefined;
      setTime(w?.time || '09:00');
      setWeekdays(Array.isArray(w?.weekdays) && w.weekdays.length ? w.weekdays : [1, 2, 3, 4, 5]);
    } else if (t?.kind === 'cron') {
      setFrequency('cron');
      const c = t.cron as { expression?: string } | undefined;
      setCron(c?.expression || '0 9 * * 1-5');
    } else if (t?.kind === 'every') {
      setFrequency('every');
      const secs = Number(t.every_seconds ?? (Number(t.every_ms || 3600000) / 1000));
      setIntervalMinutes(String(Math.max(1, Math.round(secs / 60))));
    } else if (t?.kind === 'after') {
      setFrequency('after');
      const secs = Number(t.after_seconds ?? (Number(t.after_ms || 600000) / 1000));
      setIntervalMinutes(String(Math.max(1, Math.round(secs / 60))));
    } else {
      setFrequency('daily');
      const d = t?.daily as { time?: string } | undefined;
      setTime(d?.time || '09:00');
    }
    if (record.target?.kind === 'new') setTargetKind('new');
    else setTargetKind('new_once');
    setEditorOpen(true);
  };

  const openHistory = async (record: ScheduleRecord) => {
    if (!client) return;
    setHistoryFor(record);
    setHistoryRecords([]);
    setHistoryLoading(true);
    try {
      const res = await client.getScheduleHistory(record.id, record.sessionId);
      setHistoryRecords(res.records || []);
    } catch (cause) {
      Alert.alert('无法读取执行记录', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setHistoryLoading(false);
    }
  };

  const save = () => run(async () => {
    if (!title.trim() || !prompt.trim()) throw new Error('任务名称和提示词不能为空');
    const workspace = workspaces.find((item) => item.workspaceId === workspaceId);
    const timing = buildScheduleTiming({
      frequency,
      time,
      weekdays,
      cron,
      intervalMinutes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    if (editingRecord) {
      await client!.updateSchedule(
        editingRecord.id,
        {
          title: title.trim(),
          prompt: prompt.trim(),
          timing,
          ...(workspace?.path ? { target: { kind: targetKind, create: { cwd: workspace.path } } } : {}),
        },
        editingRecord.updatedAt,
      );
    } else {
      if (!workspace?.path) throw new Error('请选择工作区');
      const target: ScheduleTarget = { kind: targetKind, create: { cwd: workspace.path } };
      await client!.createSchedule({ title: title.trim(), prompt: prompt.trim(), target, timing });
    }
    setEditorOpen(false);
    setEditingRecord(null);
    setTitle('');
    setPrompt('');
  });

  const remove = (record: ScheduleRecord) => Alert.alert('删除定时任务', `确认删除“${record.title}”？历史会话不会删除。`, [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: () => void run(() => client!.deleteSchedule(record.id, record.sessionId || '', record.updatedAt)) },
  ]);

  const selectedWorkspace = workspaces.find((item) => item.workspaceId === workspaceId);
  if (loading && !records.length) return <LoadingView label="正在读取定时任务…" />;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}><IconButton name="chevron-back" size={25} onPress={() => router.back()} /><View style={styles.headerCopy}><Text style={styles.headerTitle}>定时任务</Text><Text style={styles.path}>让助手按计划自动工作</Text></View><View style={styles.add}><IconButton name="add" color={colors.primaryText} onPress={openCreate} /></View></View>
      {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
      <FlatList
        data={records}
        keyExtractor={(record) => record.id}
        contentContainerStyle={[styles.list, !records.length && styles.empty]}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.scheduleIcon}><AppIcon name="time-outline" size={20} color={item.active === false ? colors.muted : colors.textSecondary} /></View>
              <View style={styles.cardCopy}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardStatus}>{item.active === false ? '已暂停' : item.status || '已启用'} · {dateLabel(item.scheduledAt)}</Text></View>
              <Switch value={item.active !== false} disabled={busy} onValueChange={(active) => void run(() => client!.setScheduleActive(item.id, active, item.updatedAt))} trackColor={{ true: colors.accentBlue, false: colors.borderStrong }} thumbColor="#FFFFFF" />
            </View>
            <Text style={styles.prompt} numberOfLines={3}>{item.prompt}</Text>
            <View style={styles.timing}><AppIcon name="repeat-outline" size={14} color={colors.muted} /><Text style={styles.timingText}>{scheduleTimingLabel(item.timing)}</Text></View>
            <View style={styles.cardActions}>
              <Button title="立即运行" variant="secondary" icon="play" disabled={busy || item.active === false} onPress={() => void run(async () => { const result = await client!.runSchedule(item.id); if (!result.ran) Alert.alert('暂未运行', result.code === 'schedule_execution_pending' ? '目标会话已有任务在处理，请稍后重试。' : '请稍后重试。'); })} style={styles.actionButton} />
              <IconButton name="create-outline" label="编辑" disabled={busy} onPress={() => openEdit(item)} />
              <IconButton name="receipt-outline" label="执行记录" disabled={busy} onPress={() => void openHistory(item)} />
              <IconButton name="trash-outline" label="删除" color={colors.danger} disabled={busy} onPress={() => remove(item)} />
            </View>
          </View>
        )}
        ListEmptyComponent={() => <EmptyState icon="time-outline" title="还没有定时任务" message="创建每日报告、每周检查或自定义 cron 任务。" action={<Button title="新建任务" onPress={openCreate} />} />}
      />

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}><IconButton name="close" onPress={() => setEditorOpen(false)} /><Text style={styles.headerTitle}>{editingRecord ? '编辑定时任务' : '新建定时任务'}</Text></View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <SectionHeader title="任务" />
            <TextInput value={title} onChangeText={setTitle} placeholder="名称，例如：每日项目检查" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={prompt} onChangeText={setPrompt} placeholder="要交给助手的完整提示词" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.promptInput]} />
            <SectionHeader title="运行位置" />
            <Pressable style={styles.selector} onPress={() => setWorkspacePicker(true)}><AppIcon name="folder-outline" size={19} color={colors.textSecondary} /><View style={styles.selectorCopy}><Text style={styles.selectorTitle}>{selectedWorkspace?.title || selectedWorkspace?.path || '选择工作区'}</Text><Text style={styles.selectorHint}>{targetKind === 'new_once' ? '固定复用首轮建出的会话' : '每次新建独立会话'}</Text></View><AppIcon name="chevron-down" size={16} color={colors.muted} /></Pressable>
            <View style={[styles.segments, { marginTop: 10 }]}>
              {([['new_once', '同一任务会话'], ['new', '每次新建会话']] as const).map(([id, label]) => (
                <Pressable key={id} style={[styles.segment, targetKind === id && styles.segmentActive]} onPress={() => setTargetKind(id)}>
                  <Text style={[styles.segmentText, targetKind === id && styles.segmentTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <SectionHeader title="重复规则" />
            <View style={styles.segments}>
              {([['daily', '每天'], ['weekly', '每周'], ['every', '间隔'], ['after', '延时'], ['cron', 'Cron']] as const).map(([id, label]) => (
                <Pressable key={id} style={[styles.segment, frequency === id && styles.segmentActive]} onPress={() => setFrequency(id)}>
                  <Text style={[styles.segmentText, frequency === id && styles.segmentTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {frequency === 'cron' ? (
              <TextInput value={cron} onChangeText={setCron} placeholder="分 时 日 月 周" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
            ) : frequency === 'every' || frequency === 'after' ? (
              <TextInput value={intervalMinutes} onChangeText={setIntervalMinutes} placeholder="分钟数，如 60" placeholderTextColor={colors.muted} keyboardType="numeric" style={styles.input} />
            ) : (
              <>
                {frequency === 'weekly' && <View style={styles.weekdays}>{weekNames.map((name, day) => <Pressable key={name} style={[styles.weekday, weekdays.includes(day) && styles.weekdayActive]} onPress={() => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])}><Text style={[styles.weekdayText, weekdays.includes(day) && styles.weekdayTextActive]}>{name}</Text></Pressable>)}</View>}
                <TextInput value={time} onChangeText={setTime} placeholder="HH:mm" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={styles.input} />
              </>
            )}
            <Text style={styles.timeZone}>时区：{Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</Text>
            <Button title={busy ? '保存中…' : editingRecord ? '保存修改' : '创建任务'} onPress={() => void save()} disabled={busy || !title.trim() || !prompt.trim()} style={styles.createButton} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!historyFor} animationType="slide" onRequestClose={() => setHistoryFor(null)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <IconButton name="close" onPress={() => setHistoryFor(null)} />
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle} numberOfLines={1}>{historyFor?.title || '执行记录'}</Text>
              <Text style={styles.path}>最近 20 条运行投递</Text>
            </View>
          </View>
          {historyLoading ? (
            <View style={styles.historyCenter}><ActivityIndicator color={colors.accentBlue} /></View>
          ) : (
            <FlatList
              data={historyRecords}
              keyExtractor={(rec) => rec.messageId}
              contentContainerStyle={[styles.list, !historyRecords.length && styles.empty]}
              ListEmptyComponent={() => <EmptyState icon="receipt-outline" title="暂无执行记录" message="任务运行后，每次投递的时间和目标会话会出现在这里。" />}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardStatus}>投递时间：{dateLabel(item.deliveredAt || item.scheduledAt)}</Text>
                  {!!item.prompt && <Text style={styles.prompt} numberOfLines={3}>{item.prompt}</Text>}
                  {!!item.targetSessionId && (
                    <Button
                      title="打开执行会话"
                      variant="secondary"
                      onPress={() => {
                        const sid = item.targetSessionId!;
                        const t = historyFor?.title || '定时任务会话';
                        setHistoryFor(null);
                        router.push({ pathname: '/chat/[sessionId]', params: { sessionId: sid, title: t } });
                      }}
                      style={{ marginTop: 10 }}
                    />
                  )}
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      <OptionSheet visible={workspacePicker} title="运行工作区" options={workspaces.map((workspace) => ({ id: workspace.workspaceId, title: workspace.title || workspace.path || workspace.workspaceId, subtitle: workspace.path }))} selectedId={workspaceId} onClose={() => setWorkspacePicker(false)} onSelect={setWorkspaceId} />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  path: { color: colors.muted, fontSize: 11, marginTop: 2 },
  add: { backgroundColor: colors.primary, borderRadius: 11, overflow: 'hidden' },
  list: { padding: 14, paddingBottom: 35 },
  empty: { flexGrow: 1 },
  historyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 15, marginBottom: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  scheduleIcon: { width: 39, height: 39, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardStatus: { color: colors.muted, fontSize: 11, marginTop: 3 },
  prompt: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 11 },
  timing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  timingText: { color: colors.muted, fontSize: 11 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  actionButton: { flex: 1, marginRight: 4 },
  form: { padding: 18, paddingBottom: 40 },
  input: { color: colors.text, backgroundColor: colors.input, borderRadius: radii.md, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, marginBottom: 11 },
  promptInput: { minHeight: 130, textAlignVertical: 'top' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 13, borderRadius: radii.md },
  selectorCopy: { flex: 1 },
  selectorTitle: { color: colors.text, fontSize: 14 },
  selectorHint: { color: colors.muted, fontSize: 10, marginTop: 3 },
  segments: { flexDirection: 'row', padding: 3, backgroundColor: colors.surfaceRaised, borderRadius: 11, marginBottom: 13 },
  segment: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontSize: 12.5 },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  weekday: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  weekdayActive: { backgroundColor: colors.primary },
  weekdayText: { color: colors.muted, fontSize: 13 },
  weekdayTextActive: { color: colors.primaryText, fontWeight: '600' },
  timeZone: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 6 },
  createButton: { marginTop: 16 },
});
