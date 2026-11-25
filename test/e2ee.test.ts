import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  b64,
  b64url,
  canonicalString,
  concatBytes,
  derivePairKey,
  deriveSessionKeys,
  downAad,
  open,
  openResponseEnvelope,
  pairAad,
  paramsAad,
  sealWithNonce,
  signCanonical,
  textBytes,
  unb64,
  unb64url,
  upAad,
} from '../src/lib/e2ee';

const vectors = JSON.parse(readFileSync(new URL('./e2ee-vectors.json', import.meta.url), 'utf8'));
const { inputs: input, expect: expected } = vectors;
const hex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'));
const ticket = hex(input.ticket);
const deviceKey = hex(input.deviceKey);
const keys = deriveSessionKeys(deviceKey);
const requestNonce = b64url(hex(input.bodyNonce));

test('HKDF 密钥派生与上游跨端向量一致', () => {
  // 向量中的密钥是 hex，不是 base64url。
  assert.equal(Buffer.from(derivePairKey(ticket, input.instanceId)).toString('hex'), expected.pairKey);
  assert.equal(Buffer.from(keys.up).toString('hex'), expected.keyUp);
  assert.equal(Buffer.from(keys.down).toString('hex'), expected.keyDown);
  assert.equal(Buffer.from(keys.sig).toString('hex'), expected.keySig);
});

test('配对、上行、下行和私密参数的 AES-GCM 字节完全一致', () => {
  const pair = sealWithNonce(
    derivePairKey(ticket, input.instanceId),
    hex(input.pairNonce),
    textBytes(input.pairPlain),
    pairAad(input.instanceId),
  );
  assert.equal(Buffer.from(pair).toString('hex'), expected.pairSealed);
  assert.equal(b64(open(derivePairKey(ticket, input.instanceId), pair, pairAad(input.instanceId))), b64(textBytes(input.pairPlain)));

  const up = sealWithNonce(keys.up, hex(input.bodyNonce), textBytes(input.bodyPlain), upAad(input.requestMethod, input.requestPath));
  assert.equal(Buffer.from(up).toString('hex'), expected.upSealed);
  assert.equal(new TextDecoder().decode(open(keys.up, up, upAad(input.requestMethod, input.requestPath))), input.bodyPlain);

  const down = sealWithNonce(keys.down, hex(input.downNonce), textBytes(input.responsePlain), downAad(input.requestMethod, input.requestPath, input.requestTs, requestNonce));
  assert.equal(Buffer.from(down).toString('hex'), expected.downSealed);

  const params = sealWithNonce(keys.up, hex(input.paramsNonce), textBytes(input.paramsPlain), paramsAad(input.requestTs, requestNonce));
  assert.equal(Buffer.from(params).toString('hex'), expected.paramsSealed);
});

test('规范串与 HMAC 签名和上游一致', () => {
  const bodyText = JSON.stringify({ v: 2, c: b64(hex(expected.upSealed)) });
  const canonical = canonicalString({
    method: input.requestMethod,
    path: input.requestPath,
    query: input.requestQuery,
    ts: input.requestTs,
    nonce: requestNonce,
    bodyBytes: textBytes(bodyText),
  });
  assert.equal(canonical, expected.canonical);
  assert.equal(signCanonical(keys.sig, canonical), expected.signature);
});

test('响应信封拆分 nonce 后可以正确解封', () => {
  const sealed = hex(expected.downSealed);
  const envelope = {
    v: 2 as const,
    n: b64url(sealed.slice(0, 12)),
    c: b64(sealed.slice(12)),
  };
  const decoded = openResponseEnvelope<{ ok: boolean; data: { received: number } }>(
    keys.down,
    envelope,
    downAad(input.requestMethod, input.requestPath, input.requestTs, requestNonce),
  );
  assert.deepEqual(decoded, { ok: true, data: { received: 1 } });
  assert.equal(concatBytes(unb64url(envelope.n), unb64(envelope.c)).length, sealed.length);
});
