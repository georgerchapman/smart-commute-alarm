import { useCallback } from 'react';
import { useTrafficStore } from '@/src/stores/traffic-store';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { fetchRoute, RoutesFetchError } from '@/src/services/maps/routes-api';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { buildArrivalDate } from '@/src/utils/time';
import { calculateWakeTime, shouldReschedule } from '@/src/utils/backoff';
import type { TrafficResult } from '@/src/types/traffic';
import { logger } from '@/src/utils/logger';

export function useTraffic() {
  const trafficStore = useTrafficStore();

  const refresh = useCallback(
    async (
      originLat: number,
      originLng: number
    ): Promise<TrafficResult | null> => {
      // Read alarm state directly from the store (not a React selector) so we
      // always get the latest values even when called immediately after setEnabled.
      const { config, lastCalculatedWakeTime, setLastCalculatedWakeTime } =
        useAlarmStore.getState();

      if (!config) return null;

      trafficStore.setFetching(true);
      trafficStore.setError(null);

      try {
        const arrivalTime = buildArrivalDate(config.arrivalTime);
        const result = await fetchRoute(
          {
            originLatitude: originLat,
            originLongitude: originLng,
            destinationLatitude: config.destination.latitude,
            destinationLongitude: config.destination.longitude,
            arrivalTime: arrivalTime.toISOString(),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
          },
          60
        );
        trafficStore.setResult(result);

        // When the alarm is active, compare the live wake time against the
        // currently scheduled one and reschedule if it has moved meaningfully.
        if (config.enabled) {
          const rawWake = calculateWakeTime(arrivalTime, result.durationSeconds, config.prepMinutes);
          const liveWake = new Date(Math.max(rawWake.getTime(), Date.now() + 10_000));
          const currentWake = lastCalculatedWakeTime ? new Date(lastCalculatedWakeTime) : null;

          if (!currentWake || shouldReschedule(currentWake, liveWake)) {
            await NotificationService.rescheduleAlarm(config.id, liveWake, result);
            setLastCalculatedWakeTime(liveWake.toISOString());
            logger.info(
              `Foreground traffic: alarm rescheduled to ${liveWake.toISOString()} (${result.durationSeconds}s)`
            );
          } else {
            logger.debug('Foreground traffic: wake time unchanged, no reschedule needed');
          }
        }

        return result;
      } catch (err) {
        const message =
          err instanceof RoutesFetchError ? err.message : 'Failed to fetch traffic';
        logger.error('Traffic refresh failed', err);
        trafficStore.setError(message);
        return null;
      } finally {
        trafficStore.setFetching(false);
      }
    },
    [trafficStore]
  );

  return {
    lastResult: trafficStore.lastResult,
    lastFetchedAt: trafficStore.lastFetchedAt,
    isFetching: trafficStore.isFetching,
    error: trafficStore.error,
    refresh,
  };
}
