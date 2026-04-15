import {
  BACKOFF_OFFSETS_MS,
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
 * Returns the most imminent unprocessed checkpoint given the current time
 * and arrival time, or null if all checkpoints have passed.
 *
 * Checkpoints are returned in descending order (90 → 60 → 30 → 15).
 * The "next" checkpoint is the largest offset that is still in the future
 * relative to the arrival time, but whose window has already opened
 * (i.e. now >= arrivalTime - offset).
 */
export function resolveCheckpoint(
  now: Date,
  arrivalTime: Date
): TrafficCheckpoint | null {
  const msUntilArrival = arrivalTime.getTime() - now.getTime();

  if (msUntilArrival <= 0) return null; // arrival has passed

  const checkpoints: TrafficCheckpoint[] = [90, 60, 30, 15];

  for (const cp of checkpoints) {
    if (msUntilArrival <= BACKOFF_OFFSETS_MS[cp]) {
      return cp;
    }
  }

  return null; // more than 90 minutes away — not yet in monitoring window
}

/**
 * Returns true if the given time falls within the monitoring window
 * (between T_arrival - 90min and T_arrival).
 */
export function isInMonitoringWindow(now: Date, arrivalTime: Date): boolean {
  const ms = arrivalTime.getTime() - now.getTime();
  return ms > 0 && ms <= BACKOFF_OFFSETS_MS[90];
}
