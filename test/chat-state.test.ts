import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLiveStepsFrame,
  findActiveTurnStartedAt,
  isSkeletonOnlyAssistantMessage,
  mergeMessages,
  messageKey,
  visibleChatMessages,
} from '../src/lib/chat-state';
import type { ChatMessage } from '../src/lib/types';

test('messageKey prefers id, messageId, clientMessageId, then seq', () => {
  assert.equal(messageKey({ id: 'm1', seq: 10 }), 'm1');
  assert.equal(messageKey({ messageId: 'm2', seq: 10 }), 'm2');
  assert.equal(messageKey({ clientMessageId: 'c1', seq: 10 }), 'c1');
  assert.equal(messageKey({ seq: 42 }), 'seq:42');
  assert.equal(messageKey({ role: 'user' }, 3), 'user-3');
});

test('mergeMessages preserves earlier pages on incremental append and deduplicates updates', () => {
  const earlier: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'first', seq: 1 },
    { id: 'a1', role: 'assistant', text: 'reply 1', seq: 2 },
  ];
  const latest: ChatMessage[] = [
    { id: 'u2', role: 'user', text: 'second', seq: 5, turn: 2 },
    { id: 'a2', role: 'assistant', text: 'partial', seq: 6, turn: 2 },
  ];

  // User loaded earlier page via prepend
  const combined = mergeMessages(latest, earlier, 'prepend');
  assert.deepEqual(combined.map((m) => m.id), ['u1', 'a1', 'u2', 'a2']);

  // Subsequent incremental poll brings updated u2 (with turnProcess) and new a3
  const incremental: ChatMessage[] = [
    { id: 'u2', role: 'user', text: 'second', seq: 5, turn: 2, turnProcess: { count: 1, steps: [{ kind: 'think', summary: '思考' }] } },
    { id: 'a2', role: 'assistant', text: 'final reply 2', seq: 6, turn: 2 },
    { id: 'a3', role: 'assistant', text: 'follow up', seq: 7, turn: 2 },
  ];
  const merged = mergeMessages(combined, incremental, 'append');
  assert.deepEqual(merged.map((m) => m.id), ['u1', 'a1', 'u2', 'a2', 'a3']);
  assert.equal(merged[2].turnProcess?.count, 1);
  assert.equal(merged[3].text, 'final reply 2');
});

test('applyLiveStepsFrame handles full replace, incremental upsert, and turn switch', () => {
  const initial = { turn: 1, steps: [{ key: 'think:0', step: { kind: 'think' as const, summary: '分析', state: 'running' } }] };
  const updated = applyLiveStepsFrame(initial, {
    full: false,
    turn: 1,
    steps: [
      { key: 'think:0', step: { kind: 'think', summary: '分析完成', state: 'ok' } },
      { key: 'tool:c1', step: { kind: 'tool', callId: 'c1', name: 'read', summary: 'a.ts', state: 'running' } },
    ],
  });
  assert.equal(updated.turn, 1);
  assert.equal(updated.steps.length, 2);
  assert.equal(updated.steps[0].step.state, 'ok');
  assert.equal(updated.steps[1].step.name, 'read');

  const nextTurn = applyLiveStepsFrame(updated, {
    full: false,
    turn: 2,
    steps: [{ key: 'think:0', step: { kind: 'think', summary: '新轮次', state: 'running' } }],
  });
  assert.equal(nextTurn.turn, 2);
  assert.equal(nextTurn.steps.length, 1);
  assert.equal(nextTurn.steps[0].step.summary, '新轮次');
});

test('visibleChatMessages filters skeleton-only tool rows covered by turnProcess', () => {
  const messages: ChatMessage[] = [
    {
      id: 'u1',
      role: 'user',
      text: '帮我看下代码',
      seq: 1,
      turn: 1,
      turnProcess: { count: 1, steps: [{ kind: 'tool', callId: 'c1', name: 'read', summary: 'index.ts' }] },
    },
    {
      id: 'a-skel',
      role: 'assistant',
      text: '',
      seq: 2,
      turn: 1,
      blocks: [{ type: 'tool-call', callId: 'c1', name: 'read' }],
    },
    {
      id: 'a-final',
      role: 'assistant',
      text: '看完了。',
      seq: 3,
      turn: 1,
      blocks: [{ type: 'text', text: '看完了。' }],
    },
    {
      id: 'a-other',
      role: 'assistant',
      text: '',
      seq: 4,
      turn: 2,
      blocks: [{ type: 'tool-call', callId: 'c2', name: 'bash', argsRaw: '{"command":"ls"}' }],
    },
  ];
  assert.equal(isSkeletonOnlyAssistantMessage(messages[1], new Set([1])), true);
  assert.equal(isSkeletonOnlyAssistantMessage(messages[3], new Set([1])), false);
  assert.deepEqual(visibleChatMessages(messages).map((m) => m.id), ['u1', 'a-final', 'a-other']);
});

test('findActiveTurnStartedAt returns startedAt only for running turnLifecycle', () => {
  assert.equal(findActiveTurnStartedAt([
    { id: '1', turnLifecycle: { turn: 1, seq: 1, state: 'completed', startedAt: 100, endedAt: 200 } },
    { id: '2', turnLifecycle: { turn: 2, seq: 5, state: 'running', startedAt: 5000 } },
  ]), 5000);
  assert.equal(findActiveTurnStartedAt([
    { id: '1', turnLifecycle: { turn: 1, seq: 1, state: 'running', startedAt: 100 } },
    { id: '2', turnLifecycle: { turn: 1, seq: 5, state: 'completed', startedAt: 100, endedAt: 200 } },
  ]), null);
});
