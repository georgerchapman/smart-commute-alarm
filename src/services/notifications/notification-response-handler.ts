import * as Notifications from 'expo-notifications';
import type { NotificationPayload } from '@/src/types/notification';
import { logger } from '@/src/utils/logger';

export interface NotificationResponseCallbacks {
  /** Called when the user taps the DISMISS action button. Should cancel the burst and reschedule. */
  onDismiss: () => void;
  /** Called when the user taps SNOOZE or the notification body — transitions to the firing overlay. */
  onFire: () => void;
  /** Called to navigate to a route (e.g. the main alarm screen). */
  onNavigate: (route: string) => void;
}

/**
 * Routes a notification response action to the correct callback.
 * Extracted from RootLayout so the logic can be unit-tested independently
 * of the React component lifecycle.
 */
export function handleNotificationResponse(
  actionIdentifier: string,
  payload: NotificationPayload | null | undefined,
  callbacks: NotificationResponseCallbacks
): void {
  const { onDismiss, onFire, onNavigate } = callbacks;

  logger.ui(`Notification response: action="${actionIdentifier}", payload.type="${payload?.type}"`);

  if (actionIdentifier === 'DISMISS') {
    logger.ui('DISMISS action — calling onDismiss');
    onDismiss();
  } else if (actionIdentifier === 'SNOOZE') {
    logger.ui('SNOOZE action — opening firing overlay');
    onFire();
    onNavigate('/');
  } else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (payload?.type === 'alarm_fire' || payload?.type === 'snooze_recheck') {
      logger.ui(`DEFAULT tap on "${payload.type}" — opening firing overlay`);
      onFire();
      onNavigate('/');
    }
  }
}
