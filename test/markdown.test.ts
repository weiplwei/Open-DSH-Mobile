import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown } from '../src/lib/markdown';

test('parses headings, fenced code and lists without consuming fence contents', () => {
  const blocks = parseMarkdown('# Title\n\n```ts\nconst x = 1\n```\n\n- one\n- two');
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'code', 'list']);
  assert.equal(blocks[1].type === 'code' && blocks[1].text, 'const x = 1');
  assert.equal(blocks[2].type === 'list' && blocks[2].items.length, 2);
});

test('parses tables, quotes and dividers', () => {
  const blocks = parseMarkdown('| A | B |\n| --- | ---: |\n| 1 | 2 |\n\n> note\n\n---');
  assert.deepEqual(blocks.map((block) => block.type), ['table', 'quote', 'divider']);
  assert.deepEqual(blocks[0].type === 'table' && blocks[0].rows, [['1', '2']]);
});

test('parses bounded inline styles and only permits http(s) links', () => {
  const tokens = parseInline('**bold** and `code` and [ok](https://example.com) [bad](javascript:alert(1))');
  assert.equal(tokens[0].type, 'bold');
  assert.equal(tokens[2].type, 'code');
  assert.equal(tokens[4].type, 'link');
  assert.equal(tokens[4].url, 'https://example.com');
  assert.ok(!tokens.some((token) => token.url?.startsWith('javascript:')));
});

test('parses dsh-local-image and dsh://local-image syntax into image blocks', () => {
  const blocks = parseMarkdown('前缀说明\n![图1](dsh-local-image:img-42?w=800&h=600)\n后续说明\n![图2](dsh://local-image/img-99)');
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'image', 'paragraph', 'image']);
  assert.deepEqual(blocks[1], { type: 'image', alt: '图1', localImageId: 'img-42', width: 800, height: 600 });
  assert.deepEqual(blocks[3], { type: 'image', alt: '图2', localImageId: 'img-99' });
});
