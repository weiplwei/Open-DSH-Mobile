import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64, base64urlnopad, utf8 } from '@scure/base';

export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;

export type SessionKeys = { up: Uint8Array; down: Uint8Array; sig: Uint8Array };
export type ResponseEnvelope = { v: 2; n: string; c: string; z?: string };

export const b64 = (value: Uint8Array) => base64.encode(value);
export const unb64 = (value: string) => base64.decode(value);
export const b64url = (value: Uint8Array) => base64urlnopad.encode(value);
export const unb64url = (value: string) => base64urlnopad.decode(value);
export const textBytes = (value: string) => utf8.decode(value);
export const bytesText = (value: Uint8Array) => utf8.encode(value);

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function bytesHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hkdf32(ikm: Uint8Array, salt: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, ikm, salt, textBytes(info), 32);
}

export function derivePairKey(ticket: Uint8Array, instanceId: string): Uint8Array {
  return hkdf32(ticket, textBytes(instanceId), 'dsh-pair-v2');
}

export function deriveSessionKeys(deviceKey: Uint8Array): SessionKeys {
  const salt = new Uint8Array();
  return {
    up: hkdf32(deviceKey, salt, 'dsh-v2|up'),
    down: hkdf32(deviceKey, salt, 'dsh-v2|down'),
    sig: hkdf32(deviceKey, salt, 'dsh-v2|sig'),
  };
}

export function sealWithNonce(
  key: Uint8Array,
  nonce: Uint8Array,
  plain: Uint8Array,
  aad: string,
): Uint8Array {
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce 必须为 12 字节');
  return concatBytes(nonce, gcm(key, nonce, textBytes(aad)).encrypt(plain));
}

export function open(
  key: Uint8Array,
  sealed: Uint8Array,
  aad: string,
): Uint8Array {
  if (sealed.length < NONCE_BYTES + TAG_BYTES) throw new Error('密文长度不足');
  const nonce = sealed.slice(0, NONCE_BYTES);
  const body = sealed.slice(NONCE_BYTES);
  return gcm(key, nonce, textBytes(aad)).decrypt(body);
}

export const pairAad = (instanceId: string) => `pair|v2|${instanceId}`;
export const upAad = (method: string, path: string) => `v2|up|${method}|${path}`;
export const downAad = (method: string, path: string, ts: number, nonce: string) =>
  `v2|down|${method}|${path}|${ts}|${nonce}`;
export const paramsAad = (ts: number, nonce: string) => `v2|params|${ts}|${nonce}`;
export const sseAad = (path: string, ts: number, nonce: string, seq: number) =>
  `v2|down|sse|${path}|${ts}|${nonce}|${seq}`;
export const fileAad = (path: string, nonce: string, seq: number) =>
  `v2|down|file|${path}|${nonce}|${seq}`;

export function canonicalString(input: {
  method: string;
  path: string;
  query?: string;
  ts: number;
  nonce: string;
  bodyBytes?: Uint8Array;
}): string {
  return [
    'v2',
    input.method.toUpperCase(),
    input.path,
    input.query || '',
    String(input.ts),
    input.nonce,
    bytesHex(sha256(input.bodyBytes || new Uint8Array())),
  ].join('\n');
}

export function signCanonical(key: Uint8Array, canonical: string): string {
  return b64url(hmac(sha256, key, textBytes(canonical)));
}

export function sealJson(key: Uint8Array, value: unknown, aad: string, nonce: Uint8Array): string {
  return b64(sealWithNonce(key, nonce, textBytes(JSON.stringify(value)), aad));
}

export function openJson<T>(key: Uint8Array, sealed: string, aad: string): T {
  return JSON.parse(bytesText(open(key, unb64(sealed), aad))) as T;
}

export function openResponseEnvelope<T>(
  key: Uint8Array,
  envelope: ResponseEnvelope,
  aad: string,
): T {
  if (envelope.v !== 2 || envelope.z) throw new Error('暂不支持此响应信封');
  const sealed = concatBytes(unb64url(envelope.n), unb64(envelope.c));
  return JSON.parse(bytesText(open(key, sealed, aad))) as T;
}
