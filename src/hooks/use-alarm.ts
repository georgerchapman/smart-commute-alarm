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
    if (!config) {
      logger.warn('[use-alarm] enableAlarm called but config is null');
      return;
    }

    const arrivalTime = buildArrivalDate(config.arrivalTime);
    const initialDurationSeconds = nominalDurationSeconds ?? FALLBACK_COMMUTE_SECONDS;
    const rawWakeTime = calculateWakeTime(
      arrivalTime,
      initialDurationSeconds,
      config.prepMinutes
    );
    const failsafeWake = new Date(
      Math.max(rawWakeTime.getTime(), Date.now() + 10_000)
    );
    const wasClamped = failsafeWake.getTime() !== rawWakeTime.getTime();

    logger.alarm(`Enabling alarm — arrival: ${arrivalTime.toISOString()}, nominalDuration: ${nominalDurationSeconds != null ? `${Math.round(nominalDurationSeconds / 60)} min (provided)` : `${Math.round(FALLBACK_COMMUTE_SECONDS / 60)} min (fallback)`}, prepMinutes: ${config.prepMinutes}`);
    logger.alarm(`Initial wake time — raw: ${rawWakeTime.toISOString()}, failsafe: ${failsafeWake.toISOString()}${wasClamped ? ' (CLAMPED — raw was in the past)' : ''}`);

    await NotificationService.scheduleAlarm(config.id, failsafeWake, {
      type: 'alarm_fire',
      alarmId: config.id,
      wakeTime: failsafeWake.toISOString(),
    });

    store.setEnabled(true);
    store.setLastCalculatedWakeTime(failsafeWake.toISOString());
    logger.alarm(`Alarm enabled and scheduled. Destination: "${config.destination.label}", days: [${config.daysOfWeek.join(',')}]`);
  }, [store]);

  const disableAlarm = useCallback(async () => {
    const { config } = store;
    if (config) {
      logger.alarm(`Disabling alarm (id: ${config.id})`);
      await NotificationService.cancelAlarm(config.id);
    }
    store.setEnabled(false);
    logger.alarm('Alarm disabled — status → idle');
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

    logger.ui('Snooze tapped — fetching live location and traffic');

    const fetchLiveDuration = async () => {
      let originLatitude = 0;
      let originLongitude = 0;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        originLatitude = pos.coords.latitude;
        originLongitude = pos.coords.longitude;
        logger.alarm(`Snooze: location acquired — ${originLatitude.toFixed(4)},${originLongitude.toFixed(4)}`);
      } catch {
        logger.warn('Snooze: could not get location, using 0,0 origin');
      }
      const arrivalTime = buildArrivalDate(config.arrivalTime);
      logger.traffic(`Snooze: fetching live traffic to ${config.destination.label} (arrival: ${arrivalTime.toISOString()})`);
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
        10 // snooze is always close to wake time
      );
      logger.traffic(`Snooze: traffic result — ${result.durationSeconds}s (${Math.round(result.durationSeconds / 60)} min)`);
      return result.durationSeconds;
    };

    await store.snooze(fetchLiveDuration);

    const updatedWakeTime = store.lastCalculatedWakeTime;
    if (updatedWakeTime && config) {
      logger.alarm(`Snooze: scheduling re-alarm at ${updatedWakeTime}`);
      await NotificationService.scheduleAlarm(config.id, new Date(updatedWakeTime), {
        type: 'snooze_recheck',
        alarmId: config.id,
        wakeTime: updatedWakeTime,
      });
    }
  }, [store]);

  const dismiss = useCallback(async () => {
    logger.ui(`Dismiss tapped — last traffic: ${lastTrafficResult ? `${lastTrafficResult.durationSeconds}s (${Math.round(lastTrafficResult.durationSeconds / 60)} min)` : 'none'}`);
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
