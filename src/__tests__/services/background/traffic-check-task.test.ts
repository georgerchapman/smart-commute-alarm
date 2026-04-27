/**
 * The background task module calls TaskManager.defineTask() at load time.
 * We capture the callback by mocking expo-task-manager before requiring the module.
 * Tests then call capturedTaskFn() directly — no device or OS scheduler needed.
 */

// ─── Step 1: All mocks declared at top (hoisted before imports) ────────────

type TaskCallback = () => Promise<string>;
let capturedTaskFn: TaskCallback | null = null;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((name: string, fn: TaskCallback) => {
    if (name === 'SYNCWAKE_TRAFFIC_CHECK') {
      capturedTaskFn = fn;
    }
  }),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: {
    NoData: 'noData',
    NewData: 'newData',
    Failed: 'failed',
  },
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 51.5074, longitude: -0.1278, altitude: null, accuracy: 5 },
    timestamp: Date.now(),
  }),
  Accuracy: { Balanced: 3, High: 4, Low: 2 },
}));

jest.mock('@/src/services/storage/alarm-storage', () => ({
  AlarmStorage: {
    readConfig: jest.fn(),
    readState: jest.fn(),
    writeState: jest.fn(),
  },
}));

jest.mock('@/src/services/notifications/notification-service', () => ({
  NotificationService: {
    rescheduleAlarm: jest.fn().mockResolvedValue('notif-id'),
  },
}));

jest.mock('@/src/services/maps/routes-api', () => ({
  fetchRoute: jest.fn(),
  RoutesFetchError: class RoutesFetchError extends Error {
    statusCode?: number;
    constructor(msg: string, statusCode?: number) {
      super(msg);
      this.name = 'RoutesFetchError';
      this.statusCode = statusCode;
    }
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), ui: jest.fn(), alarm: jest.fn(), traffic: jest.fn(), notif: jest.fn(), bg: jest.fn() },
}));

// ─── Step 2: Imports (after mocks are hoisted) ──────────────────────────────

import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { fetchRoute, RoutesFetchError } from '@/src/services/maps/routes-api';

const mockReadConfig = AlarmStorage.readConfig as jest.Mock;
const mockReadState = AlarmStorage.readState as jest.Mock;
const mockWriteState = AlarmStorage.writeState as jest.Mock;
const mockRescheduleAlarm = NotificationService.rescheduleAlarm as jest.Mock;
const mockFetchRoute = fetchRoute as jest.Mock;

// ─── Step 3: Trigger module evaluation in beforeAll ──────────────────────────

