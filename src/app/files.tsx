import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { EmptyState, ErrorBanner, LoadingView } from '@/components/Feedback';
import { SearchInput } from '@/components/Form';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import type { DirectoryEntry, DirectoryRoot } from '@/lib/types';
import { monoFont, radii, type ThemePalette } from '@/theme';

type Preview = { name: string; text: string; mime: string; bytes: Uint8Array; truncated: boolean };

function fileSize(value?: number) {
  if (value === undefined) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function joinChildPath(parent: string, name: string): string {
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  const cleaned = parent.replace(/[/\\]+$/, '');
  return `${cleaned}${sep}${name}`;
}

export default function FilesScreen() {
  const params = useLocalSearchParams<{ path?: string; sessionId?: string }>();
  const sessionId = params.sessionId ? String(params.sessionId) : undefined;
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [path, setPath] = useState(params.path ? String(params.path) : '');
  const [roots, setRoots] = useState<DirectoryRoot[]>([]);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [createKind, setCreateKind] = useState<'folder' | 'file' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [actionEntry, setActionEntry] = useState<DirectoryEntry | null>(null);
  const [renamingEntry, setRenamingEntry] = useState<DirectoryEntry | null>(null);
  const [renameText, setRenameText] = useState('');

  const load = useCallback(async (target = path) => {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const response = await client.listDirectory(target || undefined);
      setPath(response.listing.path);
      setEntries(response.listing.entries || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取目录'); }
    finally { setLoading(false); }
  }, [client, path]);

  useEffect(() => {
    const initial = setTimeout(() => {
      void load(params.path ? String(params.path) : '');
      client?.listDirectoryRoots().then((res) => setRoots(res.roots || [])).catch(() => undefined);
    }, 0);
    return () => clearTimeout(initial);
    // Directory navigation explicitly calls load with its new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const visible = useMemo(
    () => entries.filter((entry) => (showHidden || !entry.hidden) && (!query.trim() || entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))),
    [entries, query, showHidden],
  );

  const open = async (entry: DirectoryEntry) => {
    if (entry.kind === 'folder') { await load(entry.path); return; }
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.readTextFile(entry.path, sessionId);
      setPreview({ name: entry.name, text: result.text, mime: result.mimeType, bytes: result.data, truncated: result.rangeEnd !== undefined && result.rangeEnd + 1 < result.size });
    } catch (cause) { Alert.alert('无法打开文件', cause instanceof Error ? cause.message : '请稍后重试'); }
    finally { setBusy(false); }
  };

  const upload = async () => {
    if (!client || !path) return;
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if (asset.size && asset.size > 20 * 1024 * 1024) { Alert.alert('文件过大', '单个上传文件不能超过 20 MB。'); return; }
    setBusy(true);
    try {
      const encoded = await new File(asset.uri).base64();
      await client.uploadBase64(asset.name, encoded, { sessionId, destPath: path });
      await load(path);
    } catch (cause) { Alert.alert('上传失败', cause instanceof Error ? cause.message : '请稍后重试'); }
    finally { setBusy(false); }
  };

  const submitCreate = async () => {
    if (!client || !path || !createName.trim() || busy) return;
    setBusy(true);
    try {
      if (createKind === 'folder') {
        await client.createDirectory(path, createName.trim());
      } else if (createKind === 'file') {
        await client.createFile(joinChildPath(path, createName.trim()), createContent, sessionId);
      }
      setCreateKind(null);
      setCreateName('');
      setCreateContent('');
      await load(path);
    } catch (cause) {
      Alert.alert('创建失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!client || !renamingEntry || !renameText.trim() || busy) return;
    setBusy(true);
    try {
      await client.renameFile(renamingEntry.path, renameText.trim(), sessionId);
      setRenamingEntry(null);
      await load(path);
    } catch (cause) {
      Alert.alert('重命名失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (entry: DirectoryEntry) => {
    if (!client) return;
    Alert.alert('删除文件', `确认删除「${entry.name}」？此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await client.deleteFile(entry.path, sessionId);
              await load(path);
            } catch (cause) {
              Alert.alert('删除失败', cause instanceof Error ? cause.message : '请稍后重试');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const sharePreview = async () => {
    if (!preview || preview.truncated) return;
    const target = new File(Paths.cache, `open-dsh-${Date.now()}-${preview.name}`);
    target.write(preview.bytes);
    await Sharing.shareAsync(target.uri, { mimeType: preview.mime });
  };

  if (loading && !entries.length) return <LoadingView label="正在读取电脑目录…" />;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton name="chevron-back" size={25} onPress={() => router.back()} />
        <View style={styles.headerCopy}><Text style={styles.headerTitle}>电脑文件</Text><Text style={styles.path} numberOfLines={1}>{path || '主目录'}</Text></View>
        <IconButton name="folder-outline" size={20} label="新建文件夹" onPress={() => { setCreateKind('folder'); setCreateName(''); }} disabled={busy || !path} />
        <IconButton name="document-outline" size={20} label="新建文件" onPress={() => { setCreateKind('file'); setCreateName(''); setCreateContent(''); }} disabled={busy || !path} />
        <IconButton name={showHidden ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowHidden((value) => !value)} />
        <IconButton name="cloud-upload-outline" onPress={() => void upload()} disabled={busy} />
      </View>
      {roots.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rootsRow}>
          {roots.map((root) => {
            const active = path.toLowerCase().startsWith(root.path.toLowerCase());
            return (
              <Pressable key={root.path} style={[styles.rootChip, active && styles.rootChipActive]} onPress={() => void load(root.path)}>
                <Text style={[styles.rootChipText, active && styles.rootChipTextActive]}>{root.name || root.path}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.searchWrap}>
        <SearchInput value={query} onChangeText={setQuery} placeholder="筛选当前目录" />
      </View>
      {!!error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {busy && <ActivityIndicator color={colors.textSecondary} style={styles.busy} />}
      <FlatList
        data={visible}
        keyExtractor={(entry) => entry.path}
        contentContainerStyle={[styles.list, !visible.length && styles.empty]}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => void open(item)}>
              <View style={styles.fileIcon}><AppIcon name={item.kind === 'folder' ? 'folder' : 'document-text-outline'} size={21} color={item.kind === 'folder' ? colors.warning : colors.textSecondary} /></View>
              <View style={styles.fileCopy}><Text style={styles.fileName} numberOfLines={1}>{item.name}</Text><Text style={styles.fileMeta}>{item.kind === 'folder' ? '文件夹' : fileSize(item.size)}</Text></View>
            </Pressable>
            {item.kind === 'file' ? (
              <IconButton name="ellipsis-horizontal" size={18} onPress={() => setActionEntry(item)} />
            ) : (
              <AppIcon name="chevron-forward" size={16} color={colors.muted} />
            )}
          </View>
        )}
        ListEmptyComponent={() => <EmptyState icon="folder-open-outline" title="目录为空" message={query ? '当前目录没有匹配项。' : '可以新建或上传一个文件到这里。'} />}
      />

      <Modal visible={!!actionEntry} transparent animationType="fade" onRequestClose={() => setActionEntry(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionEntry(null)} />
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{actionEntry?.name}</Text>
            <Pressable style={styles.sheetRow} onPress={() => { const t = actionEntry!; setActionEntry(null); void open(t); }}>
              <AppIcon name="eye-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.sheetLabel}>查看内容</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { const t = actionEntry!; setActionEntry(null); setRenameText(t.name); setRenamingEntry(t); }}>
              <AppIcon name="create-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.sheetLabel}>重命名</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { const t = actionEntry!; setActionEntry(null); confirmDelete(t); }}>
              <AppIcon name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.sheetLabel, { color: colors.danger }]}>删除文件</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createKind !== null} transparent animationType="fade" onRequestClose={() => setCreateKind(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{createKind === 'folder' ? '新建文件夹' : '新建文件'}</Text>
            <TextInput autoFocus value={createName} onChangeText={setCreateName} placeholder={createKind === 'folder' ? '文件夹名称' : '文件名（如 notes.md）'} placeholderTextColor={colors.muted} style={styles.dialogInput} />
            {createKind === 'file' && (
              <TextInput multiline value={createContent} onChangeText={setCreateContent} placeholder="初始文件内容（可选）" placeholderTextColor={colors.muted} style={[styles.dialogInput, styles.contentInput]} />
            )}
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setCreateKind(null)} style={styles.dialogBtn} />
              <Button title="创建" disabled={!createName.trim() || busy} onPress={() => void submitCreate()} style={styles.dialogBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!renamingEntry} transparent animationType="fade" onRequestClose={() => setRenamingEntry(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>重命名文件</Text>
            <TextInput autoFocus value={renameText} onChangeText={setRenameText} placeholder="新文件名" placeholderTextColor={colors.muted} style={styles.dialogInput} selectTextOnFocus />
            <View style={styles.dialogButtons}>
              <Button title="取消" variant="ghost" onPress={() => setRenamingEntry(null)} style={styles.dialogBtn} />
              <Button title="保存" disabled={!renameText.trim() || busy} onPress={() => void submitRename()} style={styles.dialogBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}><IconButton name="close" onPress={() => setPreview(null)} /><View style={styles.headerCopy}><Text style={styles.previewTitle} numberOfLines={1}>{preview?.name}</Text><Text style={styles.path}>{preview?.truncated ? '仅预览前 512 KB' : preview?.mime}</Text></View><IconButton name="share-outline" onPress={() => void sharePreview()} disabled={!!preview?.truncated} /></View>
          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}><ScrollView horizontal showsHorizontalScrollIndicator><Text selectable style={styles.code}>{preview?.text}</Text></ScrollView></ScrollView>
          <View style={styles.previewFooter}><Button title="关闭" variant="secondary" onPress={() => setPreview(null)} /></View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 9 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '600' },
  path: { color: colors.muted, fontSize: 10, marginTop: 2 },
  rootsRow: { gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  rootChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  rootChipActive: { backgroundColor: colors.accentBlueMuted, borderColor: colors.accentBlue },
  rootChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  rootChipTextActive: { color: colors.accentBlue, fontWeight: '600' },
  searchWrap: { paddingHorizontal: 14, marginBottom: 6 },
  busy: { paddingVertical: 5 },
  list: { paddingHorizontal: 14, paddingBottom: 30 },
  empty: { flexGrow: 1 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: radii.md, marginBottom: 3 },
  pressed: { backgroundColor: colors.surfaceRaised },
  fileIcon: { width: 35, height: 35, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  fileCopy: { flex: 1, minWidth: 0 },
  fileName: { color: colors.text, fontSize: 14 },
  fileMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  previewTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  preview: { flex: 1, backgroundColor: colors.codeBg, marginHorizontal: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  previewContent: { padding: 14 },
  code: { color: colors.codeText, fontFamily: monoFont, fontSize: 12, lineHeight: 19 },
  previewFooter: { padding: 14 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheetCard: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: 16 },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetLabel: { flex: 1, color: colors.text, fontSize: 14.5 },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: 18, gap: 10 },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  dialogInput: { backgroundColor: colors.input, color: colors.text, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong, fontSize: 15, padding: 12 },
  contentInput: { minHeight: 100, textAlignVertical: 'top' },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  dialogBtn: { minWidth: 84 },
});
