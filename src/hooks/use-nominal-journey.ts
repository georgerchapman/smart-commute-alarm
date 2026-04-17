import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { fetchRoute } from '@/src/services/maps/routes-api';
import { buildArrivalDate } from '@/src/utils/time';
import { logger } from '@/src/utils/logger';

/**
 * Fetches the nominal (no-traffic) journey time from the current device location
 * to the configured destination. Re-fetches whenever the destination changes.
 * Silent on failure — caller should treat null as "unavailable".
 */
export function useNominalJourney() {
  const config = useAlarmStore((s) => s.config);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const destLat = config?.destination.latitude ?? 0;
  const destLng = config?.destination.longitude ?? 0;
  const hasValidDest = destLat !== 0 || destLng !== 0;

  useEffect(() => {
    if (!config || !hasValidDest) {
      setDurationSeconds(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        const arrivalTime = buildArrivalDate(config.arrivalTime);
        const result = await fetchRoute(
          {
            originLatitude: pos.coords.latitude,
            originLongitude: pos.coords.longitude,
            destinationLatitude: destLat,
            destinationLongitude: destLng,
            arrivalTime: arrivalTime.toISOString(),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
          },
          90
        );
        if (!cancelled) {
          setDurationSeconds(result.durationSeconds);
          logger.info(`Nominal journey: ${result.durationSeconds}s`);
        }
      } catch {
        // Location unavailable or API error — leave as null
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // Re-fetch only when the destination coordinates change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destLat, destLng]);

  return { durationSeconds, loading };
}
