import {
  format,
  addMilliseconds,
  differenceInMilliseconds,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  addDays,
  isBefore,
} from 'date-fns';

/**
 * Build the next occurrence of a given hour:minute as an absolute Date.
 * If that time today has already passed, returns tomorrow's occurrence.
 */
export function buildArrivalDate(arrivalTime: { hour: number; minute: number }): Date {
  const now = new Date();
  let date = setMilliseconds(
    setSeconds(setMinutes(setHours(now, arrivalTime.hour), arrivalTime.minute), 0),
    0
  );
  if (isBefore(date, now)) {
    date = addDays(date, 1);
  }
  return date;
}

/**
 * How many milliseconds until a target date from now.
 * Returns 0 if the target is in the past.
 */
export function msUntil(target: Date): number {
  return Math.max(0, differenceInMilliseconds(target, new Date()));
}

/**
 * Format a Date to a human-readable wake time string, e.g. "6:45 AM"
 */
export function formatWakeTime(date: Date): string {
  return format(date, 'h:mm a');
}

/**
 * Format a Date to a short date string, e.g. "Mon 14 Apr"
 */
export function formatShortDate(date: Date): string {
  return format(date, 'EEE d MMM');
}

/**
 * Format seconds as a human-readable duration, e.g. "1 hr 12 min"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/**
 * Add milliseconds to a date, returning a new Date.
 */
export function addMs(date: Date, ms: number): Date {
  return addMilliseconds(date, ms);
}
