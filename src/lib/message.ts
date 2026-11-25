import type { ChatMessage, SessionItem } from './types';

/** Session list previews are structured objects in Mobile API v2, never render them directly. */
export function sessionPreviewText(item: Pick<SessionItem, 'lastMessage' | 'cwd'>): string {
  if (typeof item.lastMessage === 'string' && item.lastMessage) return item.lastMessage;
  if (item.lastMessage && typeof item.lastMessage === 'object' && typeof item.lastMessage.text === 'string' && item.lastMessage.text) {
    return item.lastMessage.text;
  }
  return item.cwd || '打开会话';
}

/** Project the server's structured history item into a useful plain-text MVP row. */
export function messageText(message: ChatMessage): string {
  if (typeof message.text === 'string' && message.text) return message.text;
  if (typeof message.content === 'string' && message.content) return message.content;
  if (Array.isArray(message.content)) {
    const text = message.content.map((part) => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n');
    if (text) return text;
  }
  if (Array.isArray(message.blocks)) {
    const text = message.blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .filter(Boolean)
      .join('\n');
    if (text) return text;
    const tools = message.blocks
      .filter((block) => block.type === 'tool-call')
      .map((block) => `🔧 ${block.name || '工具'}${block.state ? ` · ${block.state}` : ''}`)
      .join('\n');
    if (tools) return tools;
  }
  if (message.kind === 'tool') {
    return [`🔧 ${message.name || '工具'}`, message.summary, message.state].filter(Boolean).join('\n');
  }
  if (message.kind === 'compaction') {
    return message.summary || `上下文压缩 · ${message.state || '已记录'}`;
  }
  if (message.kind === 'retry') {
    return `模型请求重试${message.retry ? ` #${message.retry}` : ''} · ${message.status || '等待中'}`;
  }
  if (Array.isArray(message.images) && message.images.length) return `〔${message.images.length} 张图片〕`;
  if (typeof message.error === 'string' && message.error) return message.error;
  return message.kind ? `〔${message.kind}〕` : '〔无文本内容〕';
}
