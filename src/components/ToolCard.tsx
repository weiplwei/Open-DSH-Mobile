import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { Markdown } from './Markdown';
import { useTheme } from '@/state/theme';
import { monoFont, radii, type ThemePalette } from '@/theme';

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function toolSubtitle(block: Record<string, unknown>): string {
  const args = textValue(block.argsRaw ?? block.arguments ?? block.args);
  if (!args) return typeof block.summary === 'string' ? block.summary : '';
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const value = parsed.command ?? parsed.file_path ?? parsed.path ?? parsed.query ?? parsed.pattern ?? parsed.url ?? parsed.description ?? parsed.title;
    if (typeof value === 'string') return value.length > 140 ? `${value.slice(0, 140)}…` : value;
  } catch { /* Keep a compact raw fallback for streaming/partial arguments. */ }
  const compact = args.replace(/\s+/g, ' ');
  return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact;
}

function stateColor(state: string, colors: ThemePalette): string {
  if (/error|fail|denied|blocked/.test(state)) return colors.danger;
  if (/run|pending|progress|wait/.test(state)) return colors.warning;
  return colors.success;
}

export function ToolCard({ block }: { block: Record<string, unknown> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const name = typeof block.name === 'string' ? block.name : typeof block.toolName === 'string' ? block.toolName : '工具调用';
  const state = typeof block.state === 'string' ? block.state : 'completed';
  const subtitle = toolSubtitle(block);
  const args = textValue(block.argsRaw ?? block.arguments ?? block.args);
  const output = textValue(block.output ?? block.result ?? block.summary);
  const detail = useMemo(() => [
    args ? `参数\n${args}` : '',
    output && output !== args ? `结果\n${output}` : '',
  ].filter(Boolean).join('\n\n'), [args, output]);
  const icon = name === 'todo_write' ? 'list' : /bash|run_code/.test(name) ? 'terminal' : /read|write|edit/.test(name) ? 'document-text' : /search|grep|glob/.test(name) ? 'search' : 'construct';
  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => detail && setExpanded((value) => !value)} accessibilityRole="button">
        <View style={styles.icon}><AppIcon name={icon} size={15} color={colors.textSecondary} /></View>
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={expanded ? undefined : 2}>{subtitle}</Text>}
        </View>
        <View style={[styles.stateDot, { backgroundColor: stateColor(state, colors) }]} />
        {!!detail && <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />}
      </Pressable>
      {expanded && !!detail && <View style={styles.detail}><Text selectable style={styles.detailText}>{detail}</Text></View>}
      {block.type === 'reasoning' && expanded && <Markdown>{textValue(block.text)}</Markdown>}
    </View>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: { backgroundColor: colors.surfaceRaised, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9 },
  icon: { width: 29, height: 29, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.textSecondary, fontFamily: monoFont, fontSize: 12, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  detail: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12, maxHeight: 420 },
  detailText: { color: colors.textSecondary, fontFamily: monoFont, fontSize: 11, lineHeight: 18 },
});
