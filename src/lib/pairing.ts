import {
  b64url,
  derivePairKey,
  openJson,
  pairAad,
  sealJson,
  unb64url,
} from './e2ee';
import type { PairedHost, PairingPayload } from './types';

export class PairingError extends Error {}

export function parsePairingText(input: string): PairingPayload {
  const value = input.trim();
  const prefix = 'dshpair://v1?data=';
  if (!value.startsWith(prefix)) {
    throw new PairingError('请扫描或粘贴电脑插件当前显示的 dshpair:// 配对二维码');
  }
  let payload: PairingPayload;
  try {
    payload = JSON.parse(decodeURIComponent(value.slice(prefix.length))) as PairingPayload;
  } catch {
    throw new PairingError('配对二维码内容无法解析');
  }
  if (
    payload.type !== 'dsh-pair' || payload.version !== 1 || payload.proto !== 2 ||
    !payload.instanceId || !/^[A-Za-z0-9_-]{43}$/.test(payload.ticket || '')
  ) {
    throw new PairingError('这不是受支持的协议 v2 配对二维码');
  }
  return payload;
}

export function pairingAddresses(payload: PairingPayload): string[] {
  const candidates = [
    ...(payload.lanUrls || []),
    payload.directUrl || '',
    ...(payload.ipv6Candidates || []),
  ];
  return [...new Set(candidates
    .filter((value) => /^https?:\/\//i.test(value))
    .map((value) => value.replace(/\/+$/, '')))];
}

export function createPairRequest(
  payload: PairingPayload,
  randomBytes: (size: number) => Uint8Array,
  deviceName: string,
  platform: string,
) {
  const deviceKeyBytes = randomBytes(32);
  const deviceKey = b64url(deviceKeyBytes);
  const keyId = Array.from(randomBytes(8), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const pairKey = derivePairKey(unb64url(payload.ticket), payload.instanceId);
  const sealed = sealJson(pairKey, {
    deviceKey,
    keyId,
    device: { name: deviceName, platform },
  }, pairAad(payload.instanceId), randomBytes(12));
  return {
    body: JSON.stringify({ instanceId: payload.instanceId, sealed }),
    deviceKey,
    keyId,
    pairKey,
  };
}

type PairResponse = {
  ok: true;
  instanceId: string;
  token?: string;
  deviceCredential?: string;
  deviceId?: string;
  serverTime?: number;
  lanUrls?: string[];
  ipv6Candidates?: string[];
};

export async function pairWithHost(
  payload: PairingPayload,
  randomBytes: (size: number) => Uint8Array,
  deviceName: string,
  platform: string,
): Promise<PairedHost> {
  const addresses = pairingAddresses(payload);
  if (!addresses.length) throw new PairingError('二维码里没有可用的局域网地址；请让手机和电脑接入同一网络后重新生成二维码');
  const request = createPairRequest(payload, randomBytes, deviceName, platform);
  const errors: string[] = [];

  for (const address of addresses) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const pairPath = '/__lan_pair';
      const response = await fetch(`${address}${pairPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-dsh-proto': '2',
          'x-dsh-instance': payload.instanceId,
        },
        body: request.body,
        signal: controller.signal,
      });
      const wire = await response.json() as { ok?: boolean; sealed?: string; error?: unknown };
      if (!response.ok || !wire.sealed) {
        throw new PairingError(errorMessage(wire.error) || `配对失败（HTTP ${response.status}）`);
      }
      const data = openJson<PairResponse>(
        request.pairKey,
        wire.sealed,
        pairAad(payload.instanceId),
      );
      const token = data.deviceCredential || data.token;
      if (!data.ok || !token) throw new PairingError('宿主没有返回有效设备凭据');
      const extraAddresses = [...(data.lanUrls || []), ...(data.ipv6Candidates || [])]
        .filter((value) => /^https?:\/\//i.test(value))
        .map((value) => value.replace(/\/+$/, ''));
      return {
        name: payload.name || 'DSH 电脑',
        instanceId: data.instanceId || payload.instanceId,
        token,
        deviceKey: request.deviceKey,
        keyId: request.keyId,
        deviceId: data.deviceId,
        addresses: [...new Set([address, ...extraAddresses, ...addresses])],
        localAddresses: [...new Set([address, ...extraAddresses, ...addresses])],
        activeAddress: address,
        clockOffsetMs: data.serverTime ? Math.round(data.serverTime - Date.now()) : 0,
        pairedAt: Date.now(),
      };
    } catch (error) {
      errors.push(`${address}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new PairingError(`所有地址都配对失败：\n${errors.join('\n')}`);
}

export function isLanAddress(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.lan') || hostname.endsWith('.internal')) return true;
    if (/^(?:fe80|fc|fd)/i.test(hostname)) return true;
    if (/^[a-z0-9_-]+$/i.test(hostname)) return true;
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10 || parts[0] === 127
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254);
  } catch {
    return false;
  }
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.code === 'string') return value.code;
  }
  return '';
}
