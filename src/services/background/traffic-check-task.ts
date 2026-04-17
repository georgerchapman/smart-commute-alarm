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
  logger.info('Background traffic check running');

  try {
    const config = AlarmStorage.readConfig();

    if (!config || !config.enabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const now = new Date();

    // Day-of-week guard: skip days the alarm isn't active
    const todayDow = now.getDay(); // 0=Sun … 6=Sat
    if (config.daysOfWeek.length > 0 && !config.daysOfWeek.includes(todayDow)) {
      logger.info(`Today (${todayDow}) not in daysOfWeek — skipping traffic check`);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Use the currently scheduled wake time as the anchor for all window/checkpoint
    // calculations. All checks are relative to wake time, not arrival time, so that
    // the monitoring window is consistent regardless of journey length.
    const state = AlarmStorage.readState();
    const wakeTime = state.lastCalculatedWakeTime
      ? new Date(state.lastCalculatedWakeTime)
      : null;

    if (!wakeTime) {
      logger.info('No scheduled wake time — skipping traffic check');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    if (!isInMonitoringWindow(now, wakeTime)) {
      logger.info('Outside monitoring window — skipping traffic check');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const checkpoint = resolveCheckpoint(now, wakeTime);
    if (!checkpoint) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Get current location for origin
    const locationResult = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

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
    } catch (err) {
      if (err instanceof RoutesFetchError) {
        logger.warn('Routes API failed in background task — failsafe remains active', err.message);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
      throw err;
    }

    const rawWake = calculateWakeTime(
      arrivalTime,
      trafficResult.durationSeconds,
      config.prepMinutes
    );
    // Clamp so we never schedule a notification in the past
    const newWakeTime = new Date(Math.max(rawWake.getTime(), Date.now() + 10_000));

    if (shouldReschedule(wakeTime, newWakeTime)) {
      await NotificationService.rescheduleAlarm(config.id, newWakeTime, trafficResult);
      AlarmStorage.writeState({
        lastCalculatedWakeTime: newWakeTime.toISOString(),
        lastTrafficCheckAt: new Date().toISOString(),
        status: 'monitoring',
      });
      logger.info(
        `Alarm rescheduled to ${newWakeTime.toISOString()} (traffic: ${trafficResult.durationSeconds}s)`
      );
    } else {
      AlarmStorage.writeState({ lastTrafficCheckAt: new Date().toISOString() });
      logger.info('Wake time unchanged — no reschedule needed');
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    logger.error('Background traffic check failed', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export {}; // Ensure this file is treated as a module
