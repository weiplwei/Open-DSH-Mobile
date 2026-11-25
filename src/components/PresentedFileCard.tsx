import { memo, useMemo, useState } from 'react';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { fileExtBadge, formatBytesCompact, formatMessageTimestamp } from '@/lib/chat-format';
import { bytesText } from '@/lib/e2ee';
import type { PresentedFile } from '@/lib/types';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { monoFont, radii, type ThemePalette } from '@/theme';

function basenameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.split('/').pop() || normalized || 'file';
}

function isPreviewableText(filePath: string): boolean {
  return /\.(md|markdown|txt|json|ts|tsx|js|jsx|py|yml|yaml|css|html|sh|log|xml|csv|toml|ini)$/i.test(filePath);
}

export const PresentedFileCard = memo(function PresentedFileCard({
  file,
  sessionId,
}: {
  file: PresentedFile;
  sessionId: string;
}) {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const name = file.title || file.name || basenameOf(file.path);
  const ext = fileExtBadge(file.path);
  const metaText = [
    formatBytesCompact(file.size),
    formatMessageTimestamp(file.mtime),
  ].filter(Boolean).join(' · ');
  const subtitle = file.description || metaText || file.path;

  const downloadAndShare = async () => {
    if (!client || downloading) return;
    setDownloading(true);
    try {
      const result = await client.downloadSessionFile(sessionId, file.path);
      const safeName = basenameOf(file.path).replace(/[^a-zA-Z0-9._-]/g, '_');
      const target = new File(Paths.cache, `open-dsh-${Date.now()}-${safeName}`);
      target.write(result.data);
      await Sharing.shareAsync(target.uri, { mimeType: result.mimeType });
    } catch (cause) {
      Alert.alert('下载失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  const loadPreview = async () => {
    if (!client || previewing) return;
    if (previewText !== null) {
      setPreviewText(null);
      return;
    }
    setPreviewing(true);
    try {
      const result = await client.downloadSessionFile(sessionId, file.path);
      const text = bytesText(result.data.slice(0, 64 * 1024));
      setPreviewText(result.data.length > 64 * 1024 ? `${text}\n\n…（已截断，请下载查看完整文件）` : text);
    } catch (cause) {
      Alert.alert('无法预览', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <AppIcon name="document-outline" size={14} color={colors.accentBlue} />
          <Text style={styles.badgeText} numberOfLines={1}>{ext}</Text>
        </View>
        <Pressable style={styles.copy} onPress={() => setExpanded((value) => !value)}>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => void downloadAndShare()}
          hitSlop={8}
          accessibilityLabel="下载并分享文件"
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.accentBlue} />
          ) : (
            <AppIcon name="download-outline" size={19} color={colors.textSecondary} />
          )}
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => setExpanded((value) => !value)}
          hitSlop={8}
          accessibilityLabel={expanded ? '收起详情' : '展开详情'}
        >
          <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.detail}>
          <Text selectable style={styles.pathText}>{file.path}</Text>
          {!!file.description && <Text style={styles.descText}>{file.description}</Text>}
          {!!metaText && <Text style={styles.metaText}>{metaText}</Text>}
          {isPreviewableText(file.path) && (
            <Pressable style={styles.previewBtn} onPress={() => void loadPreview()}>
              {previewing ? (
                <ActivityIndicator size="small" color={colors.accentBlue} />
              ) : (
                <Text style={styles.previewBtnText}>{previewText !== null ? '收起文本预览' : '在线预览内容'}</Text>
              )}
            </Pressable>
          )}
          {previewText !== null && (
            <ScrollView nestedScrollEnabled style={styles.previewBox}>
              <Text selectable style={styles.previewCode}>{previewText}</Text>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: colors.accentBlueMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  badgeText: { color: colors.accentBlue, fontSize: 9.5, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  detail: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 6,
  },
  pathText: { color: colors.textSecondary, fontFamily: monoFont, fontSize: 11.5, lineHeight: 17 },
  descText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  metaText: { color: colors.muted, fontSize: 11.5 },
  previewBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.accentBlueMuted,
  },
  previewBtnText: { color: colors.accentBlue, fontSize: 12, fontWeight: '600' },
  previewBox: {
    maxHeight: 220,
    marginTop: 4,
    padding: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.codeBg,
  },
  previewCode: { color: colors.codeText, fontFamily: monoFont, fontSize: 11.5, lineHeight: 17 },
});
