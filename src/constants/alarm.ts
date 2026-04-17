import type { TrafficCheckpoint } from '@/src/types/traffic';

export const BACKOFF_OFFSETS_MS: Record<TrafficCheckpoint, number> = {
  90: 90 * 60 * 1000,
  60: 60 * 60 * 1000,
  30: 30 * 60 * 1000,
  15: 15 * 60 * 1000,
};

// Minimum change in wake time that warrants rescheduling the alarm notification
export const RESCHEDULE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Maximum number of snoozes before auto-dismissal
export const MAX_SNOOZE_COUNT = 3;

// Minimum gap between snooze and next ring (even if traffic says earlier)
export const MIN_SNOOZE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Default prep time if user hasn't configured one
export const DEFAULT_PREP_MINUTES = 30;

// How far in advance to start the monitoring window
export const MONITORING_WINDOW_MS = BACKOFF_OFFSETS_MS[90];

// Background fetch interval hint (OS may fire less frequently on iOS)
export const BACKGROUND_FETCH_INTERVAL_SECONDS = 15 * 60; // 15 minutes

// In-memory route cache TTL
export const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fallback static commute duration when no prior data is available
export const FALLBACK_COMMUTE_SECONDS = 45 * 60; // 45 minutes

// Number of staggered notifications scheduled per alarm to simulate a repeating ring
export const ALARM_BURST_COUNT = 8;

// Gap between each burst notification (30 seconds)
export const ALARM_BURST_INTERVAL_MS = 30_000;
