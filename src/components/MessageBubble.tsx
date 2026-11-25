import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '@/lib/types';
import { formatCompactTokens, formatMessageTimestamp, totalUsageTokens } from '@/lib/chat-format';
import { messageText } from '@/lib/message';
import { useTheme } from '@/state/theme';
import { radii, type ThemePalette } from '@/theme';
import { AppIcon } from './AppIcon';
import { Markdown } from './Markdown';
import { ToolCard } from './ToolCard';
import { TurnProcessCard } from './TurnProcessCard';
import { PresentedFileCard } from './PresentedFileCard';
import { MessageImage as AttachmentImage } from './MessageImage';

function blockText(block: Record<string, unknown>): string {
  return typeof block.text === 'string' ? block.text : '';
}

function ImageBlock({ block, sessionId }: { block: Record<string, unknown>; sessionId: string }) {
  const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment as Record<string, unknown> : undefined;
  const attachmentId = typeof block.attachmentId === 'string' ? block.attachmentId : typeof attachment?.attachmentId === 'string' ? attachment.attachmentId : undefined;
  return (
    <AttachmentImage
      sessionId={sessionId}
      attachmentId={attachmentId}
      inlineData={typeof block.data === 'string' ? block.data : undefined}
      mediaType={typeof block.mediaType === 'string' ? block.mediaType : undefined}
      name={typeof block.name === 'string' ? block.name : undefined}
    />
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  sessionId,
  parentSessionId,
  subagentMode,
  hasTurnProcess = false,
}: {
  message: ChatMessage;
  sessionId: string;
  parentSessionId?: string;
  subagentMode?: 'one-shot' | 'continuable';
  hasTurnProcess?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const role = message.role || 'system';
  const kind = message.kind || '';
  const isUser = role === 'user';

  const copy = () => {
    const text = messageText(message);
    if (!text) return;
    void Clipboard.setStringAsync(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const shareMessage = () => {
    const text = messageText(message);
    if (!text) return;
    void Share.share({ message: text });
  };

  if (kind === 'compaction' || kind === 'retry' || kind === 'wake' || role === 'system') {
    return (
      <Pressable onLongPress={copy} style={styles.event}>
        <AppIcon
          name={kind === 'compaction' ? 'layers-outline' : kind === 'retry' ? 'refresh' : 'information-circle-outline'}
          size={15}
          color={colors.muted}
        />
        <Text style={styles.eventText}>{messageText(message)}</Text>
      </Pressable>
    );
  }

  if (kind === 'tool') return <View style={styles.standaloneTool}><ToolCard block={message} /></View>;

  const blocks = Array.isArray(message.blocks) ? message.blocks : [];
  const hasStructuredBlocks = blocks.length > 0;
  const fallback = messageText(message);
  const tokens = totalUsageTokens(message.usage);
  const timestamp = formatMessageTimestamp(message.time ?? message.timestamp ?? message.createdAt);

  if (isUser) {
    return (
      <View style={styles.userSection}>
        <View style={styles.userRow}>
          <Pressable onLongPress={copy} style={styles.userBubble}>
            {hasStructuredBlocks ? blocks.map((block, index) => {
              if (block.type === 'image') return <ImageBlock key={index} block={block} sessionId={sessionId} />;
              const text = blockText(block);
              return text ? <Text key={index} selectable style={styles.userText}>{text}</Text> : null;
            }) : <Text selectable style={styles.userText}>{fallback}</Text>}
            {Array.isArray(message.images) && message.images.map((image, index) => (
              <ImageBlock key={index} block={image} sessionId={sessionId} />
            ))}
          </Pressable>
        </View>
        <View style={styles.userFooter}>
          <Pressable style={styles.footerIconBtn} onPress={copy} hitSlop={8} accessibilityLabel="复制消息">
            <AppIcon name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? colors.success : colors.muted} />
          </Pressable>
        </View>
        {!!message.turnProcess?.steps?.length && (
          <View style={styles.turnProcessWrap}>
            <TurnProcessCard
              steps={message.turnProcess.steps}
              sessionId={sessionId}
              parentSessionId={parentSessionId}
              subagentMode={subagentMode}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.assistantSection}>
      <View style={styles.assistantBody}>
        {hasStructuredBlocks ? blocks.map((block, index) => {
          if (block.type === 'tool-call' || block.type === 'reasoning') {
            if (hasTurnProcess && block.type === 'tool-call' && !block.argsRaw && !block.output) {
              return null;
            }
            return <ToolCard key={block.callId || index} block={block} />;
          }
          if (block.type === 'image') return <ImageBlock key={index} block={block} sessionId={sessionId} />;
          const text = blockText(block);
          return text ? <View key={index} style={styles.blockText}><Markdown sessionId={sessionId}>{text}</Markdown></View> : null;
        }) : <Markdown sessionId={sessionId}>{fallback}</Markdown>}
        {Array.isArray(message.images) && message.images.map((image, index) => (
          <ImageBlock key={index} block={image} sessionId={sessionId} />
        ))}
      </View>
      {!!message.error && (
        <View style={styles.error}>
          <AppIcon name="alert-circle" size={15} color={colors.danger} />
          <Text style={styles.errorText}>{message.error}</Text>
        </View>
      )}
      <View style={styles.assistantFooter}>
        <Pressable style={styles.footerIconBtn} onPress={copy} hitSlop={8} accessibilityLabel="复制回复">
          <AppIcon name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? colors.success : colors.muted} />
        </Pressable>
        <Pressable style={styles.footerIconBtn} onPress={shareMessage} hitSlop={8} accessibilityLabel="分享回复">
          <AppIcon name="share-social-outline" size={15} color={colors.muted} />
        </Pressable>
        {tokens > 0 && (
          <View style={styles.footerMetaPill}>
            <AppIcon name="server-outline" size={13} color={colors.muted} />
            <Text style={styles.footerMetaText}>用量 {formatCompactTokens(tokens)} tok</Text>
          </View>
        )}
        {!!timestamp && <Text style={styles.footerMetaText}>{timestamp}</Text>}
      </View>
      {Array.isArray(message.presentedFiles) && message.presentedFiles.map((file, index) => (
        <PresentedFileCard key={`${file.path}-${index}`} file={file} sessionId={sessionId} />
      ))}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  userSection: { paddingHorizontal: 18, marginBottom: 14 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: colors.userBubble,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
    gap: 8,
  },
  userText: { color: colors.text, fontSize: 15.5, lineHeight: 23 },
  userFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 6, paddingRight: 2 },
  turnProcessWrap: { marginTop: 4 },
  assistantSection: { paddingHorizontal: 18, marginBottom: 18 },
  assistantBody: { gap: 12 },
  blockText: { minWidth: 0 },
  assistantFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  footerIconBtn: { padding: 2 },
  footerMetaPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerMetaText: { color: colors.muted, fontSize: 11.5 },
  standaloneTool: { paddingHorizontal: 18, marginBottom: 12 },
  event: {
    alignSelf: 'center',
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 4,
    marginBottom: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  eventText: { flexShrink: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 8,
    padding: 10,
    backgroundColor: colors.dangerMuted,
    borderRadius: radii.sm,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18 },
});
