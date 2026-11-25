import type { QueueItem } from './types';

export type ComposerTrigger = {
  kind: 'slash' | 'mention';
  query: string;
  start: number;
};

export function detectComposerTrigger(text: string): ComposerTrigger | null {
  if (!text) return null;
  if (text.startsWith('/')) {
    const slashMatch = /^\/([^\s]*)$/.exec(text);
    if (slashMatch) return { kind: 'slash', query: slashMatch[1], start: 0 };
  }
  const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(text);
  if (mentionMatch) {
    const atIndex = text.lastIndexOf('@');
    if (atIndex >= 0) {
      return { kind: 'mention', query: mentionMatch[1], start: atIndex };
    }
  }
  return null;
}

export function applyComposerTrigger(text: string, start: number, replacement: string): string {
  const head = text.slice(0, start);
  const body = replacement.endsWith(' ') ? replacement : `${replacement} `;
  return `${head}${body}`;
}

export function queueItemText(item: QueueItem): string {
  const content = item.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}
