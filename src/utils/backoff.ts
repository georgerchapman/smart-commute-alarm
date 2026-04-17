import {
  BACKOFF_OFFSETS_MS,
  MONITORING_WINDOW_MS,
  RESCHEDULE_THRESHOLD_MS,
} from '@/src/constants/alarm';
import type { TrafficCheckpoint } from '@/src/types/traffic';

/**
 * Core formula: W = T_arrival - (D_live + P_prep)
 * Returns the absolute Date for wake-up.
 */
export function calculateWakeTime(
  arrivalTime: Date,
  trafficDurationSeconds: number,
  prepMinutes: number
): Date {
  const totalBufferMs = (trafficDurationSeconds + prepMinutes * 60) * 1000;
  return new Date(arrivalTime.getTime() - totalBufferMs);
}

/**
 * Returns true if the proposed wake time differs from current by more than
 * RESCHEDULE_THRESHOLD_MS — i.e. is worth rescheduling the alarm notification.
 */
export function shouldReschedule(currentWakeTime: Date, newWakeTime: Date): boolean {
  return (
    Math.abs(newWakeTime.getTime() - currentWakeTime.getTime()) > RESCHEDULE_THRESHOLD_MS
  );
}

/**
 * Returns the active checkpoint (60 / 30 / 10 min) based on how far away the
 * scheduled wake time is, or null if the wake time has already passed or is
 * more than 60 minutes away (outside the monitoring window).
 *
 * All checkpoints are relative to the *wake time*, not the arrival time.
 * This means traffic checks start at T_wake − 60 min regardless of journey length.
 */
export function resolveCheckpoint(
  now: Date,
  wakeTime: Date
): TrafficCheckpoint | null {
  const msUntilWake = wakeTime.getTime() - now.getTime();

  if (msUntilWake <= 0) return null; // wake time has already passed

  const checkpoints: TrafficCheckpoint[] = [60, 30, 10];

  for (const cp of checkpoints) {
    if (msUntilWake <= BACKOFF_OFFSETS_MS[cp]) {
      return cp;
    }
  }

  return null; // more than 60 minutes away — not yet in monitoring window
}

/**
 * Returns true if now is within MONITORING_WINDOW_MS (60 min) of the
 * scheduled wake time. All window logic is wake-time relative.
 */
export function isInMonitoringWindow(now: Date, wakeTime: Date): boolean {
  const ms = wakeTime.getTime() - now.getTime();
  return ms > 0 && ms <= MONITORING_WINDOW_MS;
}
