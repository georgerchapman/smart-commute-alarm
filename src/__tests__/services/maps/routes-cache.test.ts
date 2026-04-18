import {
  buildCacheKey,
  getCached,
  setCached,
  clearCache,
} from '@/src/services/maps/routes-cache';
import { ROUTE_CACHE_TTL_MS } from '@/src/constants/alarm';
import type { RouteRequest, TrafficResult } from '@/src/types/traffic';

function makeRequest(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    originLatitude: 51.5074,
    originLongitude: -0.1278,
    destinationLatitude: 51.5155,
    destinationLongitude: -0.0922,
    arrivalTime: new Date('2026-04-18T09:00:00.000Z').toISOString(),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TrafficResult> = {}): TrafficResult {
  return {
    durationSeconds: 2700,
    staticDurationSeconds: 2400,
    distanceMeters: 15000,
    fetchedAt: new Date().toISOString(),
    checkpoint: 60,
    isFailsafe: false,
    ...overrides,
  };
}

// buildCacheKey is pure (no Date.now()) so no fake timers needed here
describe('buildCacheKey', () => {
  it('produces the same key for arrival times within the same 5-minute bucket', () => {
    // 09:00, 09:01, 09:02 all round to 09:00 (frac 0.0, 0.2, 0.4 — all < 0.5)
    const req1 = makeRequest({ arrivalTime: '2026-04-18T09:00:00.000Z' });
    const req2 = makeRequest({ arrivalTime: '2026-04-18T09:01:00.000Z' });
    const req3 = makeRequest({ arrivalTime: '2026-04-18T09:02:00.000Z' });
    expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
    expect(buildCacheKey(req2)).toBe(buildCacheKey(req3));
  });

  it('produces different keys for arrival times in different 5-minute buckets', () => {
    const req1 = makeRequest({ arrivalTime: '2026-04-18T09:00:00.000Z' });
    const req2 = makeRequest({ arrivalTime: '2026-04-18T09:05:00.000Z' });
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('produces different keys for different routingPreference values', () => {
    const aware = makeRequest({ routingPreference: 'TRAFFIC_AWARE' });
    const unaware = makeRequest({ routingPreference: 'TRAFFIC_UNAWARE' });
    expect(buildCacheKey(aware)).not.toBe(buildCacheKey(unaware));
  });

  it('truncates coordinates to 4 decimal places (same key for close origins in the same bucket)', () => {
    // 51.50741 and 51.50744 both toFixed(4) → "51.5074"
    const req1 = makeRequest({ originLatitude: 51.50741 });
    const req2 = makeRequest({ originLatitude: 51.50744 });
    expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
  });

  it('produces different keys for coordinates that differ at the 4th decimal place', () => {
    const req1 = makeRequest({ originLatitude: 51.5074 });
    const req2 = makeRequest({ originLatitude: 51.5075 });
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('key contains pipe-separated fields', () => {
    const key = buildCacheKey(makeRequest());
    const parts = key.split('|');
    expect(parts).toHaveLength(6);
  });
});

describe('getCached / setCached', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
  });
  afterEach(() => jest.useRealTimers());

  it('returns null on cache miss', () => {
    expect(getCached('nonexistent-key')).toBeNull();
  });

  it('returns the stored result on cache hit within TTL', () => {
    const key = 'test-key';
    const result = makeResult();
    setCached(key, result);
    expect(getCached(key)).toEqual(result);
  });

  it('returns null and removes entry after TTL expires', () => {
    const key = 'expiring-key';
    setCached(key, makeResult());

    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS + 1);

    expect(getCached(key)).toBeNull();
  });

  it('entry is still valid at exactly TTL (expires strictly after TTL ms)', () => {
    const key = 'boundary-key';
    setCached(key, makeResult());

    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS);

    // expiresAt = Date.now() + TTL; check is Date.now() > expiresAt
    // At exactly TTL ms later, Date.now() === expiresAt, so NOT expired
    expect(getCached(key)).not.toBeNull();
  });

  it('overwrites an existing entry with a new result and fresh TTL', () => {
    const key = 'overwrite-key';
    const first = makeResult({ durationSeconds: 1800 });
    const second = makeResult({ durationSeconds: 3600 });

    setCached(key, first);
    // Advance partway through TTL
    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS / 2);
    // Overwrite with new result
    setCached(key, second);
    // Advance past the original TTL — but within new TTL
    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS / 2 + 1000);

    const cached = getCached(key);
    expect(cached).not.toBeNull();
    expect(cached!.durationSeconds).toBe(3600);
  });

  it('stores two different keys independently', () => {
    const result1 = makeResult({ durationSeconds: 1000 });
    const result2 = makeResult({ durationSeconds: 2000 });
    setCached('key-1', result1);
    setCached('key-2', result2);
    expect(getCached('key-1')!.durationSeconds).toBe(1000);
    expect(getCached('key-2')!.durationSeconds).toBe(2000);
  });
});

describe('clearCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCache();
  });
  afterEach(() => jest.useRealTimers());

  it('removes all entries', () => {
    setCached('k1', makeResult());
    setCached('k2', makeResult());
    clearCache();
    expect(getCached('k1')).toBeNull();
    expect(getCached('k2')).toBeNull();
  });
});
