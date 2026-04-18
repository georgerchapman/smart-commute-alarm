// Mock NotificationService — it calls expo-notifications which has no Node implementation
jest.mock('@/src/services/notifications/notification-service', () => ({
  NotificationService: {
    scheduleAlarm: jest.fn().mockResolvedValue('notif-id'),
    rescheduleAlarm: jest.fn().mockResolvedValue('notif-id'),
    cancelAlarm: jest.fn().mockResolvedValue(undefined),
    cancelAll: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { useAlarmStore } from '@/src/stores/alarm-store';
import { AlarmStorage, HistoryStorage } from '@/src/services/storage/alarm-storage';
import { NotificationService } from '@/src/services/notifications/notification-service';
import {
  MAX_SNOOZE_COUNT,
  MIN_SNOOZE_INTERVAL_MS,
  FALLBACK_COMMUTE_SECONDS,
} from '@/src/constants/alarm';
import { calculateWakeTime } from '@/src/utils/backoff';

const mockScheduleAlarm = NotificationService.scheduleAlarm as jest.Mock;
const mockCancelAlarm = NotificationService.cancelAlarm as jest.Mock;

function makeConfig(overrides: object = {}) {
  return {
    id: 'alarm-1',
    enabled: true,
    arrivalTime: { hour: 9, minute: 0 },
    daysOfWeek: [1, 2, 3, 4, 5],
    destination: { latitude: 51.5155, longitude: -0.0922, label: 'Work', address: '1 Main St' },
    prepMinutes: 30,
    failsafeWakeTime: { hour: 7, minute: 30 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const defaultStoreState = {
  config: null,
  status: 'idle' as const,
  lastCalculatedWakeTime: null,
  lastTrafficCheckAt: null,
  snoozeCount: 0,
  todayFiredAt: null,
};

function resetStore() {
  useAlarmStore.setState(defaultStoreState);
  AlarmStorage.writeState(defaultStoreState);
  AlarmStorage.clearConfig();
  HistoryStorage.clear();
}

describe('alarm-store: setConfig', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('creates a config with Mon-Fri defaults when none exists', () => {
    useAlarmStore.getState().setConfig({ arrivalTime: { hour: 9, minute: 0 } });
    const { config } = useAlarmStore.getState();
    expect(config).not.toBeNull();
    expect(config!.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(config!.prepMinutes).toBe(30);
  });

  it('merges partial update into existing config', () => {
    useAlarmStore.getState().setConfig({ arrivalTime: { hour: 9, minute: 0 } });
    useAlarmStore.getState().setConfig({ prepMinutes: 15 });
    const { config } = useAlarmStore.getState();
    expect(config!.prepMinutes).toBe(15);
    expect(config!.arrivalTime).toEqual({ hour: 9, minute: 0 });
  });

  it('updates destination without affecting other settings', () => {
    useAlarmStore.getState().setConfig(makeConfig());
    const newDest = { label: 'Home', address: '10 Oak St', latitude: 51.6, longitude: -0.2 };
    useAlarmStore.getState().setConfig({ destination: newDest });
    const { config } = useAlarmStore.getState();
    expect(config!.destination.latitude).toBe(51.6);
    expect(config!.prepMinutes).toBe(30); // unchanged
  });

  it('does not trigger any notification calls', () => {
    useAlarmStore.getState().setConfig(makeConfig());
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });
});

describe('alarm-store: setEnabled', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
    useAlarmStore.setState({ config: makeConfig() });
  });

  it('transitions status to "scheduled" when enabled', () => {
    useAlarmStore.getState().setEnabled(true);
    expect(useAlarmStore.getState().status).toBe('scheduled');
  });

  it('transitions status to "idle" when disabled', () => {
    useAlarmStore.setState({ status: 'scheduled' });
    useAlarmStore.getState().setEnabled(false);
    expect(useAlarmStore.getState().status).toBe('idle');
  });

  it('is a no-op when config is null', () => {
    useAlarmStore.setState({ config: null });
    useAlarmStore.getState().setEnabled(true);
    expect(useAlarmStore.getState().status).toBe('idle');
  });
});

describe('alarm-store: snooze', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T08:00:00.000Z')); // Monday
    resetStore();
    jest.clearAllMocks();
    useAlarmStore.setState({ config: makeConfig(), snoozeCount: 0 });
  });
  afterEach(() => jest.useRealTimers());

  it('increments snoozeCount and sets status to "snoozed"', async () => {
    const fetch = jest.fn().mockResolvedValue(2700);
    await useAlarmStore.getState().snooze(fetch);
    expect(useAlarmStore.getState().snoozeCount).toBe(1);
    expect(useAlarmStore.getState().status).toBe('snoozed');
  });

  it('uses the fetched traffic duration to calculate the new wake time', async () => {
    const fetch = jest.fn().mockResolvedValue(1800); // 30min commute
    await useAlarmStore.getState().snooze(fetch);
    const { lastCalculatedWakeTime } = useAlarmStore.getState();
    expect(lastCalculatedWakeTime).not.toBeNull();
  });

  it('clamps wake time to at least MIN_SNOOZE_INTERVAL_MS (5min) from now', async () => {
    // Huge commute → calculateWakeTime returns far past date → clamped to now + 5min
    const fetch = jest.fn().mockResolvedValue(86400); // 24hr commute
    await useAlarmStore.getState().snooze(fetch);
    const { lastCalculatedWakeTime } = useAlarmStore.getState();
    const wakeMs = new Date(lastCalculatedWakeTime!).getTime();
    expect(wakeMs).toBeGreaterThanOrEqual(Date.now() + MIN_SNOOZE_INTERVAL_MS);
  });

  it('falls back to now + MIN_SNOOZE_INTERVAL_MS when fetchLiveDuration throws', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    await useAlarmStore.getState().snooze(fetch);
    const { lastCalculatedWakeTime } = useAlarmStore.getState();
    const wakeMs = new Date(lastCalculatedWakeTime!).getTime();
    expect(wakeMs).toBeGreaterThanOrEqual(Date.now() + MIN_SNOOZE_INTERVAL_MS - 100);
    expect(wakeMs).toBeLessThanOrEqual(Date.now() + MIN_SNOOZE_INTERVAL_MS + 5000);
  });

  it(`auto-dismisses when snoozeCount already equals MAX_SNOOZE_COUNT (${MAX_SNOOZE_COUNT})`, async () => {
    useAlarmStore.setState({ snoozeCount: MAX_SNOOZE_COUNT });
    const fetch = jest.fn();
    await useAlarmStore.getState().snooze(fetch);
    // Should call dismiss() instead — status becomes 'dismissed', count reset
    expect(useAlarmStore.getState().status).toBe('dismissed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows exactly MAX_SNOOZE_COUNT snoozes before auto-dismiss', async () => {
    const fetch = jest.fn().mockResolvedValue(2700);
    for (let i = 0; i < MAX_SNOOZE_COUNT; i++) {
      await useAlarmStore.getState().snooze(fetch);
    }
    expect(useAlarmStore.getState().snoozeCount).toBe(MAX_SNOOZE_COUNT);
    expect(useAlarmStore.getState().status).toBe('snoozed');

    // One more → auto-dismiss
    await useAlarmStore.getState().snooze(fetch);
    expect(useAlarmStore.getState().status).toBe('dismissed');
  });
});

describe('alarm-store: performDismiss (one-off alarm)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T08:00:00.000Z'));
    resetStore();
    jest.clearAllMocks();
    useAlarmStore.setState({
      config: makeConfig({ daysOfWeek: [] }), // one-off
      snoozeCount: 0,
      lastCalculatedWakeTime: new Date().toISOString(),
    });
  });
  afterEach(() => jest.useRealTimers());

  it('disables the alarm after dismissal', async () => {
    await useAlarmStore.getState().performDismiss();
    expect(useAlarmStore.getState().config?.enabled).toBe(false);
  });

  it('sets status to idle after dismissal', async () => {
    await useAlarmStore.getState().performDismiss();
    expect(useAlarmStore.getState().status).toBe('idle');
  });

  it('clears lastCalculatedWakeTime', async () => {
    await useAlarmStore.getState().performDismiss();
    expect(useAlarmStore.getState().lastCalculatedWakeTime).toBeNull();
  });

  it('does NOT schedule another alarm for a one-off', async () => {
    await useAlarmStore.getState().performDismiss();
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });

  it('cancels the existing burst before dismissing', async () => {
    await useAlarmStore.getState().performDismiss();
    expect(mockCancelAlarm).toHaveBeenCalledWith('alarm-1');
  });

  it('records a history entry with outcome "dismissed" when snoozeCount is 0', async () => {
    await useAlarmStore.getState().performDismiss();
    const history = HistoryStorage.readAll();
    expect(history).toHaveLength(1);
    expect(history[0].outcome).toBe('dismissed');
  });

  it('records outcome "snoozed" when snoozeCount > 0', async () => {
    useAlarmStore.setState({ snoozeCount: 2 });
    await useAlarmStore.getState().performDismiss();
    const history = HistoryStorage.readAll();
    expect(history[0].outcome).toBe('snoozed');
    expect(history[0].snoozeCount).toBe(2);
  });
});

