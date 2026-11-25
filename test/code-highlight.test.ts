import assert from 'node:assert/strict';
import test from 'node:test';
import { highlightCodeLine } from '../src/lib/code-highlight';

test('highlightCodeLine tokenizes keywords, strings, numbers, and comments', () => {
  const tokens = highlightCodeLine('const count = 42; // total', 'ts');
  assert.ok(tokens.some((t) => t.kind === 'keyword' && t.text === 'const'));
  assert.ok(tokens.some((t) => t.kind === 'number' && t.text === '42'));
  assert.ok(tokens.some((t) => t.kind === 'comment' && t.text === '// total'));

  const pyTokens = highlightCodeLine('return "ok" # done', 'python');
  assert.ok(pyTokens.some((t) => t.kind === 'keyword' && t.text === 'return'));
  assert.ok(pyTokens.some((t) => t.kind === 'string' && t.text === '"ok"'));
  assert.ok(pyTokens.some((t) => t.kind === 'comment' && t.text === '# done'));
});
