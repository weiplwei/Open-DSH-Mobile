import type { MessageUsage, SessionProjections } from './types';

export function formatCompactTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(Math.round(count));
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function totalUsageTokens(usage?: MessageUsage | null): number {
  if (!usage) return 0;
  const pick = (v?: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return (
    pick(usage.uncachedInputTokens) +
    pick(usage.outputTokens) +
    pick(usage.cacheReadTokens) +
    pick(usage.cacheWriteTokens)
  );
}

export function formatMessageTimestamp(ms?: number | null, nowMs: number = Date.now()): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date(nowMs);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isSameDay) return `${hours}:${minutes}`;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日 ${hours}:${minutes}`;
}

export function formatRelativeCompact(ms?: number | null, nowMs: number = Date.now()): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `${days}天`;
  return `${Math.floor(days / 30)}个月`;
}

export function formatBytesCompact(bytes?: number | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

export function fileExtBadge(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return 'FILE';
  const ext = base.slice(dot + 1).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ext ? ext.slice(0, 4) : 'FILE';
}

export function formatElapsedDuration(ms: number): string {
  const clamped = Math.max(0, Number.isFinite(ms) ? Math.floor(ms / 1000) : 0);
  if (clamped < 60) return `${clamped} 秒`;
  if (clamped < 3600) {
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes} 分 ${seconds} 秒`;
  }
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  return `${hours} 小时 ${minutes} 分`;
}

export type FormattedSessionStats = {
  leftText: string;
  middleText: string;
  contextPercent: number | null;
  contextTone: 'normal' | 'warning' | 'danger';
  hasAny: boolean;
};

export function formatSessionStats(projections?: SessionProjections | null): FormattedSessionStats {
  if (!projections || typeof projections !== 'object') {
    return { leftText: '', middleText: '', contextPercent: null, contextTone: 'normal', hasAny: false };
  }

  const stats = projections.sessionStats;
  const turns = typeof stats?.turns === 'number' && stats.turns > 0 ? stats.turns : 0;
  const steps = typeof stats?.steps === 'number' && stats.steps > 0 ? stats.steps : 0;
  const decodeTokens = typeof stats?.decodeTokens === 'number' ? stats.decodeTokens : 0;
  const decodeMs = typeof stats?.decodeMs === 'number' ? stats.decodeMs : 0;
  const tokPerSec = decodeMs > 0 && decodeTokens > 0 ? Math.round(decodeTokens / (decodeMs / 1000)) : 0;

  const leftParts = [
    turns > 0 ? `${turns} 轮` : '',
    steps > 0 ? `${steps} 步` : '',
    tokPerSec > 0 ? `${tokPerSec} tok/s` : '',
  ].filter(Boolean);
  const leftText = leftParts.join(' · ');

  const tokenUsage = projections.tokenUsage;
  const totalTokens = totalUsageTokens(tokenUsage);
  const uncachedInput = typeof tokenUsage?.uncachedInputTokens === 'number' && tokenUsage.uncachedInputTokens > 0 ? tokenUsage.uncachedInputTokens : 0;
  const cacheRead = typeof tokenUsage?.cacheReadTokens === 'number' && tokenUsage.cacheReadTokens > 0 ? tokenUsage.cacheReadTokens : 0;
  const cacheWrite = typeof tokenUsage?.cacheWriteTokens === 'number' && tokenUsage.cacheWriteTokens > 0 ? tokenUsage.cacheWriteTokens : 0;
  const inputTotal = uncachedInput + cacheRead + cacheWrite;

  const middleParts = [
    totalTokens > 0 ? `${formatCompactTokens(totalTokens)} tok` : '',
    inputTotal > 0 && cacheRead > 0 ? `缓存命中 ${Math.round((cacheRead / inputTotal) * 100)}%` : '',
  ].filter(Boolean);
  const middleText = middleParts.join(' · ');

  const pressure = projections.contextPressure;
  const pressureTokens = typeof pressure?.pressureTokens === 'number' ? pressure.pressureTokens : -1;
  const contextWindow = typeof pressure?.contextWindow === 'number' ? pressure.contextWindow : 0;
  const contextPercent = contextWindow > 0 && pressureTokens >= 0
    ? Math.min(100, Math.round((pressureTokens / contextWindow) * 100))
    : null;
  const contextTone: 'normal' | 'warning' | 'danger' =
    contextPercent === null ? 'normal' : contextPercent >= 90 ? 'danger' : contextPercent >= 75 ? 'warning' : 'normal';

  const hasAny = Boolean(leftText || middleText || contextPercent !== null);
  return { leftText, middleText, contextPercent, contextTone, hasAny };
}
