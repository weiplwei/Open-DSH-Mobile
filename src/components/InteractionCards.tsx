import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { Button } from './Button';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export type ApprovalRequest = { rpcId: string; sessionId: string; approvalId: string; toolName?: string; reason?: string; fact?: string; factHighlight?: boolean; command?: string };
export type QuestionOption = { label: string; description?: string };
export type QuestionItem = { id: string; header?: string; question: string; detail?: string; options?: QuestionOption[]; multiSelect?: boolean; intent?: { kind: string; approve?: string } };
export type QuestionRequest = { rpcId: string; sessionId: string; questions: QuestionItem[] };

export function InteractionCards({ approval, question, onApproval, onQuestion, busy }: {
  approval: ApprovalRequest | null;
  question: QuestionRequest | null;
  onApproval: (outcome: 'allowed-once' | 'rejected') => void;
  onQuestion: (answers: { id: string; selected: string[]; custom?: string }[]) => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [answers, setAnswers] = useState<Record<string, { selected: string[]; custom: string }>>({});
  if (approval) return (
    <View style={styles.card}>
      <View style={styles.titleRow}><View style={styles.icon}><AppIcon name="shield-checkmark-outline" size={20} color={colors.warning} /></View><View style={styles.titleCopy}><Text style={styles.title}>需要你的批准</Text><Text style={styles.subtitle}>{approval.toolName || '工具'} 请求继续执行</Text></View></View>
      {!!approval.reason && <Text style={styles.body}>{approval.reason}</Text>}
      {!!approval.fact && <Text style={[styles.fact, approval.factHighlight && styles.highlight]}>{approval.fact}</Text>}
      {!!approval.command && <Text selectable style={styles.command}>{approval.command}</Text>}
      <View style={styles.actions}><Button title="拒绝" variant="secondary" disabled={busy} onPress={() => onApproval('rejected')} style={styles.action} /><Button title={busy ? '正在提交…' : '允许一次'} disabled={busy} onPress={() => onApproval('allowed-once')} style={styles.action} /></View>
    </View>
  );
  if (question) {
    const normalized = question.questions.map((item) => ({ id: item.id, selected: answers[item.id]?.selected || [], ...(answers[item.id]?.custom ? { custom: answers[item.id].custom } : {}) }));
    const complete = question.questions.every((item) => normalized.find((answer) => answer.id === item.id)?.selected.length || answers[item.id]?.custom.trim());
    return <View style={styles.card}><View style={styles.titleRow}><View style={styles.icon}><AppIcon name="help-circle-outline" size={20} color={colors.textSecondary} /></View><View style={styles.titleCopy}><Text style={styles.title}>{question.questions[0]?.intent?.kind === 'plan-review' ? '计划待审' : '助手需要你确认'}</Text><Text style={styles.subtitle}>回答后会继续当前任务</Text></View></View>
      {question.questions.map((item) => <View key={item.id} style={styles.question}>{!!item.header && <Text style={styles.questionHeader}>{item.header}</Text>}<Text style={styles.questionTitle}>{item.question}</Text>{!!item.detail && <Text style={styles.body}>{item.detail}</Text>}<View style={styles.options}>{(item.options || []).map((option) => { const selected = answers[item.id]?.selected.includes(option.label); return <Pressable key={option.label} style={[styles.option, selected && styles.optionSelected]} onPress={() => setAnswers((current) => { const existing = current[item.id]?.selected || []; const selectedItems = item.multiSelect ? existing.includes(option.label) ? existing.filter((label) => label !== option.label) : [...existing, option.label] : [option.label]; return { ...current, [item.id]: { selected: selectedItems, custom: current[item.id]?.custom || '' } }; })}><AppIcon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={selected ? colors.accentBlue : colors.muted} /><View style={styles.optionCopy}><Text style={styles.optionTitle}>{option.label}</Text>{!!option.description && <Text style={styles.optionDescription}>{option.description}</Text>}</View></Pressable>; })}</View><TextInput value={answers[item.id]?.custom || ''} onChangeText={(custom) => setAnswers((current) => ({ ...current, [item.id]: { selected: current[item.id]?.selected || [], custom } }))} placeholder="其他答案（可选）" placeholderTextColor={colors.muted} style={styles.input} /></View>)}
      <Button title={busy ? '正在提交…' : question.questions[0]?.intent?.approve || '提交回答'} disabled={busy || !complete} onPress={() => onQuestion(normalized)} />
    </View>;
  }
  return null;
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: { marginHorizontal: 14, marginBottom: 10, padding: 15, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  titleCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 12 },
  fact: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
  highlight: { color: colors.warning },
  command: { color: colors.codeText, backgroundColor: colors.codeBg, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  action: { flex: 1 },
  question: { marginTop: 16 },
  questionHeader: { color: colors.muted, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  questionTitle: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '500' },
  options: { gap: 7, marginTop: 10 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  optionSelected: { backgroundColor: colors.selected, borderWidth: 1, borderColor: colors.accentBlue },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.text, fontSize: 13 },
  optionDescription: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  input: { color: colors.text, backgroundColor: colors.input, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, marginTop: 8, fontSize: 13 },
});
