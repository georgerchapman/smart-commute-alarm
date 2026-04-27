jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'com.apple.UNNotificationDefaultActionIdentifier',
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), ui: jest.fn(), alarm: jest.fn(), traffic: jest.fn(), notif: jest.fn(), bg: jest.fn() },
}));

import { handleNotificationResponse } from '@/src/services/notifications/notification-response-handler';
import * as Notifications from 'expo-notifications';
import type { NotificationPayload } from '@/src/types/notification';

const DEFAULT = Notifications.DEFAULT_ACTION_IDENTIFIER;

function makeCallbacks() {
  return {
    onDismiss: jest.fn(),
    onFire: jest.fn(),
    onNavigate: jest.fn(),
  };
}

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    type: 'alarm_fire',
    alarmId: 'alarm-1',
    wakeTime: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('handleNotificationResponse — DISMISS action', () => {
  it('calls onDismiss', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse('DISMISS', makePayload(), cbs);
    expect(cbs.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onFire or onNavigate', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse('DISMISS', makePayload(), cbs);
    expect(cbs.onFire).not.toHaveBeenCalled();
    expect(cbs.onNavigate).not.toHaveBeenCalled();
  });
});

describe('handleNotificationResponse — SNOOZE action', () => {
  it('calls onFire and navigates to "/"', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse('SNOOZE', makePayload(), cbs);
    expect(cbs.onFire).toHaveBeenCalledTimes(1);
    expect(cbs.onNavigate).toHaveBeenCalledWith('/');
  });

  it('does not call onDismiss', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse('SNOOZE', makePayload(), cbs);
    expect(cbs.onDismiss).not.toHaveBeenCalled();
  });
});

describe('handleNotificationResponse — DEFAULT tap (notification body)', () => {
  it('calls onFire and navigates when payload type is "alarm_fire"', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse(DEFAULT, makePayload({ type: 'alarm_fire' }), cbs);
    expect(cbs.onFire).toHaveBeenCalledTimes(1);
    expect(cbs.onNavigate).toHaveBeenCalledWith('/');
  });

  it('calls onFire and navigates when payload type is "snooze_recheck"', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse(DEFAULT, makePayload({ type: 'snooze_recheck' }), cbs);
    expect(cbs.onFire).toHaveBeenCalledTimes(1);
    expect(cbs.onNavigate).toHaveBeenCalledWith('/');
  });

  it('does nothing when payload type is unrecognised', () => {
    const cbs = makeCallbacks();
    const unknownPayload = { type: 'unknown' } as unknown as NotificationPayload;
    handleNotificationResponse(DEFAULT, unknownPayload, cbs);
    expect(cbs.onFire).not.toHaveBeenCalled();
    expect(cbs.onNavigate).not.toHaveBeenCalled();
  });

  it('does nothing when payload is null', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse(DEFAULT, null, cbs);
    expect(cbs.onFire).not.toHaveBeenCalled();
    expect(cbs.onDismiss).not.toHaveBeenCalled();
  });

  it('does not call onDismiss', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse(DEFAULT, makePayload(), cbs);
    expect(cbs.onDismiss).not.toHaveBeenCalled();
  });
});

describe('handleNotificationResponse — unknown action', () => {
  it('does nothing for an unrecognised action identifier', () => {
    const cbs = makeCallbacks();
    handleNotificationResponse('SOME_OTHER_ACTION', makePayload(), cbs);
    expect(cbs.onDismiss).not.toHaveBeenCalled();
    expect(cbs.onFire).not.toHaveBeenCalled();
    expect(cbs.onNavigate).not.toHaveBeenCalled();
  });
});