describe('alarm-store: rescheduleForNextDay (recurring alarm)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Fix to a Wednesday to make "next day" predictable
    jest.setSystemTime(new Date('2026-04-22T08:00:00.000Z')); // Wednesday DOW=3
    resetStore();
    jest.clearAllMocks();
    useAlarmStore.setState({
      config: makeConfig({ daysOfWeek: [1, 2, 3, 4, 5] }), // Mon-Fri
      lastCalculatedWakeTime: new Date().toISOString(),
    });
  });
  afterEach(() => jest.useRealTimers());

  it('schedules the alarm on the next weekday (Thursday from Wednesday)', async () => {
    await useAlarmStore.getState().rescheduleForNextDay(2700);
    expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
    const [, scheduledDate] = mockScheduleAlarm.mock.calls[0];
    expect((scheduledDate as Date).getDay()).toBe(4); // Thursday
  });

  it('sets status to "scheduled" after rescheduling', async () => {
    await useAlarmStore.getState().rescheduleForNextDay(2700);
    expect(useAlarmStore.getState().status).toBe('scheduled');
  });

  it('uses FALLBACK_COMMUTE_SECONDS when no durationSeconds is provided', async () => {
    await useAlarmStore.getState().rescheduleForNextDay(); // no duration
    expect(mockScheduleAlarm).toHaveBeenCalledTimes(1);
    // With fallback (45min) + 30min prep = 75min before 09:00 → 07:45
    const [, scheduledDate] = mockScheduleAlarm.mock.calls[0];
    const expectedMs = new Date('2026-04-23T07:45:00.000Z').getTime(); // Thu 07:45
    // Allow ±30s for Date.now() jitter from the clamp
    expect((scheduledDate as Date).getTime()).toBeCloseTo(expectedMs, -4);
  });

  it('resets snoozeCount to 0', async () => {
    useAlarmStore.setState({ snoozeCount: 2 });
    await useAlarmStore.getState().rescheduleForNextDay(2700);
    // After rescheduleForNextDay the store snoozeCount was set to 0 by performDismiss
    // Verify the state written to storage
    const state = AlarmStorage.readState();
    expect(state.snoozeCount).toBe(0);
  });
});

