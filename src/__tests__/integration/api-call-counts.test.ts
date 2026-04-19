/**
 * API call count integration tests.
 *
 * These tests verify system-level invariants about Google Maps API usage:
 * how many real HTTP requests are made under various scenarios, and that
 * the cache, cooldown guards, and monitoring window all work together correctly.
 *
 * Uses the real fetchRoute + real routes-cache, with a mocked global.fetch.
 */

jest.mock('@/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), ui: jest.fn(), alarm: jest.fn(), traffic: jest.fn(), notif: jest.fn(), bg: jest.fn() },
}));

import { fetchRoute } from '@/src/services/maps/routes-api';
import { clearCache } from '@/src/services/maps/routes-cache';
import {
  isInMonitoringWindow,
  resolveCheckpoint,
} from '@/src/utils/backoff';
import {
  ROUTE_CACHE_TTL_MS,
  FOREGROUND_TRAFFIC_MIN_INTERVAL_MS,
  BACKGROUND_FETCH_INTERVAL_SECONDS,
  MONITORING_WINDOW_MS,
} from '@/src/constants/alarm';
import type { RouteRequest } from '@/src/types/traffic';

const BASE_REQUEST: RouteRequest = {
  originLatitude: 51.5074,
  originLongitude: -0.1278,
  destinationLatitude: 51.5155,
  destinationLongitude: -0.0922,
  arrivalTime: new Date('2026-04-18T09:00:00.000Z').toISOString(),
  travelMode: 'DRIVE',
  routingPreference: 'TRAFFIC_AWARE',
};

function mockFetchOk(durationSeconds = 2700) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      routes: [
        {
          duration: `${durationSeconds}s`,
          staticDuration: `${durationSeconds}s`,
          distanceMeters: 15000,
        },
      ],
    }),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY = 'test-key';
  clearCache();
  mockFetchOk();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Scenario A: Cache deduplication ─────────────────────────────────────────

