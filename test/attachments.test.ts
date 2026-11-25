import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentPrompt } from '../src/lib/attachments';

test('adds uploaded computer paths to the model-visible prompt', () => {
  const result = documentPrompt('分析这个文件', [{ id: 'u1', name: 'notes.txt', path: '/tmp/notes.txt', size: 12 }]);
  assert.match(result, /分析这个文件/);
  assert.match(result, /notes\.txt: \/tmp\/notes\.txt/);
});

test('leaves prompts without documents unchanged', () => {
  assert.equal(documentPrompt('hello', []), 'hello');
});
