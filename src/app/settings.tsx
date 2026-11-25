import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton, type IconName } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { triggerForegroundAlert } from '@/lib/alerts';
import { useHost } from '@/state/host';
import { usePrefs } from '@/state/prefs';
import { useTheme, type ThemeMode } from '@/state/theme';
import { radii, shadow, type ThemePalette } from '@/theme';

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  last = false,
  danger = false,
  styles,
  colors,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
  danger?: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemePalette;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && onPress && styles.rowPressed]}
    >
      <View style={[styles.iconBox, danger && { backgroundColor: colors.dangerMuted }]}>
        <AppIcon name={icon} size={19} color={danger ? colors.danger : colors.accentBlue} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {trailing ?? (onPress ? <AppIcon name="chevron-forward" size={17} color={colors.muted} /> : null)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { host, disconnect } = useHost();
  const { prefs, updatePrefs } = usePrefs();
  const { mode, setMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hostDetailsOpen, setHostDetailsOpen] = useState(false);
  const version = Constants.expoConfig?.version || '0.2.0';

  const clearCache = () => {
    try {
      let removed = 0;
      for (const entry of Paths.cache.list()) {
        if (entry instanceof File && entry.name.startsWith('open-dsh-')) {
          entry.delete();
          removed += 1;
        }
      }
      Alert.alert('缓存已清理', removed > 0 ? `已删除 ${removed} 个临时文件。` : '当前没有可清理的临时缓存。');
    } catch (cause) {
      Alert.alert('清理失败', cause instanceof Error ? cause.message : '请稍后重试');
    }
  };

  const forget = () => Alert.alert('断开这台电脑？', '只会删除手机中保存的配对凭据，不会删除电脑上的任何会话。', [
    { text: '取消', style: 'cancel' },
    { text: '断开', style: 'destructive', onPress: () => { void disconnect().then(() => router.replace('/pair')); } },
  ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={24} color={colors.accentBlue} label="返回" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>设置</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>设备</Text>
        <View style={styles.card}>
          <SettingRow
            icon="laptop-outline"
            title="设备管理"
            subtitle={host ? `${host.name} · 局域网直连` : '尚未配对电脑'}
            onPress={() => setHostDetailsOpen((prev) => !prev)}
            trailing={<AppIcon name={hostDetailsOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />}
            styles={styles}
            colors={colors}
          />
          {hostDetailsOpen && host && (
            <View style={styles.detailPanel}>
              <Text style={styles.detailLine}>当前地址：{host.activeAddress || '—'}</Text>
              <Text style={styles.detailLine}>设备 ID：{host.deviceId || '本地安全存储'}</Text>
              <Text style={styles.detailLine}>配对时间：{host.pairedAt ? new Date(host.pairedAt).toLocaleString('zh-CN') : '—'}</Text>
              <Text style={styles.detailLine}>协议：Mobile API v2（AES-256-GCM · HKDF-SHA256）</Text>
            </View>
          )}
          <SettingRow
            icon="hardware-chip-outline"
            title="模型管理"
            subtitle="查看各渠道模型；自建渠道可增删改"
            onPress={() => router.push('/channels')}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="extension-puzzle-outline"
            title="插件管理"
            subtitle="查看电脑端已安装插件的状态与版本"
            onPress={() => router.push('/plugins')}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="sparkles-outline"
            title="Agent 预设"
            subtitle="查看、复制自定义预设与切换默认预设"
            onPress={() => router.push('/presets')}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="bar-chart-outline"
            title="用量统计"
            subtitle="查看会话、Token 与上下文分布"
            onPress={() => router.push('/stats')}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="time-outline"
            title="定时任务"
            subtitle="每日、每周或 Cron 自动运行"
            onPress={() => router.push('/schedule')}
            last
            styles={styles}
            colors={colors}
          />
        </View>

        <Text style={styles.sectionTitle}>外观</Text>
        <View style={styles.segmented}>
          {THEME_OPTIONS.map((option) => {
            const active = mode === option.id;
            return (
              <Pressable
                key={option.id}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => void setMode(option.id)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>提醒与输入</Text>
        <View style={styles.card}>
          <SettingRow
            icon="checkmark-done-outline"
            title="完成通知"
            subtitle="AI 回复完成时在前台弹出本地横幅提醒"
            trailing={(
              <Switch
                value={prefs.notifyOnComplete}
                onValueChange={(value) => void updatePrefs({ notifyOnComplete: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="notifications-outline"
            title="需要处理时通知"
            subtitle="遇到工具审批或提问等待确认时立即提醒"
            trailing={(
              <Switch
                value={prefs.notifyOnInteraction}
                onValueChange={(value) => void updatePrefs({ notifyOnInteraction: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="volume-high-outline"
            title="提示音"
            subtitle="前台本地提醒时播放系统提示音"
            trailing={(
              <Switch
                value={prefs.notifySound}
                onValueChange={(value) => void updatePrefs({ notifySound: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="phone-portrait-outline"
            title="触觉反馈与震动"
            subtitle="发送、停止、审批与提醒触发时轻震提示"
            trailing={(
              <Switch
                value={prefs.hapticFeedback}
                onValueChange={(value) => void updatePrefs({ hapticFeedback: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="musical-notes-outline"
            title="测试声音与震动"
            subtitle="立即触发一次前台本地提醒"
            onPress={() => void triggerForegroundAlert({
              title: 'Open DSH 前台提醒',
              body: '声音与震动提醒工作正常',
              kind: 'complete',
              sound: prefs.notifySound,
              vibrate: prefs.hapticFeedback,
            })}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="return-down-back-outline"
            title="回车发送"
            subtitle="按键盘上的回车直接发送；关闭时可自由换行"
            trailing={(
              <Switch
                value={prefs.enterToSend}
                onValueChange={(value) => void updatePrefs({ enterToSend: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="chatbubble-ellipses-outline"
            title="恢复上次的对话"
            subtitle="下次打开 App 直接回到上次查看的对话"
            trailing={(
              <Switch
                value={prefs.restoreLastSession}
                onValueChange={(value) => void updatePrefs({ restoreLastSession: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="arrow-down-circle-outline"
            title="跟随 AI 回复"
            subtitle="AI 边写边回复时自动滚动保持在底部"
            trailing={(
              <Switch
                value={prefs.followAiReply}
                onValueChange={(value) => void updatePrefs({ followAiReply: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            styles={styles}
            colors={colors}
          />
          <SettingRow
            icon="menu-outline"
            title="点会话直接进对话"
            subtitle="打开后，在左侧栏点击会话会立即收起侧栏"
            trailing={(
              <Switch
                value={prefs.tapSessionClosesDrawer}
                onValueChange={(value) => void updatePrefs({ tapSessionClosesDrawer: value })}
                trackColor={{ true: colors.green, false: colors.borderStrong }}
                thumbColor="#FFFFFF"
              />
            )}
            last
            styles={styles}
            colors={colors}
          />
        </View>

        <Text style={styles.sectionTitle}>维护与隐私</Text>
        <View style={styles.card}>
          <SettingRow
            icon="trash-outline"
            title="清理缓存"
            subtitle="清理本机导出的临时文件与附件缓存"
            onPress={clearCache}
            last
            styles={styles}
            colors={colors}
          />
        </View>

        <Button
          title="断开并忘记这台电脑"
          variant="danger"
          icon="link-outline"
          onPress={forget}
          style={styles.disconnect}
        />

        <Text style={styles.footer}>
          Open DSH v{version} · 独立开源 · 纯局域网 · 无订阅与内购
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '600' },
  headerSpacer: { width: 38 },
  content: { paddingHorizontal: 16, paddingBottom: 38 },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 60,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { opacity: 0.72 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15.5, fontWeight: '600' },
  rowSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  detailPanel: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    marginBottom: 8,
    gap: 4,
  },
  detailLine: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  segmented: {
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.card, ...shadow },
  segmentText: { color: colors.muted, fontSize: 13.5, fontWeight: '500' },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  disconnect: { marginTop: 20 },
  footer: {
    color: colors.faint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 22,
    paddingHorizontal: 16,
  },
});
