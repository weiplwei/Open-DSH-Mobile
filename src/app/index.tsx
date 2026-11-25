import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useHost } from '@/state/host';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/state/theme';

export default function Index() {
  const { loading, host } = useHost();
  const { loading: prefsLoading, prefs } = usePrefs();
  const { colors } = useTheme();
  if (loading || prefsLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accentBlue} />
      </View>
    );
  }
  if (!host) return <Redirect href="/pair" />;
  if (prefs.restoreLastSession && prefs.lastSessionId) {
    return (
      <Redirect
        href={{
          pathname: '/chat/[sessionId]',
          params: { sessionId: prefs.lastSessionId, title: prefs.lastSessionTitle || '会话' },
        }}
      />
    );
  }
  return <Redirect href="/sessions" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
