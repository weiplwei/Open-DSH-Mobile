import { useMemo } from 'react';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WorkspaceTreeView } from '@/components/WorkspaceDrawer';
import { useTheme } from '@/state/theme';

export default function SessionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
  }), [colors]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <WorkspaceTreeView
        onSelectSession={(item) => {
          router.push({
            pathname: '/chat/[sessionId]',
            params: { sessionId: item.sessionId, title: item.title || '会话' },
          });
        }}
      />
    </SafeAreaView>
  );
}