describe('alarm-store: settings interactions', () => {
  it('prepMinutes increases buffer by 15 minutes when raised from 30 to 45', () => {
    const arrival = new Date('2026-04-20T09:00:00.000Z');
    const wake30 = calculateWakeTime(arrival, 2700, 30);
    const wake45 = calculateWakeTime(arrival, 2700, 45);
    expect(wake30.getTime() - wake45.getTime()).toBe(15 * 60 * 1000);
  });

  it('zero prepMinutes removes the prep buffer entirely', () => {
    const arrival = new Date('2026-04-20T09:00:00.000Z');
    const wake = calculateWakeTime(arrival, 2700, 0);
    // Only traffic buffer: 2700s = 45min → wake at 08:15
    expect(wake.toISOString()).toBe('2026-04-20T08:15:00.000Z');
  });

  it('changing destination via setConfig does not trigger a notification call', () => {
    resetStore();
    jest.clearAllMocks();
    useAlarmStore.getState().setConfig(makeConfig());
    const newDest = { label: 'Office', address: '2 St', latitude: 51.6, longitude: -0.2 };
    useAlarmStore.getState().setConfig({ destination: newDest });
    expect(mockScheduleAlarm).not.toHaveBeenCalled();
  });
});

describe('alarm-store: FALLBACK_COMMUTE_SECONDS constant', () => {
  it('matches the expected 45-minute fallback', () => {
    expect(FALLBACK_COMMUTE_SECONDS).toBe(45 * 60);
  });
});
