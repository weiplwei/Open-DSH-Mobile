import { concatBytes, fileAad, open } from './e2ee';

export function openFileChunks(input: Uint8Array, downKey: Uint8Array, path: string, requestNonce: string, firstSeq = 1): Uint8Array {
  const plain: Uint8Array[] = [];
  let offset = 0;
  let seq = firstSeq;
  while (offset < input.length) {
    if (offset + 32 > input.length) throw new Error('文件密文块头不完整');
    const view = new DataView(input.buffer, input.byteOffset + offset, 4);
    const bodyLength = view.getUint32(0, false);
    if (bodyLength < 16 || offset + 16 + bodyLength > input.length) throw new Error('文件密文块长度无效');
    const nonce = input.slice(offset + 4, offset + 16);
    const body = input.slice(offset + 16, offset + 16 + bodyLength);
    plain.push(open(downKey, concatBytes(nonce, body), fileAad(path, requestNonce, seq++)));
    offset += 16 + bodyLength;
  }
  return concatBytes(...plain);
}
