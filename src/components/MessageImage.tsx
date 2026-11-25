import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, IconButton } from './AppIcon';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { base64 } from '@scure/base';
import type { ThemePalette } from '@/theme';

const imageCache = new Map<string, string>();

export function MessageImage({ sessionId, attachmentId, localImageId, inlineData, mediaType = 'image/jpeg', name }: {
  sessionId: string;
  attachmentId?: string;
  localImageId?: string;
  inlineData?: string;
  mediaType?: string;
  name?: string;
}) {
  const { client } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const key = attachmentId ? `attachment:${sessionId}:${attachmentId}` : localImageId ? `local:${localImageId}` : '';
  const [uri, setUri] = useState(inlineData ? `data:${mediaType};base64,${inlineData}` : key ? imageCache.get(key) || '' : '');
  const [loading, setLoading] = useState(!uri);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!client || uri) return;
    setLoading(true); setError('');
    try {
      let next = '';
      if (attachmentId) {
        const result = await client.download('/session/attachment', { method: 'POST', body: { sessionId, attachmentId, raw: true } });
        next = `data:${result.mimeType};base64,${base64.encode(result.data)}`;
      } else if (localImageId) {
        const result = await client.post<{ ok: boolean; mediaType: string; data: string }>('/session/local-image', { id: localImageId });
        next = `data:${result.mediaType};base64,${result.data}`;
      }
      if (!next) throw new Error('图片数据不可用');
      if (key) imageCache.set(key, next);
      setUri(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取图片'); }
    finally { setLoading(false); }
  }, [attachmentId, client, key, localImageId, sessionId, uri]);

  useEffect(() => { const initial = setTimeout(() => { void load(); }, 0); return () => clearTimeout(initial); }, [load]);

  const share = async () => {
    if (!uri) return;
    try {
      const encoded = uri.split(',', 2)[1];
      const extension = mediaType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const file = new File(Paths.cache, `open-dsh-${Date.now()}.${extension}`);
      file.write(base64.decode(encoded));
      await Sharing.shareAsync(file.uri, { mimeType: mediaType });
    } catch (cause) { Alert.alert('无法分享图片', cause instanceof Error ? cause.message : '请稍后重试'); }
  };

  if (loading && !uri) return <View style={styles.placeholder}><ActivityIndicator color={colors.muted} /><Text style={styles.placeholderText}>正在读取图片…</Text></View>;
  if (!uri) return <Pressable style={styles.placeholder} onPress={() => void load()}><AppIcon name="image-outline" size={24} color={colors.muted} /><Text style={styles.placeholderText}>{name || error || '图片不可用'} · 点击重试</Text></Pressable>;
  return (
    <>
      <Pressable onPress={() => setExpanded(true)}><Image source={{ uri }} style={styles.image} contentFit="cover" transition={120} /></Pressable>
      <Modal visible={expanded} animationType="fade" onRequestClose={() => setExpanded(false)}>
        <View style={styles.viewer}><View style={styles.viewerHeader}><IconButton name="close" color="#FFFFFF" onPress={() => setExpanded(false)} /><Text style={styles.viewerTitle} numberOfLines={1}>{name || '图片'}</Text><IconButton name="share-outline" color="#FFFFFF" onPress={() => void share()} /></View><Image source={{ uri }} style={styles.fullImage} contentFit="contain" /></View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  placeholder: { width: 240, height: 130, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 15, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  placeholderText: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  image: { width: 240, height: 210, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  viewer: { flex: 1, backgroundColor: '#09090a' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingTop: 50 },
  viewerTitle: { flex: 1, color: '#FFFFFF', textAlign: 'center' },
  fullImage: { flex: 1 },
});
