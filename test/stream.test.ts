import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SseParser } from '../src/lib/sse';

test('parses split SSE frames, multiline data, retry/id and ignores padding', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('retry: 3000\nid: session:42\n: padding\n'), []);
  const records = parser.push('data: {"v":2,\n\n: next\ndata: first\ndata: second\n\n');
  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'session:42');
  assert.equal(records[0].retry, 3000);
  assert.equal(records[0].data, '{"v":2,');
  assert.equal(records[1].data, 'first\nsecond');
});

test('normalizes CRLF and preserves an incomplete final frame', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('id: abc\r\ndata: one\r\n'), []);
  assert.deepEqual(parser.push('\r\ndata: two\r\n\r\n').map((record) => record.data), ['one', 'two']);
});
