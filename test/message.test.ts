import assert from 'node:assert/strict';
import test from 'node:test';
import { messageText, sessionPreviewText } from '../src/lib/message';

test('renders normal assistant text', () => {
  assert.equal(messageText({ role: 'assistant', text: '你好', blocks: [] }), '你好');
});

test('does not render a tool-only assistant message as a blank bubble', () => {
  assert.equal(messageText({
    role: 'assistant',
    text: '',
    blocks: [{ type: 'tool-call', name: 'read', state: 'completed' }],
  }), '🔧 read · completed');
});

test('renders mixed text and falls back to structured rows', () => {
  assert.equal(messageText({ text: '', blocks: [{ type: 'text', text: '正文' }] }), '正文');
  assert.equal(messageText({ kind: 'compaction', state: 'done' }), '上下文压缩 · done');
});

test('renders structured session lastMessage without passing an object to React Native', () => {
  assert.equal(sessionPreviewText({
    lastMessage: { role: 'assistant', text: '最后一条回复', at: 123 },
    cwd: 'D:\\work',
  }), '最后一条回复');
  assert.equal(sessionPreviewText({ lastMessage: null, cwd: 'D:\\work' }), 'D:\\work');
  assert.equal(sessionPreviewText({ lastMessage: '兼容旧字符串' }), '兼容旧字符串');
});
