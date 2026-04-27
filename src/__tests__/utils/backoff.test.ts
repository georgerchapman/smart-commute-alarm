import {
  calculateWakeTime,
  shouldReschedule,
  resolveCheckpoint,
  isInMonitoringWindow,
} from '@/src/utils/backoff';
import {
  RESCHEDULE_THRESHOLD_MS,
  MONITORING_WINDOW_MS,
  BACKOFF_OFFSETS_MS,
} from '@/src/constants/alarm';

describe('calculateWakeTime', () => {
  const arrival = new Date('2026-04-18T09:00:00.000Z');

  it('applies the formula W = arrival - (traffic + prep) exactly', () => {
    const wake = calculateWakeTime(arrival, 2700, 30);
    // 2700s traffic + 30min prep (1800s) = 4500s total = 4,500,000ms
    expect(wake.getTime()).toBe(arrival.getTime() - 4_500_000);
  });

  it('returns arrival unchanged when both traffic and prep are zero', () => {
    expect(calculateWakeTime(arrival, 0, 0).getTime()).toBe(arrival.getTime());
  });

  it('handles zero prep with non-zero traffic', () => {
    const wake = calculateWakeTime(arrival, 3600, 0);
    expect(wake.getTime()).toBe(arrival.getTime() - 3_600_000);
  });

  it('handles zero traffic with non-zero prep', () => {
    const wake = calculateWakeTime(arrival, 0, 15);
    expect(wake.getTime()).toBe(arrival.getTime() - 900_000);
  });

  it('returns a date in the past when commute + prep exceeds time to arrival (clamping is caller responsibility)', () => {
    const nearFutureArrival = new Date(Date.now() + 60_000); // 1 min from now
    const wake = calculateWakeTime(nearFutureArrival, 7200, 60); // 2hr + 1hr = 3hr buffer
    expect(wake.getTime()).toBeLessThan(Date.now());
  });

  it('returns correct result for a 1hr commute with 30min prep', () => {
    const wake = calculateWakeTime(arrival, 3600, 30);
    // 3600s + 1800s = 5400s = 90min before arrival → 07:30 UTC
    expect(wake.toISOString()).toBe('2026-04-18T07:30:00.000Z');
  });
});

describe('shouldReschedule', () => {
  const base = new Date('2026-04-18T07:00:00.000Z');

  it('returns false when difference equals RESCHEDULE_THRESHOLD_MS exactly', () => {
    const other = new Date(base.getTime() + RESCHEDULE_THRESHOLD_MS);
    expect(shouldReschedule(base, other)).toBe(false);
  });

  it('returns true when difference exceeds threshold by 1ms', () => {
    const other = new Date(base.getTime() + RESCHEDULE_THRESHOLD_MS + 1);
    expect(shouldReschedule(base, other)).toBe(true);
  });

  it('returns false when difference is 1ms below threshold', () => {
    const other = new Date(base.getTime() + RESCHEDULE_THRESHOLD_MS - 1);
    expect(shouldReschedule(base, other)).toBe(false);
  });

  it('uses absolute value — new time earlier than current by >threshold also triggers reschedule', () => {
    const earlier = new Date(base.getTime() - RESCHEDULE_THRESHOLD_MS - 1);
    expect(shouldReschedule(base, earlier)).toBe(true);
  });

  it('returns false for identical times', () => {
    expect(shouldReschedule(base, new Date(base.getTime()))).toBe(false);
  });
});

describe('resolveCheckpoint', () => {
  it('returns null when wake time is in the past', () => {
    const past = new Date(Date.now() - 1000);
    expect(resolveCheckpoint(new Date(), past)).toBeNull();
  });

  it('returns null when wake time is more than 60 minutes away', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + BACKOFF_OFFSETS_MS[60] + 1);
    expect(resolveCheckpoint(now, wake)).toBeNull();
  });

  it('returns 60 when exactly at the 60-minute boundary', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + BACKOFF_OFFSETS_MS[60]);
    expect(resolveCheckpoint(now, wake)).toBe(60);
  });

  it('returns 60 when between 15 and 60 minutes away', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 45 * 60 * 1000); // 45 min
    expect(resolveCheckpoint(now, wake)).toBe(60);
  });

  it('returns 60 when exactly at the 30-minute mark (above 15-min threshold)', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 30 * 60 * 1000);
    expect(resolveCheckpoint(now, wake)).toBe(60);
  });

  it('returns 60 when 20 minutes away (above 15-min threshold)', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 20 * 60 * 1000);
    expect(resolveCheckpoint(now, wake)).toBe(60);
  });

  it('returns 15 when exactly at the 15-minute boundary', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + BACKOFF_OFFSETS_MS[15]);
    expect(resolveCheckpoint(now, wake)).toBe(15);
  });

  it('returns 15 when within 15 minutes of wake time', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 10 * 60 * 1000); // 10 min
    expect(resolveCheckpoint(now, wake)).toBe(15);
  });

  it('returns 15 when 1ms before wake time', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 1);
    expect(resolveCheckpoint(now, wake)).toBe(15);
  });
});

describe('isInMonitoringWindow', () => {
  it('returns true when inside the window', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + 30 * 60 * 1000); // 30 min away
    expect(isInMonitoringWindow(now, wake)).toBe(true);
  });

  it('returns true at the exact 60-minute boundary', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + MONITORING_WINDOW_MS);
    expect(isInMonitoringWindow(now, wake)).toBe(true);
  });

  it('returns false when 1ms outside the window', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const wake = new Date(now.getTime() + MONITORING_WINDOW_MS + 1);
    expect(isInMonitoringWindow(now, wake)).toBe(false);
  });

  it('returns false when ms === 0 (now equals wake time)', () => {
    const t = new Date('2026-04-18T07:00:00Z');
    expect(isInMonitoringWindow(t, t)).toBe(false);
  });

  it('returns false when wake time is in the past', () => {
    const now = new Date('2026-04-18T07:00:00Z');
    const past = new Date(now.getTime() - 1000);
    expect(isInMonitoringWindow(now, past)).toBe(false);
  });
});
