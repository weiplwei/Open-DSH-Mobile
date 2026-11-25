import { Platform, Vibration } from 'react-native';
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
} from 'expo-haptics';
import {
  AndroidImportance,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';

const ALERT_CHANNEL_ID = 'open-dsh-alerts';

export async function configureForegroundAlerts(soundEnabled: boolean): Promise<void> {
  try {
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: soundEnabled,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(ALERT_CHANNEL_ID, {
        name: '任务提醒',
        importance: AndroidImportance.HIGH,
        sound: soundEnabled ? 'default' : null,
        enableVibrate: true,
      });
    }
  } catch {
    // Ignore unsupported environments (e.g. web/test).
  }
}

export async function ensureAlertPermission(): Promise<boolean> {
  try {
    const existing = await getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export function triggerHaptic(kind: 'light' | 'success' | 'warning', enabled: boolean): void {
  if (!enabled) return;
  try {
    if (kind === 'light') {
      void impactAsync(ImpactFeedbackStyle.Light);
    } else if (kind === 'success') {
      void notificationAsync(NotificationFeedbackType.Success);
    } else {
      void notificationAsync(NotificationFeedbackType.Warning);
    }
  } catch {
    try {
      Vibration.vibrate(25);
    } catch {
      // Ignore vibration failures.
    }
  }
}

export async function triggerForegroundAlert({
  title,
  body,
  kind,
  sound,
  vibrate,
}: {
  title: string;
  body: string;
  kind: 'complete' | 'interaction';
  sound: boolean;
  vibrate: boolean;
}): Promise<void> {
  if (vibrate) {
    try {
      void notificationAsync(
        kind === 'interaction'
          ? NotificationFeedbackType.Warning
          : NotificationFeedbackType.Success,
      );
    } catch {
      // Ignore haptics errors.
    }
    try {
      Vibration.vibrate(kind === 'interaction' ? [0, 120, 80, 120] : 80);
    } catch {
      // Ignore vibration errors.
    }
  }

  try {
    const granted = await ensureAlertPermission();
    if (!granted) return;
    await scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: sound ? 'default' : undefined,
      },
      trigger: null,
    });
  } catch {
    // Ignore local notification scheduling failures.
  }
}
