// IMPORTANT: traffic-check-task must be imported at module scope so
// TaskManager.defineTask is called when the JS bundle loads.
import '@/src/services/background/traffic-check-task';

import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlarmStore } from '@/src/stores/alarm-store';
import { useSubscriptionStore } from '@/src/stores/subscription-store';
import { registerBackgroundTasks } from '@/src/services/background/task-definitions';
import { registerNotificationCategories } from '@/src/services/notifications/notification-service';
import { PurchasesService } from '@/src/services/purchases/purchases-service';
import { AlarmStorage } from '@/src/services/storage/alarm-storage';
import type { NotificationPayload } from '@/src/types/notification';
import { logger } from '@/src/utils/logger';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const initAlarm = useAlarmStore((s) => s.initFromStorage);
  const performDismiss = useAlarmStore((s) => s.performDismiss);
  const setAlarmFiring = useAlarmStore((s) => s.setFiring);
  const setSubscriptionStatus = useSubscriptionStore((s) => s.setStatus);

  // Bootstrap all services on mount
  useEffect(() => {
    async function bootstrap() {
      logger.info('[DEBUG] bootstrap() start');

      // Load persisted alarm state
      initAlarm();
      logger.info('[DEBUG] initAlarm() complete');

      // Register notification action categories (iOS)
      await registerNotificationCategories();
      logger.info('[DEBUG] registerNotificationCategories() complete');

      // Register background fetch task
      await registerBackgroundTasks();
      logger.info('[DEBUG] registerBackgroundTasks() complete');

      // Initialise RevenueCat and hydrate subscription store
      PurchasesService.init();
      const status = await PurchasesService.getSubscriptionStatus();
      setSubscriptionStatus(status);
      logger.info('[DEBUG] PurchasesService initialised, subscription status hydrated');

      // Show onboarding on first launch
      const needsOnboarding = !AlarmStorage.hasSeenOnboarding();
      logger.info(`[DEBUG] Onboarding redirect: ${needsOnboarding ? 'yes' : 'no'}`);
      if (needsOnboarding) {
        router.replace('/onboarding');
      }

      logger.info('[DEBUG] bootstrap() complete');
    }

    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for notification responses (Snooze / Dismiss action buttons)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const { actionIdentifier, notification } = response;
      const payload = notification.request.content.data as unknown as NotificationPayload;

      logger.ui(`[DEBUG] Notification response: action="${actionIdentifier}", payload.type="${payload?.type}"`);

      if (actionIdentifier === 'DISMISS') {
        // Cancel remaining burst, record history, reschedule for next occurrence
        logger.ui('[DEBUG] DISMISS action — calling performDismiss()');
        performDismiss().catch(() => {});
      } else if (actionIdentifier === 'SNOOZE') {
        // Show the in-app firing overlay so the user can snooze properly
        logger.ui('[DEBUG] SNOOZE action — opening firing overlay');
        setAlarmFiring();
        router.push('/');
      } else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // User tapped the notification body — show firing overlay
        if (payload?.type === 'alarm_fire' || payload?.type === 'snooze_recheck') {
          logger.ui(`[DEBUG] DEFAULT tap on "${payload.type}" — opening firing overlay`);
          setAlarmFiring();
          router.push('/');
        }
      }
    });

    return () => sub.remove();
  }, [performDismiss, setAlarmFiring, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'Go Pro' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
