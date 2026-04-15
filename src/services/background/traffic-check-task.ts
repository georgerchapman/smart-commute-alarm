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
    const arrivalTime = buildArrivalDate(config.arrivalTime);

    if (!isInMonitoringWindow(now, arrivalTime)) {
      logger.info('Outside monitoring window — skipping traffic check');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const checkpoint = resolveCheckpoint(now, arrivalTime);
    if (!checkpoint) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Get current location for origin
    const locationResult = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const routingPreference =
      checkpoint <= 60 ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE';

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
          routingPreference,
        },
        checkpoint
      );
    } catch (err) {
      if (err instanceof RoutesFetchError) {
        logger.warn('Routes API failed in background task — failsafe remains active', err.message);
        // Do NOT cancel the failsafe notification — let it fire as-is
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
      throw err;
    }

    const newWakeTime = calculateWakeTime(
      arrivalTime,
      trafficResult.durationSeconds,
      config.prepMinutes
    );

    const state = AlarmStorage.readState();
    const currentWakeTime = state.lastCalculatedWakeTime
      ? new Date(state.lastCalculatedWakeTime)
      : null;

    if (!currentWakeTime || shouldReschedule(currentWakeTime, newWakeTime)) {
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
      logger.info('Wake time unchanged — no reschedule needed');
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    logger.error('Background traffic check failed', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export {}; // Ensure this file is treated as a module
