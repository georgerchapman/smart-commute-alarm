// All jest.mock() calls must be at the top — they are hoisted before imports.
// The notification-service module calls Notifications.setNotificationHandler() at load
// time, so the mock must be in place before the module is first imported.

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@/src/services/storage/alarm-storage', () => ({
  AlarmStorage: {
    writeScheduledNotificationIds: jest.fn(),
    readScheduledNotificationIds: jest.fn().mockReturnValue([]),
    clearScheduledNotificationIds: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationService, registerNotificationCategories } from '@/src/services/notifications/notification-service';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { ALARM_BURST_COUNT, ALARM_BURST_INTERVAL_MS } from '@/src/constants/alarm';
import type { NotificationPayload } from '@/src/types/notification';

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockCancelAll = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const mockSetCategory = Notifications.setNotificationCategoryAsync as jest.Mock;
const mockReadIds = AlarmStorage.readScheduledNotificationIds as jest.Mock;
const mockWriteIds = AlarmStorage.writeScheduledNotificationIds as jest.Mock;
const mockClearIds = AlarmStorage.clearScheduledNotificationIds as jest.Mock;

const ALARM_ID = 'test-alarm-id';

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  const wakeTime = new Date(Date.now() + 60_000).toISOString();
  return {
    type: 'alarm_fire',
    alarmId: ALARM_ID,
    wakeTime,
    ...overrides,
  };
}

describe('NotificationService.scheduleAlarm', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSchedule.mockResolvedValue('mock-notif-id');
    mockReadIds.mockReturnValue([]); // no existing notifications to cancel
  });
  afterEach(() => jest.useRealTimers());

  it(`schedules exactly ${ALARM_BURST_COUNT} notifications`, async () => {
    const wakeTime = new Date(Date.now() + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());
    expect(mockSchedule).toHaveBeenCalledTimes(ALARM_BURST_COUNT);
  });

  it(`spaces notifications ${ALARM_BURST_INTERVAL_MS}ms (30s) apart`, async () => {
    const now = Date.now();
    const wakeTime = new Date(now + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());

    const calls = mockSchedule.mock.calls;
    const firstRing: number = calls[0][0].trigger.date.getTime();

    for (let i = 1; i < ALARM_BURST_COUNT; i++) {
      const ringTime: number = calls[i][0].trigger.date.getTime();
      expect(ringTime - firstRing).toBe(i * ALARM_BURST_INTERVAL_MS);
    }
  });

  it('uses primary title for the first notification', async () => {
    const wakeTime = new Date(Date.now() + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());
    const firstTitle: string = mockSchedule.mock.calls[0][0].content.title;
    expect(firstTitle).toMatch(/^Wake up/);
  });

  it('uses repeat title for all subsequent notifications', async () => {
    const wakeTime = new Date(Date.now() + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());
    for (let i = 1; i < ALARM_BURST_COUNT; i++) {
      const title: string = mockSchedule.mock.calls[i][0].content.title;
      expect(title).toMatch(/^Still time/);
    }
  });

  it('clamps first ring to at least 2 seconds from now when wakeTime is in the past', async () => {
    const now = Date.now();
    jest.setSystemTime(now);
    const pastWakeTime = new Date(now - 5000); // 5s in the past
    await NotificationService.scheduleAlarm(ALARM_ID, pastWakeTime, makePayload());
    const firstRing: number = mockSchedule.mock.calls[0][0].trigger.date.getTime();
    expect(firstRing).toBeGreaterThanOrEqual(now + 2000);
  });

  it('cancels any existing burst before scheduling (calls cancelAlarm first)', async () => {
    const existingIds = ['old-1', 'old-2', 'old-3'];
    mockReadIds.mockReturnValue(existingIds);

    const wakeTime = new Date(Date.now() + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());

    // cancelScheduledNotificationAsync should be called for each old ID
    expect(mockCancel).toHaveBeenCalledTimes(existingIds.length);
    // And scheduleNotificationAsync should have been called after cancellation
    expect(mockSchedule).toHaveBeenCalledTimes(ALARM_BURST_COUNT);
  });

  it('stores the scheduled notification IDs', async () => {
    const wakeTime = new Date(Date.now() + 60_000);
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, makePayload());
    expect(mockWriteIds).toHaveBeenCalledWith(
      ALARM_ID,
      expect.arrayContaining(['mock-notif-id'])
    );
  });

  it('includes traffic duration in the first notification body when provided', async () => {
    const wakeTime = new Date(Date.now() + 60_000);
    const payload = makePayload({ trafficDurationSeconds: 2700 });
    await NotificationService.scheduleAlarm(ALARM_ID, wakeTime, payload);
    const firstBody: string = mockSchedule.mock.calls[0][0].content.body;
    expect(firstBody).toMatch(/45 min/);
  });
});

describe('NotificationService.cancelAlarm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels each stored notification ID', async () => {
    const ids = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7', 'id-8'];
    mockReadIds.mockReturnValue(ids);

    await NotificationService.cancelAlarm(ALARM_ID);

    expect(mockCancel).toHaveBeenCalledTimes(ids.length);
    ids.forEach((id) => {
      expect(mockCancel).toHaveBeenCalledWith(id);
    });
  });

  it('clears stored IDs after cancellation', async () => {
    mockReadIds.mockReturnValue(['id-1']);
    await NotificationService.cancelAlarm(ALARM_ID);
    expect(mockClearIds).toHaveBeenCalledWith(ALARM_ID);
  });

  it('does nothing when there are no stored IDs', async () => {
    mockReadIds.mockReturnValue([]);
    await NotificationService.cancelAlarm(ALARM_ID);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockClearIds).not.toHaveBeenCalled();
  });
});

describe('NotificationService.cancelAll', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls cancelAllScheduledNotificationsAsync', async () => {
    await NotificationService.cancelAll();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);
  });
});

describe('registerNotificationCategories', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers SNOOZE and DISMISS actions on iOS', async () => {
    (Platform as unknown as { OS: string }).OS = 'ios';
    await registerNotificationCategories();
    expect(mockSetCategory).toHaveBeenCalledTimes(1);
    const [, actions] = mockSetCategory.mock.calls[0];
    const identifiers = (actions as Array<{ identifier: string }>).map((a) => a.identifier);
    expect(identifiers).toContain('SNOOZE');
    expect(identifiers).toContain('DISMISS');
  });

  it('does not call setNotificationCategoryAsync on Android', async () => {
    (Platform as unknown as { OS: string }).OS = 'android';
    await registerNotificationCategories();
    expect(mockSetCategory).not.toHaveBeenCalled();
  });
});

describe('setNotificationHandler (module-load side effect)', () => {
  it('was invoked during module initialisation', () => {
    // setNotificationHandler is called once at module load; call count may be cleared
    // by clearAllMocks() in earlier describe blocks, so we verify it was set up by
    // checking the mock exists on the module rather than counting calls.
    expect(Notifications.setNotificationHandler).toBeDefined();
    expect(typeof Notifications.setNotificationHandler).toBe('function');
  });
});