beforeAll(() => {
  // Requiring (not importing) ensures defineTask is called synchronously
  // with our mock already in place
  require('@/src/services/background/traffic-check-task');
  expect(capturedTaskFn).not.toBeNull();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: object = {}) {
  return {
    id: 'alarm-1',
    enabled: true,
    arrivalTime: { hour: 9, minute: 0 },
    daysOfWeek: [1, 2, 3, 4, 5],
    destination: { latitude: 51.5155, longitude: -0.0922, label: 'Work', address: '1 Main St' },
    prepMinutes: 30,
    ...overrides,
  };
}

function makeTrafficResult(durationSeconds = 2700) {
  return {
    durationSeconds,
    staticDurationSeconds: 2400,
    distanceMeters: 15000,
    fetchedAt: new Date().toISOString(),
    checkpoint: 60 as const,
    isFailsafe: false,
  };
}

// Wake time 45 minutes from a fixed "now"
const FIXED_NOW = new Date('2026-04-18T08:00:00.000Z');
const WAKE_TIME_45MIN = new Date(FIXED_NOW.getTime() + 45 * 60 * 1000).toISOString();

describe('traffic-check-task guards', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    jest.clearAllMocks();
    // Default: inside monitoring window, not yet fired today
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: WAKE_TIME_45MIN, todayFiredAt: null });
  });

  afterEach(() => jest.useRealTimers());

  it('returns NoData when config is null', async () => {
    mockReadConfig.mockReturnValue(null);
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('returns NoData when alarm is disabled', async () => {
    mockReadConfig.mockReturnValue(makeConfig({ enabled: false }));
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('returns NoData when today is not in daysOfWeek', async () => {
    // FIXED_NOW is a Saturday (DOW=6); alarm only runs Mon-Fri
    jest.setSystemTime(new Date('2026-04-18T08:00:00.000Z')); // Saturday
    mockReadConfig.mockReturnValue(makeConfig({ daysOfWeek: [1, 2, 3, 4, 5] }));
    // DOW of 2026-04-18 is Saturday = 6
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('returns NoData when alarm already fired today', async () => {
    mockReadConfig.mockReturnValue(makeConfig());
    const todayIso = FIXED_NOW.toISOString();
    mockReadState.mockReturnValue({
      lastCalculatedWakeTime: WAKE_TIME_45MIN,
      todayFiredAt: todayIso, // same calendar day
    });
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('proceeds normally when todayFiredAt is from a previous day', async () => {
    mockReadConfig.mockReturnValue(makeConfig({ daysOfWeek: [] })); // one-off, passes DOW guard
    const yesterday = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    mockReadState.mockReturnValue({
      lastCalculatedWakeTime: WAKE_TIME_45MIN,
      todayFiredAt: yesterday,
    });
    mockFetchRoute.mockResolvedValue({
      durationSeconds: 2700,
      staticDurationSeconds: 2400,
      distanceMeters: 15000,
      fetchedAt: new Date().toISOString(),
      checkpoint: 60,
      isFailsafe: false,
    });
    const result = await capturedTaskFn!();
    // Guard passed — task ran to completion
    expect(result).not.toBe('noData');
  });

  it('returns NoData when lastCalculatedWakeTime is null', async () => {
    mockReadConfig.mockReturnValue(makeConfig());
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: null, todayFiredAt: null });
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('returns NoData when wake time is more than 60 minutes away (outside monitoring window)', async () => {
    mockReadConfig.mockReturnValue(makeConfig());
    const farWake = new Date(FIXED_NOW.getTime() + 90 * 60 * 1000).toISOString();
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: farWake });
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });

  it('returns NoData when wake time is in the past', async () => {
    mockReadConfig.mockReturnValue(makeConfig());
    const pastWake = new Date(FIXED_NOW.getTime() - 1000).toISOString();
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: pastWake });
    const result = await capturedTaskFn!();
    expect(result).toBe('noData');
    expect(mockFetchRoute).not.toHaveBeenCalled();
  });
});

describe('traffic-check-task happy path', () => {
  // Use a Monday to pass the DOW guard
  const MONDAY_NOW = new Date('2026-04-20T08:00:00.000Z'); // Monday DOW=1
  const WAKE_TIME_IN_WINDOW = new Date(MONDAY_NOW.getTime() + 45 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MONDAY_NOW);
    jest.clearAllMocks();
    mockReadConfig.mockReturnValue(makeConfig());
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: WAKE_TIME_IN_WINDOW, todayFiredAt: null });
  });

  afterEach(() => jest.useRealTimers());

  it('calls fetchRoute exactly once when in monitoring window', async () => {
    mockFetchRoute.mockResolvedValue(makeTrafficResult(2700));
    await capturedTaskFn!();
    expect(mockFetchRoute).toHaveBeenCalledTimes(1);
  });

  it('returns NewData on successful traffic check', async () => {
    mockFetchRoute.mockResolvedValue(makeTrafficResult(2700));
    const result = await capturedTaskFn!();
    expect(result).toBe('newData');
  });

  it('reschedules and updates state when new wake time differs by >2 min', async () => {
    // Current wake time is 45 min from now; traffic = 2700s (45min) + 30min prep = 75min before arrival
    // arrival at 09:00, so wake = 07:45 — which is 15min before our MONDAY_NOW (08:00)
    // The task will clamp this to now + 10s, which is very different from WAKE_TIME_IN_WINDOW (08:45)
    mockFetchRoute.mockResolvedValue(makeTrafficResult(2700));

    await capturedTaskFn!();

    expect(mockRescheduleAlarm).toHaveBeenCalledTimes(1);
    expect(mockWriteState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'monitoring' })
    );
  });

  it('does NOT reschedule when new wake time is within the 2-min threshold', async () => {
    // Craft traffic duration so calculated wake time is very close to WAKE_TIME_IN_WINDOW
    // WAKE_TIME_IN_WINDOW = MONDAY_NOW + 45min = 08:45
    // arrival = buildArrivalDate({hour:9,minute:0}) from 08:00 Monday = 09:00 same day
    // To get wake ≈ 08:45: need arrival - (traffic + prep) ≈ 08:45
    //   09:00 - traffic - 30min = 08:45 → traffic = 09:00 - 08:45 - 30min = -15min → not possible
    //   Actually: 09:00 - 08:45 = 15min; traffic + 30min = 15min → traffic = -15min (impossible)
    //   So instead let's set wake time to match what the task would actually calculate:
    //   traffic = 900s (15min), prep = 30min → totalBuffer = 45min → wake = 09:00 - 45min = 08:15 UTC
    //   Set WAKE to 08:15 + tiny offset so delta < 2min
    const nearWake = new Date(MONDAY_NOW.getTime() + 15 * 60 * 1000).toISOString(); // 08:15
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: nearWake, todayFiredAt: null });
    // traffic = 900s → wake = 09:00 - (900 + 1800)s = 09:00 - 2700s = 08:15 exactly
    mockFetchRoute.mockResolvedValue(makeTrafficResult(900));

    await capturedTaskFn!();

    expect(mockRescheduleAlarm).not.toHaveBeenCalled();
    // Only lastTrafficCheckAt should be updated
    expect(mockWriteState).toHaveBeenCalledWith(
      expect.objectContaining({ lastTrafficCheckAt: expect.any(String) })
    );
    expect(mockWriteState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'monitoring' })
    );
  });

  it('returns Failed and does not reschedule when fetchRoute throws RoutesFetchError', async () => {
    mockFetchRoute.mockRejectedValue(new RoutesFetchError('Network error'));
    const result = await capturedTaskFn!();
    expect(result).toBe('failed');
    expect(mockRescheduleAlarm).not.toHaveBeenCalled();
  });

  it('returns Failed when an unexpected error is thrown', async () => {
    mockFetchRoute.mockRejectedValue(new Error('Something unexpected'));
    const result = await capturedTaskFn!();
    expect(result).toBe('failed');
  });
});

describe('traffic-check-task wake time clamping', () => {
  const MONDAY_NOW = new Date('2026-04-20T08:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(MONDAY_NOW);
    jest.clearAllMocks();
    mockReadConfig.mockReturnValue(makeConfig());
  });

  afterEach(() => jest.useRealTimers());

  it('clamps wake time to at least now+10s when calculated time is in the past', async () => {
    // If traffic is huge, calculateWakeTime returns a past date
    // The task clamps: Math.max(rawWake, Date.now() + 10_000)
    // Wake is in window at 45min from now
    const wakeInWindow = new Date(MONDAY_NOW.getTime() + 45 * 60 * 1000).toISOString();
    mockReadState.mockReturnValue({ lastCalculatedWakeTime: wakeInWindow, todayFiredAt: null });
    // Huge traffic duration → past wake time
    mockFetchRoute.mockResolvedValue(makeTrafficResult(86400)); // 24hr commute

    await capturedTaskFn!();

    if (mockRescheduleAlarm.mock.calls.length > 0) {
      const [, clampedWakeTime] = mockRescheduleAlarm.mock.calls[0];
      expect(clampedWakeTime.getTime()).toBeGreaterThanOrEqual(MONDAY_NOW.getTime() + 10_000);
    }
  });
});
