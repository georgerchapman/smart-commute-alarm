import { ROUTE_CACHE_TTL_MS } from '@/src/constants/alarm';
import type { RouteRequest, TrafficResult } from '@/src/types/traffic';

interface CacheEntry {
  result: TrafficResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Rounds a timestamp to the nearest 5 minutes to improve hit rate
 * on requests made within the same planning window.
 */
function roundTo5Minutes(isoString: string): string {
  const ms = new Date(isoString).getTime();
  const rounded = Math.round(ms / (5 * 60 * 1000)) * (5 * 60 * 1000);
  return new Date(rounded).toISOString();
}

export function buildCacheKey(request: RouteRequest): string {
  return [
    request.originLatitude.toFixed(4),
    request.originLongitude.toFixed(4),
    request.destinationLatitude.toFixed(4),
    request.destinationLongitude.toFixed(4),
    roundTo5Minutes(request.arrivalTime),
    request.routingPreference,
  ].join('|');
}

export function getCached(key: string): TrafficResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCached(key: string, result: TrafficResult): void {
  cache.set(key, { result, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
}

export function clearCache(): void {
  cache.clear();
}
