import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationPayload } from '@/src/types/notification';
import type { TrafficResult } from '@/src/types/traffic';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { formatWakeTime, formatDuration } from '@/src/utils/time';
import { logger } from '@/src/utils/logger';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const payload = notification.request.content.data as unknown as NotificationPayload;
    if (payload?.type === 'alarm_fire' || payload?.type === 'snooze_recheck') {
      return {
        shouldShowBanner: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowList: true,
      };
    }
    return {
      shouldShowBanner: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowList: false,
    };
  },
});

const ALARM_CATEGORY_ID = 'ALARM_CATEGORY';

export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY_ID, [
      {
        identifier: 'SNOOZE',
        buttonTitle: 'Snooze',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'DISMISS',
        buttonTitle: 'Dismiss',
        options: { opensAppToForeground: false },
      },
    ]);
  }
}

function buildAlarmBody(payload: NotificationPayload): string {
  if (payload.trafficDurationSeconds) {
    return `Commute is ${formatDuration(payload.trafficDurationSeconds)}. Time to get up!`;
  }
  return 'Time to get up for your commute!';
}

export const NotificationService = {
  async scheduleAlarm(
    alarmId: string,
    wakeTime: Date,
    payload: NotificationPayload
  ): Promise<string> {
    // Always cancel existing notification before scheduling a new one
    await this.cancelAlarm(alarmId);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Wake up — ${formatWakeTime(wakeTime)}`,
        body: buildAlarmBody(payload),
        data: payload as unknown as Record<string, unknown>,
        sound: true,
        ...(Platform.OS === 'ios'
          ? { categoryIdentifier: ALARM_CATEGORY_ID }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: wakeTime,
      },
    });

    AlarmStorage.writeScheduledNotificationId(alarmId, notificationId);
    logger.info(`Alarm scheduled at ${wakeTime.toISOString()} (id: ${notificationId})`);
    return notificationId;
  },

  async rescheduleAlarm(
    alarmId: string,
    newWakeTime: Date,
    trafficResult: TrafficResult
  ): Promise<string> {
    return this.scheduleAlarm(alarmId, newWakeTime, {
      type: 'alarm_fire',
      alarmId,
      wakeTime: newWakeTime.toISOString(),
      trafficDurationSeconds: trafficResult.durationSeconds,
    });
  },

  async cancelAlarm(alarmId: string): Promise<void> {
    const existingId = AlarmStorage.readScheduledNotificationId(alarmId);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      AlarmStorage.clearScheduledNotificationId(alarmId);
      logger.info(`Alarm notification cancelled (id: ${existingId})`);
    }
  },

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('All scheduled notifications cancelled');
  },
};
