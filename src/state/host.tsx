import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { DshClient } from '@/lib/api';
import { clearHost, loadHost, saveHost } from '@/lib/storage';
import type { PairedHost } from '@/lib/types';

type HostContextValue = {
  loading: boolean;
  host: PairedHost | null;
  client: DshClient | null;
  connect: (host: PairedHost) => Promise<void>;
  disconnect: () => Promise<void>;
};

const HostContext = createContext<HostContextValue | null>(null);

export function HostProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState<PairedHost | null>(null);

  useEffect(() => {
    loadHost().then(setHost).catch(() => setHost(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo<HostContextValue>(() => ({
    loading,
    host,
    client: host ? new DshClient(host, Crypto.getRandomBytes) : null,
    connect: async (next) => {
      await saveHost(next);
      setHost(next);
    },
    disconnect: async () => {
      await clearHost();
      setHost(null);
    },
  }), [host, loading]);

  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

export function useHost(): HostContextValue {
  const value = useContext(HostContext);
  if (!value) throw new Error('useHost 必须在 HostProvider 内使用');
  return value;
}
