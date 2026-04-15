import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { BACKGROUND_FETCH_INTERVAL_SECONDS } from '@/src/constants/alarm';
import { logger } from '@/src/utils/logger';

export const TRAFFIC_CHECK_TASK = 'SYNCWAKE_TRAFFIC_CHECK';

export async function registerBackgroundTasks(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TRAFFIC_CHECK_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TRAFFIC_CHECK_TASK, {
        minimumInterval: BACKGROUND_FETCH_INTERVAL_SECONDS,
        stopOnTerminate: false, // Android: keep running after app is killed
        startOnBoot: true, // Android: reschedule after device reboot
      });
      logger.info('Background traffic check task registered');
    }
  } catch (err) {
    // Expected in Expo Go — background fetch requires a native dev build.
    logger.warn('Background task registration unavailable (Expo Go?)', err);
  }
}

export async function unregisterBackgroundTasks(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TRAFFIC_CHECK_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TRAFFIC_CHECK_TASK);
      logger.info('Background traffic check task unregistered');
    }
  } catch (err) {
    logger.error('Failed to unregister background task', err);
  }
}
