import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fileExtBadge,
  formatBytesCompact,
  formatCompactTokens,
  formatElapsedDuration,
  formatMessageTimestamp,
  formatRelativeCompact,
  formatSessionStats,
  totalUsageTokens,
} from '../src/lib/chat-format';

test('formatCompactTokens formats small, K, and M counts accurately', () => {
  assert.equal(formatCompactTokens(0), '0');
  assert.equal(formatCompactTokens(850), '850');
  assert.equal(formatCompactTokens(1500), '1.5K');
  assert.equal(formatCompactTokens(2000), '2K');
  assert.equal(formatCompactTokens(245_000), '245K');
  assert.equal(formatCompactTokens(60_400_000), '60.4M');
});

test('totalUsageTokens sums positive finite token buckets', () => {
  assert.equal(totalUsageTokens({ uncachedInputTokens: 5000, cacheReadTokens: 230_000, outputTokens: 10_000 }), 245_000);
  assert.equal(totalUsageTokens(undefined), 0);
});

test('formatElapsedDuration formats seconds, minutes+seconds, and hours+minutes', () => {
  assert.equal(formatElapsedDuration(-500), '0 秒');
  assert.equal(formatElapsedDuration(45_000), '45 秒');
  assert.equal(formatElapsedDuration(101_000), '1 分 41 秒');
  assert.equal(formatElapsedDuration(3_720_000), '1 小时 2 分');
});

test('formatMessageTimestamp formats same-day as HH:mm and older dates as M月D日 HH:mm', () => {
  const now = new Date(2026, 10, 25, 10, 0).getTime();
  const todayMorning = new Date(2026, 10, 25, 9, 20).getTime();
  const yesterday = new Date(2026, 10, 24, 18, 40).getTime();
  assert.equal(formatMessageTimestamp(todayMorning, now), '09:20');
  assert.equal(formatMessageTimestamp(yesterday, now), '11月24日 18:40');
  assert.equal(formatMessageTimestamp(undefined, now), '');
});

test('formatRelativeCompact formats minutes, hours, days, and months', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeCompact(now - 20_000, now), '刚刚');
  assert.equal(formatRelativeCompact(now - 32 * 60_000, now), '32分钟');
  assert.equal(formatRelativeCompact(now - 17 * 3_600_000, now), '17小时');
  assert.equal(formatRelativeCompact(now - 12 * 86_400_000, now), '12天');
  assert.equal(formatRelativeCompact(now - 65 * 86_400_000, now), '2个月');
});

test('formatBytesCompact and fileExtBadge format file metadata', () => {
  assert.equal(formatBytesCompact(512), '512 B');
  assert.equal(formatBytesCompact(2048), '2 KB');
  assert.equal(formatBytesCompact(1_572_864), '1.5 MB');
  assert.equal(fileExtBadge('D:\\AI\\OPEN_DSH_HANDOFF.md'), 'MD');
  assert.equal(fileExtBadge('/tmp/data.json'), 'JSON');
  assert.equal(fileExtBadge('/tmp/Makefile'), 'FILE');
});

test('formatSessionStats reproduces turns, steps, tok/s, total tokens, cache rate, and context percentage', () => {
  const formatted = formatSessionStats({
    sessionStats: { turns: 8, steps: 418, decodeTokens: 1800, decodeMs: 100_000 },
    tokenUsage: { uncachedInputTokens: 4_200_000, cacheReadTokens: 56_000_000, outputTokens: 200_000 },
    contextPressure: { pressureTokens: 9_000, contextWindow: 36_000 },
  });
  assert.equal(formatted.hasAny, true);
  assert.equal(formatted.leftText, '8 轮 · 418 步 · 18 tok/s');
  assert.equal(formatted.middleText, '60.4M tok · 缓存命中 93%');
  assert.equal(formatted.contextPercent, 25);
  assert.equal(formatted.contextTone, 'normal');

  const warn = formatSessionStats({ contextPressure: { pressureTokens: 30_000, contextWindow: 36_000 } });
  assert.equal(warn.contextTone, 'warning');
  const danger = formatSessionStats({ contextPressure: { pressureTokens: 34_000, contextWindow: 36_000 } });
  assert.equal(danger.contextTone, 'danger');
});
