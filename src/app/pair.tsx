import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, BrandMark, IconButton } from '@/components/AppIcon';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/Feedback';
import { pairWithHost } from '@/lib/pairing';
import { useHost } from '@/state/host';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';

export default function PairScreen() {
  const { connect } = useHost();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handled = useRef(false);

  const pair = useCallback(async (text: string) => {
    if (busy || handled.current) return;
    handled.current = true;
    setBusy(true);
    setError('');
    try {
      const { parsePairingText } = await import('@/lib/pairing');
      const host = await pairWithHost(parsePairingText(text), Crypto.getRandomBytes, Platform.OS === 'ios' ? 'Open DSH iPhone' : 'Open DSH Android', Platform.OS);
      await connect(host);
      router.replace('/sessions');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      handled.current = false;
    } finally { setBusy(false); }
  }, [busy, connect]);
  const pairRef = useRef(pair);
  useEffect(() => { pairRef.current = pair; }, [pair]);
  useEffect(() => {
    void Linking.getInitialURL().then((url) => { if (url?.startsWith('dshpair://')) void pairRef.current(url); });
    const subscription = Linking.addEventListener('url', ({ url }) => { if (url.startsWith('dshpair://')) void pairRef.current(url); });
    return () => subscription.remove();
  }, []);

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { setError('需要相机权限才能扫码；也可以从剪贴板粘贴配对文本。'); return; }
    }
    handled.current = false;
    setScannerOpen(true);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}><BrandMark size={62} /><View style={styles.titleRow}><Text style={styles.title}>Open DSH</Text><View style={styles.lanBadge}><Text style={styles.lanBadgeText}>LAN</Text></View></View><Text style={styles.subtitle}>把你的 DSH 工作台装进口袋</Text></View>
          <View style={styles.secureNote}><AppIcon name="shield-checkmark-outline" size={20} color={colors.success} /><View style={styles.secureCopy}><Text style={styles.secureTitle}>直连你的电脑</Text><Text style={styles.secureText}>仅使用局域网地址，业务请求端到端加密，配对凭据只保存在本机。</Text></View></View>
          <View style={styles.steps}>
            {['在电脑 DSH 中打开 Mobile / Relay 面板', '生成配对二维码，并允许这台设备', '手机与电脑连接同一 Wi-Fi 后扫码'].map((step, index) => <View key={step} style={styles.stepRow}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}
          </View>
          <Button title={busy ? '正在加密配对…' : '扫描配对二维码'} icon="scan-outline" onPress={() => void openScanner()} busy={busy} style={styles.scanButton} />
          <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>或粘贴配对内容</Text><View style={styles.line} /></View>
          <TextInput style={styles.input} value={manual} onChangeText={setManual} placeholder="dshpair://v1?data=…" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} multiline />
          <View style={styles.row}><Button title="读取剪贴板" variant="secondary" icon="clipboard-outline" onPress={() => { void Clipboard.getStringAsync().then((value) => { setManual(value); if (value) void pair(value); }); }} style={styles.flex} /><Button title="配对" variant="secondary" disabled={!manual.trim()} busy={busy} onPress={() => void pair(manual)} style={styles.flexSmall} /></View>
          <ErrorBanner message={error} />
          <Text style={styles.footer}>独立开源客户端 · 无账号 · 无订阅 · 无内购</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.cameraPage}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { setScannerOpen(false); void pair(data); }} />
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}><IconButton name="close" label="关闭扫码" size={25} color="#FFFFFF" onPress={() => setScannerOpen(false)} /><Text style={styles.cameraTitle}>扫描配对二维码</Text><View style={styles.cameraSpacer} /></View>
            <View style={styles.viewfinder}><View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} /><View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} /></View>
            <Text style={styles.cameraHint}>将电脑屏幕上的二维码放入框内</Text>
            <Pressable style={styles.close} onPress={() => setScannerOpen(false)}><Text style={styles.closeText}>取消</Text></Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 38, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  title: { color: colors.text, fontSize: 33, fontWeight: '700', letterSpacing: -0.8 },
  lanBadge: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  lanBadgeText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 9 },
  secureNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  secureCopy: { flex: 1 },
  secureTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  secureText: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
  steps: { marginVertical: 24, gap: 17 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  stepNumber: { width: 26, height: 26, borderRadius: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  scanButton: { minHeight: 52 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 23 },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, flex: 1 },
  or: { color: colors.muted, fontSize: 11 },
  input: { minHeight: 80, maxHeight: 140, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceRaised, padding: 14, textAlignVertical: 'top', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, marginTop: 11 },
  flex: { flex: 1.35 },
  flexSmall: { flex: 0.65 },
  footer: { color: colors.faint, textAlign: 'center', fontSize: 11, lineHeight: 18, marginTop: 24 },
  cameraPage: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 24 },
  cameraHeader: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
  cameraTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  cameraSpacer: { width: 38 },
  viewfinder: { width: 250, height: 250, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#FFFFFF' },
  topLeft: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 14 },
  topRight: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 14 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 14 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 14 },
  cameraHint: { color: '#ddd', fontSize: 13, backgroundColor: '#0009', padding: 8, borderRadius: 8 },
  close: { backgroundColor: '#222d', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 45 },
  closeText: { color: '#fff', fontSize: 15 },
});
