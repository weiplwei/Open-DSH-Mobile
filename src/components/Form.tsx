import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from './AppIcon';
import { useTheme } from '@/state/theme';
import type { ThemePalette } from '@/theme';

export function SearchInput({ value, onChangeText, placeholder = '搜索', autoFocus = false }: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.search}>
      <AppIcon name="search-outline" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {!!value && <IconButton name="close-circle" label="清空搜索" size={17} onPress={() => onChangeText('')} />}
    </View>
  );
}

export type OptionItem = { id: string; title: string; subtitle?: string; icon?: 'checkmark' | undefined };

export function OptionSheet({ visible, title, options, selectedId, onSelect, onClose, emptyText = '暂无可选项' }: {
  visible: boolean;
  title: string;
  options: OptionItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  emptyText?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭选择器" />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><IconButton name="close" label="关闭" onPress={onClose} /></View>
          <ScrollView style={styles.options} contentContainerStyle={styles.optionContent} keyboardShouldPersistTaps="handled">
            {!options.length && <Text style={styles.emptyText}>{emptyText}</Text>}
            {options.map((item) => (
              <Pressable key={item.id} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={() => { onSelect(item.id); onClose(); }}>
                <View style={styles.optionCopy}><Text style={styles.optionTitle}>{item.title}</Text>{!!item.subtitle && <Text style={styles.optionSubtitle} numberOfLines={2}>{item.subtitle}</Text>}</View>
                {item.id === selectedId && <AppIcon name="checkmark" size={20} color={colors.accentBlue} />}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.section}><Text style={styles.sectionText}>{title}</Text>{action && onAction && <Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable>}</View>;
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  search: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingLeft: 13, paddingRight: 4, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, height: 42, color: colors.text, fontSize: 14, paddingVertical: 0 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { maxHeight: '78%', minHeight: 280, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.borderStrong },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.faint, alignSelf: 'center', marginTop: 9 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  options: { flexGrow: 0 },
  optionContent: { paddingHorizontal: 12, paddingBottom: 18 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 13, minHeight: 58 },
  optionPressed: { backgroundColor: colors.cardPressed },
  optionCopy: { flex: 1, marginRight: 12 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  emptyText: { color: colors.muted, textAlign: 'center', padding: 30 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 20, paddingBottom: 9 },
  sectionText: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionAction: { color: colors.textSecondary, fontSize: 12 },
});