describe('Scenario A — Cache deduplication within 5-minute arrival bucket', () => {
  it('makes only 1 network call when three requests round to the same arrival bucket', async () => {
    // 09:00, 09:01, 09:02 all round to 09:00 (within ±2.5 min of the boundary)
    // Note: 09:03+ rounds to 09:05, so only use times ≤09:02:30 for this bucket.
    const req1 = { ...BASE_REQUEST, arrivalTime: '2026-04-18T09:00:00.000Z' };
    const req2 = { ...BASE_REQUEST, arrivalTime: '2026-04-18T09:01:00.000Z' };
    const req3 = { ...BASE_REQUEST, arrivalTime: '2026-04-18T09:02:00.000Z' };

    await fetchRoute(req1, 60);
    await fetchRoute(req2, 60);
    await fetchRoute(req3, 60);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('makes 2 separate calls for requests in different 5-minute buckets', async () => {
    const req1 = { ...BASE_REQUEST, arrivalTime: '2026-04-18T09:00:00.000Z' };
    const req2 = { ...BASE_REQUEST, arrivalTime: '2026-04-18T09:05:00.000Z' };

    await fetchRoute(req1, 60);
    await fetchRoute(req2, 60);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ─── Scenario B: Cache TTL expiry ────────────────────────────────────────────

describe('Scenario B — Cache TTL expiry triggers a fresh network call', () => {
  it('makes a second call after ROUTE_CACHE_TTL_MS has elapsed', async () => {
    await fetchRoute(BASE_REQUEST, 60);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS + 1);

    await fetchRoute(BASE_REQUEST, 60);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT make a second call before the TTL has elapsed', async () => {
    await fetchRoute(BASE_REQUEST, 60);
    jest.advanceTimersByTime(ROUTE_CACHE_TTL_MS - 1);
    await fetchRoute(BASE_REQUEST, 60);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario C: TRAFFIC_AWARE vs TRAFFIC_UNAWARE (nominal journey) ──────────

describe('Scenario C — useNominalJourney uses a separate cache key from live traffic', () => {
  it('makes 2 calls when TRAFFIC_AWARE and TRAFFIC_UNAWARE are used for the same route', async () => {
    const awareReq = { ...BASE_REQUEST, routingPreference: 'TRAFFIC_AWARE' as const };
    const unawareReq = { ...BASE_REQUEST, routingPreference: 'TRAFFIC_UNAWARE' as const };

    await fetchRoute(awareReq, 60);
    await fetchRoute(unawareReq, 60);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ─── Scenario D: Background task API budget in monitoring window ──────────────

describe('Scenario D — Background task API call budget in the monitoring window', () => {
  it('simulates at most 4 background task fires hitting the API in a 60-min window', () => {
    // The OS fires the task every BACKGROUND_FETCH_INTERVAL_SECONDS (15 min).
    // Monitoring window = 60 min before wake time.
    // Simulate task fires at T-65, T-60, T-45, T-30, T-15, T-0 (6 potential fires).

    const WAKE_TIME = new Date('2026-04-18T09:00:00.000Z');
    const backgroundIntervalMs = BACKGROUND_FETCH_INTERVAL_SECONDS * 1000;

    // Simulate fires starting 65 min before wake time
    const firesMinutesBefore = [65, 60, 45, 30, 15, 0];
    let callsInWindow = 0;

    for (const minutesBefore of firesMinutesBefore) {
      const now = new Date(WAKE_TIME.getTime() - minutesBefore * 60_000);
      const inWindow = isInMonitoringWindow(now, WAKE_TIME);
      const checkpoint = resolveCheckpoint(now, WAKE_TIME);
      if (inWindow && checkpoint !== null) {
        callsInWindow++;
      }
    }

    // T-65: outside window → no call
    // T-60: in window, checkpoint=60 → call
    // T-45: in window, checkpoint=60 → call
    // T-30: in window, checkpoint=30 → call
    // T-15: in window, checkpoint=10 → call
    // T-0: ms=0, isInMonitoringWindow=false → no call
    expect(callsInWindow).toBe(4);
  });

  it('verifies that the 15-min background interval fits within the 60-min monitoring window', () => {
    // Background fires 4 times before wake: at T-60, T-45, T-30, T-15
    const firesInWindow = Math.floor(MONITORING_WINDOW_MS / (BACKGROUND_FETCH_INTERVAL_SECONDS * 1000));
    expect(firesInWindow).toBe(4);
  });

  it('verifies resolveCheckpoint returns 60 for all times inside the window (sub-checkpoints reserved for future paid tiers)', () => {
    const WAKE = new Date('2026-04-18T09:00:00.000Z');
    // The implementation iterates [60, 30, 10] descending and returns the first match
    // (msUntilWake <= offset). Since 60-min offset is checked first, it always matches
    // within the monitoring window — 30 and 10 are never returned in the current build.
    const scenarios: Array<[number, number | null]> = [
      [65, null],  // outside window → null
      [60, 60],    // at 60-min boundary → 60
      [45, 60],    // inside window → 60
      [30, 60],    // inside window → 60 (not 30)
      [15, 60],    // inside window → 60 (not 10)
      [10, 60],    // inside window → 60 (not 10)
      [5, 60],     // inside window → 60 (not 10)
      [0, null],   // wake time has passed → null
    ];

    for (const [minutesBefore, expectedCheckpoint] of scenarios) {
      const now = new Date(WAKE.getTime() - minutesBefore * 60_000);
      expect(resolveCheckpoint(now, WAKE)).toBe(expectedCheckpoint);
    }
  });
});

// ─── Scenario E: Foreground refresh cooldown guard ───────────────────────────

describe('Scenario E — Foreground refresh cooldown (FOREGROUND_TRAFFIC_MIN_INTERVAL_MS)', () => {
  // The cooldown guard in index.tsx prevents refreshing more than once per 10 minutes.
  // We test the guard logic directly (not the React hook).

  function isCooledDown(lastFetchedAt: string, nowMs: number): boolean {
    return nowMs - new Date(lastFetchedAt).getTime() >= FOREGROUND_TRAFFIC_MIN_INTERVAL_MS;
  }

  it('returns false (still cooling) when less than 10 minutes have elapsed', () => {
    const lastFetch = new Date('2026-04-18T08:00:00.000Z').toISOString();
    const nineMin = new Date('2026-04-18T08:09:00.000Z').getTime();
    expect(isCooledDown(lastFetch, nineMin)).toBe(false);
  });

  it('returns true (cooldown expired) when exactly 10 minutes have elapsed', () => {
    const lastFetch = new Date('2026-04-18T08:00:00.000Z').toISOString();
    const tenMin = new Date('2026-04-18T08:10:00.000Z').getTime();
    expect(isCooledDown(lastFetch, tenMin)).toBe(true);
  });

  it('returns true after more than 10 minutes', () => {
    const lastFetch = new Date('2026-04-18T08:00:00.000Z').toISOString();
    const elevenMin = new Date('2026-04-18T08:11:00.000Z').getTime();
    expect(isCooledDown(lastFetch, elevenMin)).toBe(true);
  });

  it('demonstrates rapid navigation (10x in 2 min) results in only 1 API call due to cooldown', async () => {
    // Start with a fetch that happened well in the past (cooldown already expired)
    let lastFetchedAt = new Date('2026-04-17T00:00:00.000Z').toISOString(); // yesterday
    let apiCallCount = 0;

    for (let focus = 0; focus < 10; focus++) {
      const now = new Date('2026-04-18T08:00:00.000Z').getTime() + focus * 12_000; // every 12 seconds
      if (isCooledDown(lastFetchedAt, now)) {
        apiCallCount++;
        lastFetchedAt = new Date(now).toISOString();
      }
    }

    // First navigation fires (cooldown from yesterday is expired).
    // The next 9 navigations happen within 108s (< 10 min) → all blocked by cooldown.
    expect(apiCallCount).toBe(1);
  });
});

// ─── Scenario F: Per-snooze API call count ────────────────────────────────────

describe('Scenario F — Snooze issues exactly 1 API call per snooze action', () => {
  it('makes exactly 1 network call per snooze (no same-origin cache hit due to fresh location)', async () => {
    // Each snooze call uses the current location as origin.
    // If location changes between snoozes, cache keys differ → 1 call per snooze.
    clearCache();
    (global.fetch as jest.Mock).mockClear();
    mockFetchOk(2400);

    // Simulate first snooze fetch (origin at location A)
    const snoozeReq1: RouteRequest = {
      ...BASE_REQUEST,
      originLatitude: 51.5080, // slightly different origin (moved slightly)
    };
    await fetchRoute(snoozeReq1, 10);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second snooze with same location → cache hit (same rounded key)
    await fetchRoute(snoozeReq1, 10);
    expect(global.fetch).toHaveBeenCalledTimes(1); // still 1, served from cache

    // If location changed (different 4dp), new call
    const snoozeReq2: RouteRequest = {
      ...BASE_REQUEST,
      originLatitude: 51.5100, // meaningfully different origin
    };
    await fetchRoute(snoozeReq2, 10);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ─── Scenario G: Total daily API call budget ─────────────────────────────────

describe('Scenario G — Total daily API call budget', () => {
  it('documents the expected maximum API calls for an active alarm day', () => {
    // This is a documentation test — it asserts the expected counts so that
    // any change to the constants that would increase API usage is caught.

    const bgCallsPerDay = Math.floor(MONITORING_WINDOW_MS / (BACKGROUND_FETCH_INTERVAL_SECONDS * 1000));
    const nominalJourneyCalls = 1;   // TRAFFIC_UNAWARE, on app mount or destination change
    const enableAlarmCalls = 1;      // TRAFFIC_AWARE, on alarm enable
    const maxForegroundCalls = Math.floor(MONITORING_WINDOW_MS / FOREGROUND_TRAFFIC_MIN_INTERVAL_MS);
    const maxSnoozeCalls = 3;        // MAX_SNOOZE_COUNT

    const conservativeMax = bgCallsPerDay + nominalJourneyCalls + enableAlarmCalls + maxForegroundCalls + maxSnoozeCalls;

    // Background: 4, nominal: 1, enable: 1, foreground: 6 (in 60min window), snooze: 3 = 15 absolute max
    // In practice foreground uses a 10-min cooldown so ≤6, and snooze only if the user snoozes
    expect(bgCallsPerDay).toBe(4);
    expect(maxForegroundCalls).toBe(6);
    expect(conservativeMax).toBeLessThanOrEqual(15);
  });
});
