import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkColors, lightColors, type ThemePalette } from '@/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  colors: ThemePalette;
};

const STORAGE_KEY = 'open_dsh_theme_mode_v1';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: async () => undefined,
  isDark: false,
  colors: lightColors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (!active) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures on non-native environments.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
    return {
      mode,
      setMode,
      isDark,
      colors: isDark ? darkColors : lightColors,
    };
  }, [mode, setMode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
