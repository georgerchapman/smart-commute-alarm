import { useCallback } from 'react';
import * as Location from 'expo-location';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { useTrafficStore } from '@/src/stores/traffic-store';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { fetchRoute } from '@/src/services/maps/routes-api';
import { buildArrivalDate } from '@/src/utils/time';
import { calculateWakeTime } from '@/src/utils/backoff';
import { FALLBACK_COMMUTE_SECONDS } from '@/src/constants/alarm';
import type { AlarmConfig } from '@/src/types/alarm';
import { logger } from '@/src/utils/logger';

export function useAlarm() {
  const store = useAlarmStore();
  const lastTrafficResult = useTrafficStore((s) => s.lastResult);

  const enableAlarm = useCallback(async (nominalDurationSeconds?: number) => {
    const { config } = store;
    if (!config) return;

    const arrivalTime = buildArrivalDate(config.arrivalTime);

    // Use nominal journey time if available, otherwise fall back to 45-min estimate
    const initialDurationSeconds = nominalDurationSeconds ?? FALLBACK_COMMUTE_SECONDS;
    const rawWakeTime = calculateWakeTime(
      arrivalTime,
      initialDurationSeconds,
      config.prepMinutes
    );

    // Clamp to at least 10 seconds from now — arrivalTime is guaranteed future
    // but the calculated wake time (arrival - commute - prep) may already be past.
    const failsafeWake = new Date(
      Math.max(rawWakeTime.getTime(), Date.now() + 10_000)
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
      let originLatitude = 0;
      let originLongitude = 0;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        originLatitude = pos.coords.latitude;
        originLongitude = pos.coords.longitude;
      } catch {
        logger.warn('Snooze: could not get location, using 0,0 origin');
      }
      const arrivalTime = buildArrivalDate(config.arrivalTime);
      const result = await fetchRoute(
        {
          originLatitude,
          originLongitude,
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

  const dismiss = useCallback(async () => {
    await store.performDismiss(lastTrafficResult?.durationSeconds);
  }, [store, lastTrafficResult]);

  return {
    config: store.config,
    status: store.status,
    lastCalculatedWakeTime: store.lastCalculatedWakeTime,
    snoozeCount: store.snoozeCount,
    enableAlarm,
    disableAlarm,
    updateConfig,
    snooze,
    dismiss,
    setFiring: store.setFiring,
  };
}
