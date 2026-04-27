import type { TrafficCheckpoint } from '@/src/types/traffic';

// Traffic check checkpoints — minutes before the scheduled wake time.
// CON-2: exactly two checks per alarm day (at 60 min and 15 min before wake time).
export const BACKOFF_OFFSETS_MS: Record<TrafficCheckpoint, number> = {
  60: 60 * 60 * 1000,
  15: 15 * 60 * 1000,
};

// Minimum change in wake time that warrants rescheduling the alarm notification
export const RESCHEDULE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Maximum number of snoozes before auto-dismissal
export const MAX_SNOOZE_COUNT = 3;

// Fixed snooze duration per REQ-4.2: alarm restarts exactly 540 seconds after
// Snooze is pressed, regardless of traffic updates.
export const SNOOZE_DURATION_MS = 540 * 1000; // 9 minutes (540 seconds)

// Default prep time if user hasn't configured one
export const DEFAULT_PREP_MINUTES = 30;

// Monitoring window: start checking 60 minutes before the scheduled wake time
export const MONITORING_WINDOW_MS = BACKOFF_OFFSETS_MS[60];

// Background fetch interval hint (OS may fire less frequently on iOS)
export const BACKGROUND_FETCH_INTERVAL_SECONDS = 15 * 60; // 15 minutes

// In-memory route cache TTL
export const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Minimum interval between foreground traffic refreshes on the home screen.
// Keeps API calls to once per window even if the user navigates in and out repeatedly.
export const FOREGROUND_TRAFFIC_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Fallback static commute duration when no prior data is available
export const FALLBACK_COMMUTE_SECONDS = 45 * 60; // 45 minutes

// Number of staggered notifications scheduled per alarm to simulate a repeating ring
export const ALARM_BURST_COUNT = 8;

// Gap between each burst notification (30 seconds)
export const ALARM_BURST_INTERVAL_MS = 30_000;
