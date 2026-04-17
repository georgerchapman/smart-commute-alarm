import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationPayload } from '@/src/types/notification';
import type { TrafficResult } from '@/src/types/traffic';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { formatWakeTime, formatDuration } from '@/src/utils/time';
import { ALARM_BURST_COUNT, ALARM_BURST_INTERVAL_MS } from '@/src/constants/alarm';
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
  /**
   * Schedule a burst of ALARM_BURST_COUNT notifications starting at wakeTime,
   * spaced ALARM_BURST_INTERVAL_MS apart. This simulates a repeating alarm ring
   * since a single iOS notification fires once and then goes silent.
   *
   * The first notification uses the primary alarm content; subsequent "ring"
   * notifications use a shorter repeat title so the lock screen stays clear.
   */
  async scheduleAlarm(
    alarmId: string,
    wakeTime: Date,
    payload: NotificationPayload
  ): Promise<string> {
    // Always cancel any existing burst before scheduling a new one
    await this.cancelAlarm(alarmId);

    const ids: string[] = [];
    const baseContent = {
      data: payload as unknown as Record<string, unknown>,
      sound: true,
      ...(Platform.OS === 'ios' ? { categoryIdentifier: ALARM_CATEGORY_ID } : {}),
    };

    // iOS requires trigger dates to be strictly in the future.
    // Clamp the first ring to at least 2 seconds from now so scheduling
    // never fails even when the computed wake time is already in the past.
    const MIN_SCHEDULE_AHEAD_MS = 2_000;
    const now = Date.now();
    const firstRing = Math.max(wakeTime.getTime(), now + MIN_SCHEDULE_AHEAD_MS);

    for (let i = 0; i < ALARM_BURST_COUNT; i++) {
      const ringTime = new Date(firstRing + i * ALARM_BURST_INTERVAL_MS);
      const isFirst = i === 0;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          ...baseContent,
          title: isFirst
            ? `Wake up — ${formatWakeTime(wakeTime)}`
            : `Still time to get up — ${formatWakeTime(wakeTime)}`,
          body: isFirst ? buildAlarmBody(payload) : 'Your alarm is still ringing.',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: ringTime,
        },
      });
      ids.push(id);
    }

    AlarmStorage.writeScheduledNotificationIds(alarmId, ids);
    logger.info(
      `Alarm burst of ${ALARM_BURST_COUNT} scheduled from ${wakeTime.toISOString()} (ids: ${ids[0]}…)`
    );
    return ids[0];
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
    const existingIds = AlarmStorage.readScheduledNotificationIds(alarmId);
    if (existingIds.length > 0) {
      await Promise.all(
        existingIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
      );
      AlarmStorage.clearScheduledNotificationIds(alarmId);
      logger.info(`Alarm burst cancelled (${existingIds.length} notifications)`);
    }
  },

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('All scheduled notifications cancelled');
  },
};
