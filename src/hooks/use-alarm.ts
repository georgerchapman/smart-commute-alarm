import { useCallback } from 'react';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { fetchRoute } from '@/src/services/maps/routes-api';
import { buildArrivalDate } from '@/src/utils/time';
import { calculateWakeTime } from '@/src/utils/backoff';
import { FALLBACK_COMMUTE_SECONDS } from '@/src/constants/alarm';
import type { AlarmConfig } from '@/src/types/alarm';
import { logger } from '@/src/utils/logger';

export function useAlarm() {
  const store = useAlarmStore();

  const enableAlarm = useCallback(async () => {
    const { config } = store;
    if (!config) return;

    const arrivalTime = buildArrivalDate(config.arrivalTime);

    // Schedule failsafe notification immediately
    const failsafeWake = calculateWakeTime(
      arrivalTime,
      FALLBACK_COMMUTE_SECONDS,
      config.prepMinutes
    );

    await NotificationService.scheduleAlarm(config.id, failsafeWake, {
      type: 'alarm_fire',
      alarmId: config.id,
      wakeTime: failsafeWake.toISOString(),
    });

    store.setEnabled(true);
    store.setLastCalculatedWakeTime(failsafeWake.toISOString());
    logger.info(`Alarm enabled. Failsafe set for ${failsafeWake.toISOString()}`);
  }, [store]);

  const disableAlarm = useCallback(async () => {
    const { config } = store;
    if (config) {
      await NotificationService.cancelAlarm(config.id);
    }
    store.setEnabled(false);
  }, [store]);

  const updateConfig = useCallback(
    (partial: Partial<AlarmConfig>) => {
      store.setConfig(partial);
    },
    [store]
  );

  const snooze = useCallback(async () => {
    const { config } = store;
    if (!config) return;

    const fetchLiveDuration = async () => {
      const arrivalTime = buildArrivalDate(config.arrivalTime);
      const result = await fetchRoute(
        {
          originLatitude: 0, // updated with real location by caller in production
          originLongitude: 0,
          destinationLatitude: config.destination.latitude,
          destinationLongitude: config.destination.longitude,
          arrivalTime: arrivalTime.toISOString(),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        },
        15
      );
      return result.durationSeconds;
    };

    await store.snooze(fetchLiveDuration);

    const updatedWakeTime = store.lastCalculatedWakeTime;
    if (updatedWakeTime && config) {
      await NotificationService.scheduleAlarm(config.id, new Date(updatedWakeTime), {
        type: 'snooze_recheck',
        alarmId: config.id,
        wakeTime: updatedWakeTime,
      });
    }
  }, [store]);

  return {
    config: store.config,
    status: store.status,
    lastCalculatedWakeTime: store.lastCalculatedWakeTime,
    snoozeCount: store.snoozeCount,
    enableAlarm,
    disableAlarm,
    updateConfig,
    snooze,
    dismiss: store.dismiss,
  };
}
