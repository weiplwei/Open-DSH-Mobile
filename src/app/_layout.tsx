import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { configureForegroundAlerts } from '@/lib/alerts';
import { HostProvider } from '@/state/host';
import { PrefsProvider, usePrefs } from '@/state/prefs';
import { ThemeProvider, useTheme } from '@/state/theme';

function AlertSync() {
  const { prefs } = usePrefs();
  useEffect(() => {
    void configureForegroundAlerts(prefs.notifySound);
  }, [prefs.notifySound]);
  return null;
}

function AppShell() {
  const { isDark, colors } = useTheme();
  return (
    <HostProvider>
      <PrefsProvider>
        <AlertSync />
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="pair" />
          <Stack.Screen name="sessions" />
          <Stack.Screen name="new-chat" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="channels" />
          <Stack.Screen name="plugins" />
          <Stack.Screen name="presets" />
          <Stack.Screen name="files" />
          <Stack.Screen name="git" />
          <Stack.Screen name="schedule" />
          <Stack.Screen name="chat/[sessionId]" />
          <Stack.Screen name="chat/subagents" />
        </Stack>
      </PrefsProvider>
    </HostProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
