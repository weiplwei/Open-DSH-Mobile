import assert from 'node:assert/strict';
import test from 'node:test';
import { applyComposerTrigger, detectComposerTrigger, queueItemText } from '../src/lib/composer-mentions';

test('detectComposerTrigger recognizes slash commands and @ mentions', () => {
  assert.deepEqual(detectComposerTrigger('/go'), { kind: 'slash', query: 'go', start: 0 });
  assert.equal(detectComposerTrigger('/goal fix bug'), null);
  assert.deepEqual(detectComposerTrigger('请帮我看 @src/ap'), { kind: 'mention', query: 'src/ap', start: 5 });
  assert.deepEqual(detectComposerTrigger('@'), { kind: 'mention', query: '', start: 0 });
  assert.equal(detectComposerTrigger('hello world'), null);
});

test('applyComposerTrigger replaces trigger slice and ensures trailing space', () => {
  assert.equal(applyComposerTrigger('/go', 0, '/goal'), '/goal ');
  assert.equal(applyComposerTrigger('查看 @src/a', 3, '@src/app/chat.tsx'), '查看 @src/app/chat.tsx ');
});

test('queueItemText extracts text from string or content parts', () => {
  assert.equal(queueItemText({ id: 'q1', placement: 'queued', message: { content: '继续' } }), '继续');
  assert.equal(queueItemText({
    id: 'q2',
    placement: 'queued',
    message: { content: [{ type: 'text', text: '第一行' }, { type: 'text', text: '第二行' }] },
  }), '第一行\n第二行');
});
