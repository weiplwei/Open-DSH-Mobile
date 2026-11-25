import { memo, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import type { ComposerTrigger } from '@/lib/composer-mentions';
import type { FileReferenceItem, SessionReferenceItem, SlashCommand } from '@/lib/types';
import { useTheme } from '@/state/theme';
import { shadow, type ThemePalette } from '@/theme';

export const ComposerSuggestions = memo(function ComposerSuggestions({
  trigger,
  commands,
  files,
  sessions,
  loading,
  onPick,
}: {
  trigger: ComposerTrigger | null;
  commands: SlashCommand[];
  files: FileReferenceItem[];
  sessions: SessionReferenceItem[];
  loading: boolean;
  onPick: (replacement: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const matchedCommands = useMemo(() => {
    if (!trigger || trigger.kind !== 'slash') return [];
    const q = trigger.query.toLowerCase();
    const base: SlashCommand[] = [
      { name: 'goal', description: '设置或查看长期任务目标' },
      { name: 'plan', description: '进入或退出计划模式' },
      ...commands,
    ];
    const seen = new Set<string>();
    return base
      .filter((cmd) => {
        const key = cmd.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return !q || key.includes(q) || cmd.description.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [commands, trigger]);

  if (!trigger) return null;
  if (trigger.kind === 'slash' && matchedCommands.length === 0) return null;
  if (trigger.kind === 'mention' && !loading && files.length === 0 && sessions.length === 0) return null;

  return (
    <View style={styles.card}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {trigger.kind === 'slash' && matchedCommands.map((cmd, idx) => (
          <Pressable
            key={cmd.name}
            style={({ pressed }) => [styles.row, idx > 0 && styles.rowBorder, pressed && styles.pressed]}
            onPress={() => onPick(`/${cmd.name}`)}
          >
            <Text style={styles.slashName}>/{cmd.name}</Text>
            <Text style={styles.desc} numberOfLines={1}>{cmd.description}</Text>
          </Pressable>
        ))}

        {trigger.kind === 'mention' && (
          <>
            {loading && files.length === 0 && sessions.length === 0 && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.accentBlue} />
                <Text style={styles.loadingText}>正在查找文件与对话…</Text>
              </View>
            )}
            {files.slice(0, 6).map((file, idx) => (
              <Pressable
                key={`file-${file.path}-${idx}`}
                style={({ pressed }) => [styles.row, idx > 0 && styles.rowBorder, pressed && styles.pressed]}
                onPress={() => onPick(`@${file.path}`)}
              >
                <AppIcon name={file.kind === 'directory' || file.kind === 'folder' ? 'folder-outline' : 'document-outline'} size={15} color={colors.accentBlue} />
                <Text style={styles.itemTitle} numberOfLines={1}>{file.path}</Text>
              </Pressable>
            ))}
            {sessions.slice(0, 4).map((sess, idx) => {
              const mention = sess.mention || `@${sess.label}`;
              return (
                <Pressable
                  key={`sess-${sess.sessionId}-${idx}`}
                  style={({ pressed }) => [styles.row, (files.length > 0 || idx > 0) && styles.rowBorder, pressed && styles.pressed]}
                  onPress={() => onPick(mention.startsWith('@') ? mention : `@${mention}`)}
                >
                  <AppIcon name="chatbubble-outline" size={15} color={colors.purple} />
                  <Text style={styles.itemTitle} numberOfLines={1}>{sess.label || sess.sessionId}</Text>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: {
    marginBottom: 8,
    maxHeight: 200,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  scroll: { maxHeight: 200 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceRaised },
  slashName: { color: colors.accentBlue, fontSize: 14, fontWeight: '600' },
  desc: { flex: 1, color: colors.muted, fontSize: 12.5, textAlign: 'right' },
  itemTitle: { flex: 1, color: colors.text, fontSize: 13.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  loadingText: { color: colors.muted, fontSize: 12.5 },
});
