import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Platform, Linking } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

export interface PermissionStatuses {
  notifications: PermissionResult;
  criticalAlerts: PermissionResult; // iOS only
  locationForeground: PermissionResult;
  locationBackground: PermissionResult;
  exactAlarms: PermissionResult; // Android only
}

function toResult(granted: boolean): PermissionResult {
  return granted ? 'granted' : 'denied';
}

export async function checkAllPermissions(): Promise<PermissionStatuses> {
  const notifPerm = await Notifications.getPermissionsAsync();

  // Location calls throw in Expo Go when NSLocation*UsageDescription keys are absent
  // (Expo Go uses its own Info.plist, not the one built by EAS). Treat as unavailable.
  let locationFgPerm: Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>> | null = null;
  let locationBgPerm: Awaited<ReturnType<typeof Location.getBackgroundPermissionsAsync>> | null = null;
  try {
    [locationFgPerm, locationBgPerm] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
  } catch {
    // Expected in Expo Go — location usage descriptions are only present in native builds
  }

  let exactAlarms: PermissionResult = 'unavailable';
  if (Platform.OS === 'android') {
    const canSchedule = await (Notifications as any).canScheduleExactNotificationsAsync?.();
    exactAlarms = toResult(canSchedule ?? false);
  }

  return {
    notifications: toResult(notifPerm.granted),
    criticalAlerts: Platform.OS === 'ios'
      ? toResult((notifPerm.ios as any)?.criticalAlert === 'granted')
      : 'unavailable',
    locationForeground: locationFgPerm ? toResult(locationFgPerm.granted) : 'unavailable',
    locationBackground: locationBgPerm ? toResult(locationBgPerm.granted) : 'unavailable',
    exactAlarms,
  };
}

export async function requestNotificationPermission(): Promise<PermissionResult> {
  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toResult(granted);
}

export async function requestCriticalAlertPermission(): Promise<PermissionResult> {
  if (Platform.OS !== 'ios') return 'unavailable';
  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowCriticalAlerts: true },
  });
  return toResult(granted);
}

export async function requestLocationForeground(): Promise<PermissionResult> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return toResult(granted);
  } catch {
    return 'unavailable';
  }
}

export async function requestLocationBackground(): Promise<PermissionResult> {
  try {
    const { granted } = await Location.requestBackgroundPermissionsAsync();
    return toResult(granted);
  } catch {
    return 'unavailable';
  }
}

/** Deep-link to exact alarm settings on Android 12+ */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Linking.openSettings();
}
