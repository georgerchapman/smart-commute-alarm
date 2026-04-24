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
    const wasClamped = firstRing !== wakeTime.getTime();
    const msUntilFirstRing = firstRing - now;

    logger.notif(`Scheduling alarm burst — type: "${payload.type}", wakeTime: ${wakeTime.toISOString()}, firstRing: ${new Date(firstRing).toISOString()}${wasClamped ? ' (CLAMPED to now+2s)' : ''}, msUntilRing: ${msUntilFirstRing}ms (${Math.round(msUntilFirstRing / 1000)}s)`);

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
      if (isFirst) {
        logger.notif(`  Ring 1/${ALARM_BURST_COUNT}: ${ringTime.toISOString()} (id: ${id})`);
      }
    }
    logger.notif(`  Rings 2–${ALARM_BURST_COUNT}: every ${ALARM_BURST_INTERVAL_MS / 1000}s after first ring. Last ring: ${new Date(firstRing + (ALARM_BURST_COUNT - 1) * ALARM_BURST_INTERVAL_MS).toISOString()}`);

    AlarmStorage.writeScheduledNotificationIds(alarmId, ids);
    logger.notif(`Alarm burst scheduled: ${ALARM_BURST_COUNT} notifications, first id: ${ids[0]}`);
    return ids[0];
  },

  async rescheduleAlarm(
    alarmId: string,
    newWakeTime: Date,
    trafficResult: TrafficResult
  ): Promise<string> {
    logger.notif(`Rescheduling alarm → ${newWakeTime.toISOString()} (traffic: ${trafficResult.durationSeconds}s = ${Math.round(trafficResult.durationSeconds / 60)} min, delay vs static: ${trafficResult.durationSeconds - trafficResult.staticDurationSeconds}s)`);
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
      logger.notif(`Cancelling alarm burst: ${existingIds.length} tracked notifications (ids: ${existingIds[0]}…)`);
      await Promise.all(
        existingIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
      );
      AlarmStorage.clearScheduledNotificationIds(alarmId);
    }

    // Safety sweep: cancel any orphaned notifications that survived because
    // rapid reschedules overwrote the stored IDs before cancellation ran.
    const remaining = await Notifications.getAllScheduledNotificationsAsync();
    const orphans = remaining.filter((n) => {
      const payload = n.content.data as Record<string, unknown> | undefined;
      return payload?.alarmId === alarmId;
    });
    if (orphans.length > 0) {
      logger.notif(`Sweeping ${orphans.length} orphaned notifications for alarm ${alarmId}`);
      await Promise.all(
        orphans.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
      );
    }

    logger.notif(`cancelAlarm complete: ${existingIds.length} tracked + ${orphans.length} orphans removed`);
  },

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.info('All scheduled notifications cancelled');
  },
};
