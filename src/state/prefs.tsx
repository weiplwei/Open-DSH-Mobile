import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type AppPrefs = {
  enterToSend: boolean;
  restoreLastSession: boolean;
  followAiReply: boolean;
  tapSessionClosesDrawer: boolean;
  imageQuality: 'compressed' | 'original';
  notifyOnComplete: boolean;
  notifyOnInteraction: boolean;
  notifySound: boolean;
  hapticFeedback: boolean;
  lastSessionId: string;
  lastSessionTitle: string;
};

const DEFAULT_PREFS: AppPrefs = {
  enterToSend: false,
  restoreLastSession: true,
  followAiReply: true,
  tapSessionClosesDrawer: true,
  imageQuality: 'compressed',
  notifyOnComplete: true,
  notifyOnInteraction: true,
  notifySound: true,
  hapticFeedback: true,
  lastSessionId: '',
  lastSessionTitle: '',
};

const STORAGE_KEY = 'open_dsh_prefs_v1';

type PrefsContextValue = {
  loading: boolean;
  prefs: AppPrefs;
  updatePrefs: (patch: Partial<AppPrefs>) => Promise<void>;
  rememberSession: (sessionId: string, title?: string) => Promise<void>;
};

const PrefsContext = createContext<PrefsContextValue>({
  loading: true,
  prefs: DEFAULT_PREFS,
  updatePrefs: async () => undefined,
  rememberSession: async () => undefined,
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<AppPrefs>;
        setPrefs({
          ...DEFAULT_PREFS,
          ...(typeof parsed.enterToSend === 'boolean' ? { enterToSend: parsed.enterToSend } : {}),
          ...(typeof parsed.restoreLastSession === 'boolean' ? { restoreLastSession: parsed.restoreLastSession } : {}),
          ...(typeof parsed.followAiReply === 'boolean' ? { followAiReply: parsed.followAiReply } : {}),
          ...(typeof parsed.tapSessionClosesDrawer === 'boolean' ? { tapSessionClosesDrawer: parsed.tapSessionClosesDrawer } : {}),
          ...(parsed.imageQuality === 'original' || parsed.imageQuality === 'compressed' ? { imageQuality: parsed.imageQuality } : {}),
          ...(typeof parsed.notifyOnComplete === 'boolean' ? { notifyOnComplete: parsed.notifyOnComplete } : {}),
          ...(typeof parsed.notifyOnInteraction === 'boolean' ? { notifyOnInteraction: parsed.notifyOnInteraction } : {}),
          ...(typeof parsed.notifySound === 'boolean' ? { notifySound: parsed.notifySound } : {}),
          ...(typeof parsed.hapticFeedback === 'boolean' ? { hapticFeedback: parsed.hapticFeedback } : {}),
          ...(typeof parsed.lastSessionId === 'string' ? { lastSessionId: parsed.lastSessionId } : {}),
          ...(typeof parsed.lastSessionTitle === 'string' ? { lastSessionTitle: parsed.lastSessionTitle } : {}),
        });
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<AppPrefs>) => {
    let nextValue: AppPrefs = DEFAULT_PREFS;
    setPrefs((current) => {
      nextValue = { ...current, ...patch };
      return nextValue;
    });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(nextValue));
    } catch {
      // Ignore storage errors outside native runtime.
    }
  }, []);

  const rememberSession = useCallback(async (sessionId: string, title = '') => {
    if (!sessionId) return;
    await updatePrefs({ lastSessionId: sessionId, lastSessionTitle: title });
  }, [updatePrefs]);

  const value = useMemo<PrefsContextValue>(
    () => ({ loading, prefs, updatePrefs, rememberSession }),
    [loading, prefs, updatePrefs, rememberSession],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  return useContext(PrefsContext);
}
