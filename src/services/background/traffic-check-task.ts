/**
 * IMPORTANT: This file must be imported unconditionally in app/_layout.tsx
 * so that TaskManager.defineTask is called when the JS bundle loads.
 * Never lazy-load this file.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import { TRAFFIC_CHECK_TASK } from './task-definitions';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { fetchRoute, RoutesFetchError } from '@/src/services/maps/routes-api';
import { buildArrivalDate } from '@/src/utils/time';
import {
  calculateWakeTime,
  shouldReschedule,
  resolveCheckpoint,
  isInMonitoringWindow,
} from '@/src/utils/backoff';
import { FALLBACK_COMMUTE_SECONDS } from '@/src/constants/alarm';
import { logger } from '@/src/utils/logger';

TaskManager.defineTask(TRAFFIC_CHECK_TASK, async () => {
  const taskStart = Date.now();
  logger.bg('Background traffic check triggered');

  try {
    const config = AlarmStorage.readConfig();

    if (!config) {
      logger.bg('Guard: no alarm config found — returning NoData');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    if (!config.enabled) {
      logger.bg('Guard: alarm is disabled — returning NoData');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const now = new Date();

    // Day-of-week guard: skip days the alarm isn't active
    const todayDow = now.getDay(); // 0=Sun … 6=Sat
    const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    if (config.daysOfWeek.length > 0 && !config.daysOfWeek.includes(todayDow)) {
      logger.bg(`Guard: today is ${dowNames[todayDow]} (DOW=${todayDow}), not in active days [${config.daysOfWeek.map(d => dowNames[d]).join(',')}] — returning NoData`);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const state = AlarmStorage.readState();

    // Double-fire guard: if the alarm already fired today, skip until tomorrow.
    if (state.todayFiredAt) {
      const firedDate = state.todayFiredAt.slice(0, 10); // YYYY-MM-DD
      const today = now.toISOString().slice(0, 10);
      if (firedDate === today) {
        logger.bg(`Guard: alarm already fired today (${firedDate}) — returning NoData`);
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
    }

    const wakeTime = state.lastCalculatedWakeTime
      ? new Date(state.lastCalculatedWakeTime)
      : null;

    if (!wakeTime) {
      logger.bg('Guard: no scheduled wake time in state — returning NoData');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const msUntilWake = wakeTime.getTime() - now.getTime();
    logger.bg(`State: wakeTime=${wakeTime.toISOString()}, msUntilWake=${msUntilWake}ms (${Math.round(msUntilWake / 60000)} min)`);

    if (!isInMonitoringWindow(now, wakeTime)) {
      logger.bg(`Guard: outside 60-min monitoring window (${Math.round(msUntilWake / 60000)} min until wake) — returning NoData`);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const checkpoint = resolveCheckpoint(now, wakeTime);
    if (!checkpoint) {
      logger.bg('Guard: could not resolve checkpoint (wake time may be in the past) — returning NoData');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    logger.bg(`Proceeding: checkpoint=${checkpoint} min, dest="${config.destination.label}", arrival=${config.arrivalTime.hour}:${String(config.arrivalTime.minute).padStart(2,'0')}`);

    // Get current location for origin
    logger.bg('Acquiring current location...');
    const locationResult = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    logger.bg(`Location acquired: ${locationResult.coords.latitude.toFixed(4)},${locationResult.coords.longitude.toFixed(4)} (accuracy: ${locationResult.coords.accuracy?.toFixed(0)}m)`);

    const arrivalTime = buildArrivalDate(config.arrivalTime);

    let trafficResult;
    try {
      trafficResult = await fetchRoute(
        {
          originLatitude: locationResult.coords.latitude,
          originLongitude: locationResult.coords.longitude,
          destinationLatitude: config.destination.latitude,
          destinationLongitude: config.destination.longitude,
          arrivalTime: arrivalTime.toISOString(),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        },
        checkpoint
      );
      logger.bg(`Traffic result: ${trafficResult.durationSeconds}s (${Math.round(trafficResult.durationSeconds / 60)} min), static: ${trafficResult.staticDurationSeconds}s, delay: ${trafficResult.durationSeconds - trafficResult.staticDurationSeconds}s`);
    } catch (err) {
      if (err instanceof RoutesFetchError) {
        logger.warn(`BG: Routes API failed (${err.message}) — failsafe wake time remains active`);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
      throw err;
    }

    const rawWake = calculateWakeTime(
      arrivalTime,
      trafficResult.durationSeconds,
      config.prepMinutes
    );
    const newWakeTime = new Date(Math.max(rawWake.getTime(), Date.now() + 10_000));
    const wasClamped = newWakeTime.getTime() !== rawWake.getTime();

    logger.bg(`Wake time calculation: arrival=${arrivalTime.toISOString()}, traffic=${Math.round(trafficResult.durationSeconds / 60)}min, prep=${config.prepMinutes}min → raw=${rawWake.toISOString()}, new=${newWakeTime.toISOString()}${wasClamped ? ' (CLAMPED)' : ''}`);

    const diffMs = Math.abs(newWakeTime.getTime() - wakeTime.getTime());
    logger.bg(`Delta vs current wake time: ${Math.round(diffMs / 1000)}s (threshold: 120s)`);

    if (shouldReschedule(wakeTime, newWakeTime)) {
      logger.bg(`Rescheduling: delta ${Math.round(diffMs / 1000)}s > 120s threshold`);
      await NotificationService.rescheduleAlarm(config.id, newWakeTime, trafficResult);
      AlarmStorage.writeState({
        lastCalculatedWakeTime: newWakeTime.toISOString(),
        lastTrafficCheckAt: new Date().toISOString(),
        status: 'monitoring',
      });
      logger.bg(`Status → monitoring. New wake: ${newWakeTime.toISOString()}`);
    } else {
      AlarmStorage.writeState({ lastTrafficCheckAt: new Date().toISOString() });
      logger.bg(`No reschedule: delta ${Math.round(diffMs / 1000)}s ≤ 120s threshold`);
    }

    logger.bg(`Background task complete in ${Date.now() - taskStart}ms — returning NewData`);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    logger.error('Background traffic check failed with unexpected error', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export {}; // Ensure this file is treated as a module
