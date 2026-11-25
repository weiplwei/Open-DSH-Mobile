import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openFileChunks } from '../src/lib/file-chunks';
import { b64url, concatBytes, fileAad, sealWithNonce, textBytes } from '../src/lib/e2ee';
import { gcm } from '@noble/ciphers/aes.js';

test('decrypts authenticated file chunks with per-sequence AAD', () => {
  const key = new Uint8Array(32).fill(7);
  const nonce = new Uint8Array(12).fill(3);
  const requestNonce = b64url(nonce);
  const path = '/api/mobile/v1/file/read';
  const chunks = [textBytes('hello'), textBytes(' world')].map((plain, index) => {
    const sealed = sealWithNonce(key, nonce, plain, fileAad(path, requestNonce, index + 1));
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, sealed.length - 12, false);
    return concatBytes(length, sealed);
  });
  const result = openFileChunks(concatBytes(...chunks), key, path, requestNonce);
  assert.equal(new TextDecoder().decode(result), 'hello world');
  assert.throws(() => gcm(key, nonce, textBytes('wrong aad')).decrypt(new Uint8Array(16)));
});
