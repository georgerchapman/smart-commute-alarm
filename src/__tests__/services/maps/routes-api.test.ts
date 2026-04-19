import type { RouteRequest, TrafficResult } from '@/src/types/traffic';

// Must mock the cache module before importing routes-api
jest.mock('@/src/services/maps/routes-cache', () => ({
  buildCacheKey: jest.fn().mockReturnValue('test-cache-key'),
  getCached: jest.fn().mockReturnValue(null), // default: cache miss
  setCached: jest.fn(),
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    ui: jest.fn(),
    alarm: jest.fn(),
    traffic: jest.fn(),
    notif: jest.fn(),
    bg: jest.fn(),
  },
}));

import { fetchRoute, RoutesFetchError } from '@/src/services/maps/routes-api';
import * as routesCache from '@/src/services/maps/routes-cache';

const mockGetCached = routesCache.getCached as jest.Mock;
const mockSetCached = routesCache.setCached as jest.Mock;

function mockFetchOk(durationSeconds = 2700, staticDuration = 2400) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      routes: [
        {
          duration: `${durationSeconds}s`,
          staticDuration: `${staticDuration}s`,
          distanceMeters: 15000,
        },
      ],
    }),
  });
}

function mockFetchStatus(status: number) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  });
}

const BASE_REQUEST: RouteRequest = {
  originLatitude: 51.5074,
  originLongitude: -0.1278,
  destinationLatitude: 51.5155,
  destinationLongitude: -0.0922,
  arrivalTime: new Date('2026-04-18T09:00:00.000Z').toISOString(),
  travelMode: 'DRIVE',
  routingPreference: 'TRAFFIC_AWARE',
};

describe('fetchRoute', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY = 'test-api-key';
    mockGetCached.mockReturnValue(null);
    jest.clearAllMocks();
  });

  describe('API key guard', () => {
    it('throws RoutesFetchError immediately when API key is not set', async () => {
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY = '';
      await expect(fetchRoute(BASE_REQUEST, 60)).rejects.toThrow(RoutesFetchError);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('cache behaviour', () => {
    it('returns cached result without making a network call', async () => {
      const cached: TrafficResult = {
        durationSeconds: 1800,
        staticDurationSeconds: 1500,
        distanceMeters: 10000,
        fetchedAt: new Date().toISOString(),
        checkpoint: 60,
        isFailsafe: false,
      };
      mockGetCached.mockReturnValue(cached);

      const result = await fetchRoute(BASE_REQUEST, 10);

      expect(global.fetch).not.toHaveBeenCalled();
      // Checkpoint on the returned value should be overridden to the requested one
      expect(result.checkpoint).toBe(10);
      expect(result.durationSeconds).toBe(1800);
    });

    it('calls setCached after a successful network fetch', async () => {
      mockFetchOk(2700);
      await fetchRoute(BASE_REQUEST, 60);
      expect(mockSetCached).toHaveBeenCalledTimes(1);
    });

    it('does not call setCached when serving from cache', async () => {
      mockGetCached.mockReturnValue({ durationSeconds: 1800, checkpoint: 60, isFailsafe: false });
      await fetchRoute(BASE_REQUEST, 60);
      expect(mockSetCached).not.toHaveBeenCalled();
    });
  });

  describe('successful fetch', () => {
    it('returns correctly parsed durationSeconds', async () => {
      mockFetchOk(3600);
      const result = await fetchRoute(BASE_REQUEST, 60);
      expect(result.durationSeconds).toBe(3600);
    });

    it('sets isFailsafe to false on success', async () => {
      mockFetchOk(2700);
      const result = await fetchRoute(BASE_REQUEST, 60);
      expect(result.isFailsafe).toBe(false);
    });

    it('uses the checkpoint argument on the returned result', async () => {
      mockFetchOk(2700);
      const result = await fetchRoute(BASE_REQUEST, 30);
      expect(result.checkpoint).toBe(30);
    });

    it('sends the correct X-Goog-FieldMask header', async () => {
      mockFetchOk(2700);
      await fetchRoute(BASE_REQUEST, 60);
      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.headers['X-Goog-FieldMask']).toBe(
        'routes.duration,routes.staticDuration,routes.distanceMeters'
      );
    });

    it('sends the API key header', async () => {
      mockFetchOk(2700);
      await fetchRoute(BASE_REQUEST, 60);
      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.headers['X-Goog-Api-Key']).toBe('test-api-key');
    });
  });

  describe('error handling', () => {
    it('throws RoutesFetchError with statusCode for a non-429 HTTP error', async () => {
      mockFetchStatus(404);
      await expect(fetchRoute(BASE_REQUEST, 60)).rejects.toMatchObject({
        name: 'RoutesFetchError',
        statusCode: 404,
      });
    });

    it('throws RoutesFetchError when response contains no routes', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ routes: [] }),
      });
      await expect(fetchRoute(BASE_REQUEST, 60)).rejects.toMatchObject({
        name: 'RoutesFetchError',
        message: expect.stringContaining('no routes'),
      });
    });
  });

  describe('HTTP 429 retry', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('retries exactly once after 30 seconds and returns the successful result', async () => {
      mockFetchStatus(429);
      mockFetchOk(1800);

      const promise = fetchRoute(BASE_REQUEST, 60);
      // The code does setTimeout(r, 30_000) — advance past it
      await jest.advanceTimersByTimeAsync(30_000);
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.durationSeconds).toBe(1800);
    });

    it('throws RoutesFetchError if the retry also fails', async () => {
      mockFetchStatus(429);
      mockFetchStatus(500);

      const promise = fetchRoute(BASE_REQUEST, 60);
      // Attach rejection handler BEFORE advancing timers to prevent unhandled rejection warning
      const assertion = expect(promise).rejects.toMatchObject({ name: 'RoutesFetchError' });
      await jest.advanceTimersByTimeAsync(30_000);
      await assertion;
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
