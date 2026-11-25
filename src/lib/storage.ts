import * as SecureStore from 'expo-secure-store';
import type { PairedHost } from './types';

const HOST_KEY = 'open-dsh.host.v1';

export async function loadHost(): Promise<PairedHost | null> {
  const value = await SecureStore.getItemAsync(HOST_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as PairedHost;
  } catch {
    await SecureStore.deleteItemAsync(HOST_KEY);
    return null;
  }
}

export async function saveHost(host: PairedHost): Promise<void> {
  const value = JSON.stringify(host);
  if (value.length > 1900) throw new Error('配对记录过大，无法安全保存到系统钥匙串');
  await SecureStore.setItemAsync(HOST_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearHost(): Promise<void> {
  await SecureStore.deleteItemAsync(HOST_KEY);
}
