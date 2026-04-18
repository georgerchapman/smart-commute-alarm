import {
  buildArrivalDate,
  nextOccurrenceDate,
  formatDuration,
  formatWakeTime,
  msUntil,
  formatRelativeTime,
} from '@/src/utils/time';

describe('buildArrivalDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns today when arrival time is still in the future', () => {
    // Fix now to 08:00 UTC; arrival at 09:00 → same day
    jest.setSystemTime(new Date('2026-04-18T08:00:00.000Z'));
    const result = buildArrivalDate({ hour: 9, minute: 0 });
    expect(result.toISOString()).toBe('2026-04-18T09:00:00.000Z');
  });

  it('returns tomorrow when arrival time has already passed today', () => {
    // Fix now to 10:00 UTC; arrival at 09:00 → already passed → tomorrow
    jest.setSystemTime(new Date('2026-04-18T10:00:00.000Z'));
    const result = buildArrivalDate({ hour: 9, minute: 0 });
    expect(result.toISOString()).toBe('2026-04-19T09:00:00.000Z');
  });

  it('sets seconds and milliseconds to zero', () => {
    jest.setSystemTime(new Date('2026-04-18T08:00:00.000Z'));
    const result = buildArrivalDate({ hour: 9, minute: 30 });
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('handles minute precision', () => {
    jest.setSystemTime(new Date('2026-04-18T08:00:00.000Z'));
    const result = buildArrivalDate({ hour: 9, minute: 45 });
    expect(result.getMinutes()).toBe(45);
  });
});

describe('nextOccurrenceDate', () => {
  it('returns null for an empty daysOfWeek (one-off alarm)', () => {
    expect(nextOccurrenceDate([], { hour: 9, minute: 0 })).toBeNull();
  });

  it('returns the next correct weekday starting from the next day', () => {
    // from = Wednesday 2026-04-22; next Tuesday is 2026-04-28
    const from = new Date('2026-04-22T08:00:00.000Z'); // Wednesday (DOW=3)
    const result = nextOccurrenceDate([2], { hour: 9, minute: 0 }, from); // Tuesday=2
    expect(result).not.toBeNull();
    expect(result!.getDay()).toBe(2); // Tuesday
  });

  it('never returns today — always starts from offset=1', () => {
    // from = Monday; daysOfWeek = [1] (Monday) → must return NEXT Monday
    const from = new Date('2026-04-20T08:00:00.000Z'); // Monday (DOW=1)
    const result = nextOccurrenceDate([1], { hour: 9, minute: 0 }, from);
    expect(result).not.toBeNull();
    // Next Monday should be 7 days later
    expect(result!.getTime()).toBeGreaterThan(from.getTime() + 6 * 24 * 60 * 60 * 1000);
  });

  it('sets the correct hour and minute on the result', () => {
    const from = new Date('2026-04-22T08:00:00.000Z'); // Wednesday
    const result = nextOccurrenceDate([4], { hour: 7, minute: 30 }, from); // Thursday
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(7);
    expect(result!.getMinutes()).toBe(30);
  });

  it('sets seconds and milliseconds to zero on result', () => {
    const from = new Date('2026-04-22T08:00:00.000Z');
    const result = nextOccurrenceDate([4], { hour: 9, minute: 0 }, from);
    expect(result!.getSeconds()).toBe(0);
    expect(result!.getMilliseconds()).toBe(0);
  });

  it('correctly handles Sunday (DOW=0)', () => {
    const from = new Date('2026-04-22T08:00:00.000Z'); // Wednesday
    const result = nextOccurrenceDate([0], { hour: 9, minute: 0 }, from); // Sunday
    expect(result!.getDay()).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats 0 seconds as "0 min"', () => {
    expect(formatDuration(0)).toBe('0 min');
  });

  it('formats sub-minute durations as rounded minutes', () => {
    expect(formatDuration(59)).toBe('1 min'); // rounds 0.98 → 1
  });

  it('formats exactly 1 hour with no minutes', () => {
    expect(formatDuration(3600)).toBe('1 hr');
  });

  it('formats 1 hour 1 minute', () => {
    expect(formatDuration(3660)).toBe('1 hr 1 min');
  });

  it('formats 1 hour 30 minutes', () => {
    expect(formatDuration(5400)).toBe('1 hr 30 min');
  });

  it('formats 45 minutes (FALLBACK_COMMUTE_SECONDS)', () => {
    expect(formatDuration(2700)).toBe('45 min');
  });

  it('formats 2 minutes', () => {
    expect(formatDuration(90)).toBe('2 min'); // rounds 1.5 → 2
  });
});

describe('formatWakeTime', () => {
  it('formats an AM time correctly', () => {
    const d = new Date('2026-04-18T06:45:00');
    expect(formatWakeTime(d)).toMatch(/6:45 AM/);
  });

  it('formats a PM time correctly', () => {
    const d = new Date('2026-04-18T14:00:00');
    expect(formatWakeTime(d)).toMatch(/2:00 PM/);
  });
});

describe('msUntil', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a positive number for a future target', () => {
    jest.setSystemTime(new Date('2026-04-18T08:00:00Z'));
    const target = new Date('2026-04-18T09:00:00Z');
    expect(msUntil(target)).toBe(3_600_000);
  });

  it('returns 0 for a past target (clamped by Math.max)', () => {
    jest.setSystemTime(new Date('2026-04-18T10:00:00Z'));
    const past = new Date('2026-04-18T09:00:00Z');
    expect(msUntil(past)).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns "just now" for a timestamp from 0 seconds ago', () => {
    const now = new Date('2026-04-18T08:00:00Z');
    jest.setSystemTime(now);
    expect(formatRelativeTime(now.toISOString())).toBe('just now');
  });

  it('returns "1 min ago" for exactly 1 minute ago', () => {
    jest.setSystemTime(new Date('2026-04-18T08:01:00Z'));
    expect(formatRelativeTime(new Date('2026-04-18T08:00:00Z').toISOString())).toBe('1 min ago');
  });

  it('returns "5 min ago" for 5 minutes ago', () => {
    jest.setSystemTime(new Date('2026-04-18T08:05:00Z'));
    expect(formatRelativeTime(new Date('2026-04-18T08:00:00Z').toISOString())).toBe('5 min ago');
  });
});
