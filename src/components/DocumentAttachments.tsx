import { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DshClient } from '@/lib/api';
import type { UploadedDocument } from '@/lib/attachments';
import { useTheme } from '@/state/theme';
import type { ThemePalette } from '@/theme';
import { AppIcon } from './AppIcon';

export type { UploadedDocument } from '@/lib/attachments';

export function DocumentChips({ documents, onRemove }: { documents: UploadedDocument[]; onRemove: (id: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!documents.length) return null;
  return <View style={styles.chips}>{documents.map((document) => <View key={document.id} style={styles.chip}><AppIcon name="document-outline" size={16} color={colors.textSecondary} /><View style={styles.chipCopy}><Text style={styles.chipName} numberOfLines={1}>{document.name}</Text><Text style={styles.chipPath} numberOfLines={1}>{document.path}</Text></View><Pressable hitSlop={8} onPress={() => onRemove(document.id)}><AppIcon name="close-circle" size={18} color={colors.muted} /></Pressable></View>)}</View>;
}

export function DocumentButton({ client, sessionId, documents, onChange, disabled }: {
  client: DshClient;
  sessionId?: string;
  documents: UploadedDocument[];
  onChange: (documents: UploadedDocument[]) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [progress, setProgress] = useState('');
  const pick = async () => {
    if (progress || disabled) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const remaining = Math.max(0, 4 - documents.length);
      const assets = result.assets.slice(0, remaining);
      let nextDocuments = documents;
      for (const asset of assets) {
        if (asset.size && asset.size > 20 * 1024 * 1024) {
          Alert.alert('文件过大', `${asset.name} 超过 20 MB，请选择较小的文件。`);
          continue;
        }
        setProgress(`读取 ${asset.name}`);
        const encoded = await new File(asset.uri).base64();
        const uploaded = await client.uploadBase64(asset.name, encoded, {
          sessionId,
          onProgress: (received, total) => setProgress(`上传 ${asset.name} ${Math.round(received / Math.max(total, 1) * 100)}%`),
        });
        nextDocuments = [...nextDocuments, { id: uploaded.uploadId, name: uploaded.name, path: uploaded.path, size: uploaded.bytes }];
        onChange(nextDocuments);
      }
    } catch (cause) {
      Alert.alert('附件上传失败', cause instanceof Error ? cause.message : '请稍后重试');
    } finally { setProgress(''); }
  };
  return <Pressable disabled={disabled || !!progress || documents.length >= 4} onPress={() => void pick()} hitSlop={8} style={styles.button}>
    {progress ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <AppIcon name="attach" size={23} color={disabled || documents.length >= 4 ? colors.borderStrong : colors.textSecondary} />}
  </Pressable>;
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  chips: { gap: 7, paddingBottom: 9 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipCopy: { flex: 1, minWidth: 0 },
  chipName: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  chipPath: { color: colors.muted, fontSize: 10, marginTop: 2 },
  button: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
