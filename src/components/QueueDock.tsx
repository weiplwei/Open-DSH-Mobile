import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { queueItemText } from '@/lib/composer-mentions';
import type { QueueItem } from '@/lib/types';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export const QueueDock = memo(function QueueDock({
  items,
  busyId,
  onSteer,
  onEdit,
  onRemove,
}: {
  items: QueueItem[];
  busyId: string;
  onSteer: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const queued = useMemo(() => items.filter((item) => item.placement === 'queued'), [items]);
  if (queued.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppIcon name="time-outline" size={14} color={colors.accentBlue} />
        <Text style={styles.headerText}>待发送队列 ({queued.length})</Text>
      </View>
      {queued.map((item, idx) => {
        const text = queueItemText(item);
        const busy = busyId === item.id;
        const isEditing = editingId === item.id;

        return (
          <View key={item.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
            {isEditing ? (
              <View style={styles.editWrap}>
                <TextInput
                  value={draftText}
                  onChangeText={setDraftText}
                  multiline
                  autoFocus
                  style={styles.editInput}
                  placeholder="修改排队消息"
                  placeholderTextColor={colors.muted}
                />
                <View style={styles.editActions}>
                  <Pressable style={styles.smallBtn} onPress={() => setEditingId(null)}>
                    <Text style={styles.smallBtnText}>取消</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, styles.saveBtn]}
                    onPress={() => {
                      const next = draftText.trim();
                      if (!next) return;
                      onEdit(item.id, next);
                      setEditingId(null);
                    }}
                  >
                    <Text style={styles.saveBtnText}>保存</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.itemText} numberOfLines={2}>{text || '〔排队消息〕'}</Text>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accentBlue} />
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.pillBtn}
                      onPress={() => onSteer(item.id)}
                      hitSlop={4}
                    >
                      <Text style={styles.pillBtnText}>插话</Text>
                    </Pressable>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setDraftText(text);
                        setEditingId(item.id);
                      }}
                      hitSlop={6}
                    >
                      <AppIcon name="create-outline" size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => onRemove(item.id)}
                      hitSlop={6}
                    >
                      <AppIcon name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  card: {
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  headerText: { color: colors.accentBlue, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.accentBlueMuted,
  },
  pillBtnText: { color: colors.accentBlue, fontSize: 11.5, fontWeight: '600' },
  iconBtn: { padding: 3 },
  editWrap: { flex: 1, gap: 6 },
  editInput: {
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13.5,
    maxHeight: 90,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised },
  smallBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  saveBtn: { backgroundColor: colors.accentBlue },
  saveBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
