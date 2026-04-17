import type { RouteRequest, TrafficResult, RoutesApiResponse } from '@/src/types/traffic';
import { buildCacheKey, getCached, setCached } from './routes-cache';
import { logger } from '@/src/utils/logger';

const ROUTES_API_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

// Request only the fields we need — critical for cost control
const FIELD_MASK =
  'routes.duration,routes.staticDuration,routes.distanceMeters';

// Phase 2 addition: ',routes.polyline.encodedPolyline'

export class RoutesFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'RoutesFetchError';
  }
}

function parseDurationSeconds(durationStr: string): number {
  // Google returns e.g. "1234s"
  return parseInt(durationStr.replace('s', ''), 10);
}

async function doFetch(request: RouteRequest, apiKey: string): Promise<TrafficResult> {
  const body = {
    origin: {
      location: {
        latLng: {
          latitude: request.originLatitude,
          longitude: request.originLongitude,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: request.destinationLatitude,
          longitude: request.destinationLongitude,
        },
      },
    },
    travelMode: request.travelMode,
    routingPreference: request.routingPreference,
    arrivalTime: request.arrivalTime,
  };

  const response = await fetch(ROUTES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new RoutesFetchError(
      `Routes API returned ${response.status}`,
      response.status
    );
  }

  const data = (await response.json()) as RoutesApiResponse;
  const route = data.routes?.[0];

  if (!route) {
    throw new RoutesFetchError('Routes API returned no routes');
  }

  return {
    durationSeconds: parseDurationSeconds(route.duration),
    staticDurationSeconds: parseDurationSeconds(route.staticDuration),
    distanceMeters: route.distanceMeters,
    polylineEncoded: route.polyline?.encodedPolyline,
    fetchedAt: new Date().toISOString(),
    checkpoint: 10, // caller overrides this
    isFailsafe: false,
  };
}

/**
 * Fetch a route from the Google Maps Routes API v2.
 * Uses an in-memory cache keyed by request parameters.
 * On failure, throws RoutesFetchError — caller decides whether to use failsafe.
 */
export async function fetchRoute(
  request: RouteRequest,
  checkpoint: TrafficResult['checkpoint']
): Promise<TrafficResult> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

  if (!apiKey) {
    logger.warn('Google Maps API key is not set — using failsafe');
    throw new RoutesFetchError('API key not configured');
  }

  const cacheKey = buildCacheKey(request);
  const cached = getCached(cacheKey);
  if (cached) {
    logger.debug('Route cache hit', cacheKey);
    return { ...cached, checkpoint };
  }

  try {
    const result = await doFetch(request, apiKey);
    const withCheckpoint = { ...result, checkpoint };
    setCached(cacheKey, withCheckpoint);
    logger.info(`Route fetched: ${result.durationSeconds}s traffic duration`);
    return withCheckpoint;
  } catch (err) {
    if (err instanceof RoutesFetchError && err.statusCode === 429) {
      // Rate limited — wait 30s and retry once
      logger.warn('Rate limited by Routes API, retrying in 30s');
      await new Promise((r) => setTimeout(r, 30_000));
      const result = await doFetch(request, apiKey);
      return { ...result, checkpoint };
    }
    throw err;
  }
}
