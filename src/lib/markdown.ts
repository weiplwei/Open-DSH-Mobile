export type MarkdownBlock =
  | { type: 'paragraph' | 'quote'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; alt: string; localImageId: string; width?: number; height?: number }
  | { type: 'divider' };

const LOCAL_IMAGE_RE = /!\[([^\]]*)\]\(\s*(?:dsh-local-image:|dsh:\/\/local-image\/)([^?\s)]+)(?:\?([^)\s]*))?\s*\)/g;

function parseLocalImageDims(query?: string): { width?: number; height?: number } {
  if (!query) return {};
  const out: { width?: number; height?: number } = {};
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    const num = Number(v);
    if (!Number.isFinite(num) || num <= 0) continue;
    if (k === 'w') out.width = num;
    if (k === 'h') out.height = num;
  }
  return out;
}

function splitParagraphWithImages(text: string): MarkdownBlock[] {
  LOCAL_IMAGE_RE.lastIndex = 0;
  const matches = [...text.matchAll(LOCAL_IMAGE_RE)];
  if (matches.length === 0) return [{ type: 'paragraph', text }];
  const out: MarkdownBlock[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    const before = text.slice(cursor, index).trim();
    if (before) out.push({ type: 'paragraph', text: before });
    const dims = parseLocalImageDims(match[3]);
    out.push({
      type: 'image',
      alt: match[1] || '',
      localImageId: match[2],
      ...dims,
    });
    cursor = index + match[0].length;
  }
  const after = text.slice(cursor).trim();
  if (after) out.push({ type: 'paragraph', text: after });
  return out;
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

/** A deliberately small, bounded Markdown block parser for untrusted model output. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```([^\s`]*)\s*$/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1] || '', text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        const cells = tableCells(lines[index++]);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] || ''));
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: quoted.join('\n') });
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: string[] = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()
      && !/^\s*```/.test(lines[index])
      && !/^\s{0,3}#{1,6}\s+/.test(lines[index])
      && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])
      && !/^\s*>\s?/.test(lines[index])) {
      paragraph.push(lines[index++].trim());
    }
    blocks.push(...splitParagraphWithImages(paragraph.join('\n')));
  }
  return blocks;
}

export type InlineToken = {
  type: 'text' | 'code' | 'bold' | 'italic' | 'strike' | 'link';
  text: string;
  url?: string;
  children?: InlineToken[];
};

function safeLink(value: string): string | undefined {
  return /^https?:\/\/[\w.-]+(?::\d+)?(?:[\/?#][^\s]*)?$/i.test(value) ? value : undefined;
}

/** Inline parsing uses explicit delimiter searches, not nested/backtracking regular expressions. */
export function parseInline(source: string, depth = 0): InlineToken[] {
  if (!source) return [];
  if (depth > 4 || source.length > 100_000) return [{ type: 'text', text: source }];
  const tokens: InlineToken[] = [];
  let plain = '';
  let index = 0;
  const flush = () => { if (plain) { tokens.push({ type: 'text', text: plain }); plain = ''; } };
  while (index < source.length) {
    const rest = source.slice(index);
    let marker: InlineToken['type'] | '' = '';
    let delimiter = '';
    if (rest.startsWith('**') || rest.startsWith('__')) { marker = 'bold'; delimiter = rest.slice(0, 2); }
    else if (rest.startsWith('~~')) { marker = 'strike'; delimiter = '~~'; }
    else if (rest[0] === '`') { marker = 'code'; delimiter = '`'; }
    else if (rest[0] === '*' || rest[0] === '_') { marker = 'italic'; delimiter = rest[0]; }
    if (marker) {
      const end = source.indexOf(delimiter, index + delimiter.length);
      if (end > index + delimiter.length) {
        flush();
        const content = source.slice(index + delimiter.length, end);
        tokens.push({ type: marker, text: content, ...(marker === 'code' ? {} : { children: parseInline(content, depth + 1) }) });
        index = end + delimiter.length;
        continue;
      }
    }
    if (rest[0] === '[') {
      const labelEnd = source.indexOf('](', index + 1);
      if (labelEnd > index + 1) {
        const urlEnd = source.indexOf(')', labelEnd + 2);
        if (urlEnd > labelEnd + 2) {
          const url = safeLink(source.slice(labelEnd + 2, urlEnd));
          if (url) {
            flush();
            const label = source.slice(index + 1, labelEnd);
            tokens.push({ type: 'link', text: label, url, children: parseInline(label, depth + 1) });
            index = urlEnd + 1;
            continue;
          }
        }
      }
    }
    plain += source[index++];
  }
  flush();
  return tokens;
}
