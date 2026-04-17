import { useCallback } from 'react';
import { useTrafficStore } from '@/src/stores/traffic-store';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { fetchRoute, RoutesFetchError } from '@/src/services/maps/routes-api';
import { buildArrivalDate } from '@/src/utils/time';
import { FALLBACK_COMMUTE_SECONDS } from '@/src/constants/alarm';
import type { TrafficResult } from '@/src/types/traffic';
import { logger } from '@/src/utils/logger';

export function useTraffic() {
  const trafficStore = useTrafficStore();
  const alarmConfig = useAlarmStore((s) => s.config);

  const refresh = useCallback(
    async (
      originLat: number,
      originLng: number
    ): Promise<TrafficResult | null> => {
      if (!alarmConfig) return null;

      trafficStore.setFetching(true);
      trafficStore.setError(null);

      try {
        const arrivalTime = buildArrivalDate(alarmConfig.arrivalTime);
        const result = await fetchRoute(
          {
            originLatitude: originLat,
            originLongitude: originLng,
            destinationLatitude: alarmConfig.destination.latitude,
            destinationLongitude: alarmConfig.destination.longitude,
            arrivalTime: arrivalTime.toISOString(),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE',
          },
          60
        );
        trafficStore.setResult(result);
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
    [alarmConfig, trafficStore]
  );

  return {
    lastResult: trafficStore.lastResult,
    lastFetchedAt: trafficStore.lastFetchedAt,
    isFetching: trafficStore.isFetching,
    error: trafficStore.error,
    refresh,
  };
}
