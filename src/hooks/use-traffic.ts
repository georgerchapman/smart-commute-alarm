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

      if (!config) {
        logger.debug('[use-traffic] refresh called but no alarm config — skipping');
        return null;
      }

      logger.traffic(`Foreground refresh started — origin: ${originLat.toFixed(4)},${originLng.toFixed(4)}, dest: ${config.destination.label}`);

      trafficStore.setFetching(true);
      trafficStore.setError(null);

      try {
        const arrivalTime = buildArrivalDate(config.arrivalTime);
        logger.traffic(`Arrival target: ${arrivalTime.toISOString()} (${config.arrivalTime.hour}:${String(config.arrivalTime.minute).padStart(2, '0')})`);

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

          const diffMs = currentWake ? Math.abs(liveWake.getTime() - currentWake.getTime()) : null;
          logger.traffic(`Wake time comparison — current: ${currentWake?.toISOString() ?? 'none'}, live: ${liveWake.toISOString()}, diff: ${diffMs !== null ? `${Math.round(diffMs / 1000)}s` : 'N/A (no current)'}`);

          if (!currentWake || shouldReschedule(currentWake, liveWake)) {
            logger.traffic(`Rescheduling alarm → ${liveWake.toISOString()} (traffic: ${result.durationSeconds}s = ${Math.round(result.durationSeconds / 60)} min, prep: ${config.prepMinutes} min)`);
            await NotificationService.rescheduleAlarm(config.id, liveWake, result);
            setLastCalculatedWakeTime(liveWake.toISOString());
          } else {
            logger.traffic(`Wake time within threshold — no reschedule (diff: ${Math.round((diffMs ?? 0) / 1000)}s < 120s)`);
          }
        } else {
          logger.traffic('Alarm not enabled — skipping reschedule check');
        }

        return result;
      } catch (err) {
        const message =
          err instanceof RoutesFetchError ? err.message : 'Failed to fetch traffic';
        logger.error(`Traffic refresh failed: ${message}`, err);
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
