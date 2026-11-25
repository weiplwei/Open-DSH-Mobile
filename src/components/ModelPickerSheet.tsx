import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from './AppIcon';
import type { ModelGroup, ModelItem, ModelSelection } from '@/lib/types';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export function ModelPickerSheet({
  visible,
  groups,
  selection,
  selectedModel,
  onSelectModel,
  onSelectEffort,
  onClose,
}: {
  visible: boolean;
  groups: ModelGroup[];
  selection: ModelSelection | null;
  selectedModel?: ModelItem & { provider: string; providerName: string };
  onSelectModel: (provider: string, modelId: string) => void;
  onSelectEffort: (effortId: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const efforts = selectedModel?.reasoning?.efforts || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭模型选择器" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>模型与思考等级</Text>
            <IconButton name="close" label="关闭" color={colors.textSecondary} onPress={onClose} />
          </View>

          {efforts.length > 0 && (
            <View style={styles.effortSection}>
              <Text style={styles.sectionLabel}>思考等级</Text>
              <View style={styles.effortRow}>
                {efforts.map((effort) => {
                  const active = selection?.reasoningEffort === effort.id;
                  return (
                    <Pressable
                      key={effort.id}
                      style={[styles.effortChip, active && styles.effortChipActive]}
                      onPress={() => onSelectEffort(effort.id)}
                    >
                      <Text style={[styles.effortText, active && styles.effortTextActive]}>
                        {effort.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {groups.length === 0 ? (
              <Text style={styles.empty}>暂无可用模型</Text>
            ) : (
              groups.map((group) => (
                <View key={group.id} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.name}</Text>
                  {group.models.map((model) => {
                    const selected = selection?.provider === group.id && selection?.model === model.id;
                    const subtitle = [model.badge, model.description].filter(Boolean).join(' · ');
                    return (
                      <Pressable
                        key={`${group.id}:${model.id}`}
                        style={({ pressed }) => [
                          styles.option,
                          selected && styles.optionSelected,
                          pressed && styles.optionPressed,
                        ]}
                        onPress={() => {
                          onSelectModel(group.id, model.id);
                          onClose();
                        }}
                      >
                        <View style={styles.optionCopy}>
                          <Text style={styles.optionTitle}>{model.name}</Text>
                          {!!subtitle && <Text style={styles.optionSubtitle} numberOfLines={2}>{subtitle}</Text>}
                        </View>
                        {selected && <AppIcon name="checkmark" size={20} color={colors.accentBlue} />}
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '82%',
    minHeight: 300,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.faint, alignSelf: 'center', marginTop: 9 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  effortSection: { paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  effortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  effortChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  effortChipActive: {
    backgroundColor: colors.accentBlueMuted,
    borderColor: colors.accentBlue,
  },
  effortText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  effortTextActive: { color: colors.accentBlue, fontWeight: '600' },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 20 },
  group: { marginBottom: 10 },
  groupTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, minHeight: 54 },
  optionSelected: { backgroundColor: colors.selected },
  optionPressed: { backgroundColor: colors.cardPressed },
  optionCopy: { flex: 1, marginRight: 12 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  empty: { color: colors.muted, textAlign: 'center', padding: 30 },
});
