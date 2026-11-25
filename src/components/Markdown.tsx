import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { MessageImage } from './MessageImage';
import { highlightCodeLine } from '@/lib/code-highlight';
import { parseInline, parseMarkdown, type InlineToken, type MarkdownBlock } from '@/lib/markdown';
import { useTheme } from '@/state/theme';
import { monoFont, type ThemePalette } from '@/theme';

function InlineText({ tokens, baseStyle, styles }: { tokens: InlineToken[]; baseStyle?: object; styles: ReturnType<typeof createStyles> }) {
  return <>{tokens.map((token, index) => {
    const children = token.children ? <InlineText tokens={token.children} baseStyle={baseStyle} styles={styles} /> : token.text;
    if (token.type === 'code') return <Text key={index} style={[styles.inlineCode, baseStyle]}>{token.text}</Text>;
    if (token.type === 'bold') return <Text key={index} style={[styles.bold, baseStyle]}>{children}</Text>;
    if (token.type === 'italic') return <Text key={index} style={[styles.italic, baseStyle]}>{children}</Text>;
    if (token.type === 'strike') return <Text key={index} style={[styles.strike, baseStyle]}>{children}</Text>;
    if (token.type === 'link') return <Text key={index} style={[styles.link, baseStyle]} onPress={() => token.url && void Linking.openURL(token.url)}>{children}</Text>;
    return <Text key={index} style={baseStyle}>{token.text}</Text>;
  })}</>;
}

function RichText({ text, style, styles }: { text: string; style?: object; styles: ReturnType<typeof createStyles> }) {
  return <Text style={[styles.text, style]}><InlineText tokens={parseInline(text)} styles={styles} /></Text>;
}

function CodeBlock({ language, text, styles, colors }: { language?: string; text: string; styles: ReturnType<typeof createStyles>; colors: ThemePalette }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lines = useMemo(() => (text || ' ').split('\n'), [text]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copyCode = () => {
    void Clipboard.setStringAsync(text || '');
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language || 'code'}</Text>
        <Pressable style={styles.codeCopyButton} onPress={copyCode} hitSlop={8}>
          <AppIcon name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.success : colors.muted} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text selectable style={styles.code}>
          {lines.map((line, lineIndex) => {
            const tokens = highlightCodeLine(line, language);
            return (
              <Text key={lineIndex}>
                {tokens.map((token, tokenIndex) => {
                  const color =
                    token.kind === 'keyword'
                      ? colors.accentBlue
                      : token.kind === 'string'
                        ? colors.success
                        : token.kind === 'comment'
                          ? colors.muted
                          : token.kind === 'number'
                            ? colors.warning
                            : colors.codeText;
                  return (
                    <Text key={tokenIndex} style={{ color }}>
                      {token.text}
                    </Text>
                  );
                })}
                {lineIndex < lines.length - 1 ? '\n' : ''}
              </Text>
            );
          })}
        </Text>
      </ScrollView>
    </View>
  );
}

function Block({
  block,
  sessionId,
  styles,
  colors,
}: {
  block: MarkdownBlock;
  sessionId?: string;
  styles: ReturnType<typeof createStyles>;
  colors: ThemePalette;
}) {
  if (block.type === 'heading') {
    return (
      <RichText
        text={block.text}
        style={[
          styles.heading,
          { fontSize: Math.max(17, 25 - block.level * 1.5), lineHeight: Math.max(25, 34 - block.level * 1.5) },
        ]}
        styles={styles}
      />
    );
  }
  if (block.type === 'code') {
    return <CodeBlock language={block.language} text={block.text} styles={styles} colors={colors} />;
  }
  if (block.type === 'image') {
    if (sessionId) {
      return <MessageImage sessionId={sessionId} localImageId={block.localImageId} name={block.alt || '图片'} />;
    }
    return <RichText text={`[图片: ${block.alt || block.localImageId}]`} styles={styles} />;
  }
  if (block.type === 'list') {
    return (
      <View style={styles.list}>
        {block.items.map((item, index) => (
          <View key={index} style={styles.listItem}>
            <Text style={styles.listMarker}>{block.ordered ? `${index + 1}.` : '•'}</Text>
            <View style={styles.listCopy}><RichText text={item} styles={styles} /></View>
          </View>
        ))}
      </View>
    );
  }
  if (block.type === 'quote') return <View style={styles.quote}><RichText text={block.text} style={styles.quoteText} styles={styles} /></View>;
  if (block.type === 'divider') return <View style={styles.divider} />;
  if (block.type === 'table') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {block.headers.map((cell, index) => <View key={index} style={styles.tableCell}><RichText text={cell} style={styles.tableHeaderText} styles={styles} /></View>)}
          </View>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.tableRow}>
              {row.map((cell, cellIndex) => <View key={cellIndex} style={styles.tableCell}><RichText text={cell} style={styles.tableText} styles={styles} /></View>)}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }
  return <RichText text={block.text} styles={styles} />;
}

export const Markdown = memo(function Markdown({ children, sessionId }: { children: string; sessionId?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blocks = useMemo(() => parseMarkdown(children), [children]);
  return (
    <View style={styles.root}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} sessionId={sessionId} styles={styles} colors={colors} />
      ))}
    </View>
  );
});

const createStyles = (colors: ThemePalette) => StyleSheet.create({
  root: { gap: 11 },
  text: { color: colors.text, fontSize: 15.5, lineHeight: 25 },
  heading: { color: colors.text, fontWeight: '700', marginTop: 4 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through', color: colors.textSecondary },
  inlineCode: {
    fontFamily: monoFont,
    fontSize: 13,
    backgroundColor: colors.inlineCodeBg,
    color: colors.inlineCodeText,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  link: { color: colors.blue, textDecorationLine: 'underline' },
  codeBlock: { backgroundColor: colors.codeBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  codeLanguage: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', fontWeight: '600' },
  codeCopyButton: { padding: 2 },
  codeScroll: { padding: 13 },
  code: { color: colors.codeText, fontFamily: monoFont, fontSize: 12.5, lineHeight: 20 },
  list: { gap: 7 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start' },
  listMarker: { width: 15, color: colors.muted, fontSize: 15, lineHeight: 25 },
  listCopy: { flex: 1 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 4 },
  quoteText: { color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  tableWrap: { borderRadius: 10 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableHeader: { backgroundColor: colors.surfaceRaised },
  tableCell: { width: 150, padding: 10, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  tableHeaderText: { fontWeight: '700', fontSize: 13 },
  tableText: { fontSize: 13, lineHeight: 20 },
});
