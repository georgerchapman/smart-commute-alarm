import { useState, useCallback } from 'react';
import {
  checkAllPermissions,
  requestNotificationPermission,
  requestLocationForeground,
  openExactAlarmSettings,
  type PermissionStatuses,
} from '@/src/services/permissions/permission-service';

export function usePermissions() {
  const [statuses, setStatuses] = useState<PermissionStatuses | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const check = useCallback(async () => {
    setIsChecking(true);
    const result = await checkAllPermissions();
    setStatuses(result);
    setIsChecking(false);
    return result;
  }, []);

  const requestAll = useCallback(async () => {
    // Step 1: Notifications
    await requestNotificationPermission();
    // Step 2: Location foreground (app stays open overnight — no background location needed)
    await requestLocationForeground();
    // Step 3: Exact alarms (Android — deep-link)
    const updated = await checkAllPermissions();
    if (updated.exactAlarms === 'denied') {
      await openExactAlarmSettings();
    }
    setStatuses(updated);
    return updated;
  }, []);

  return { statuses, isChecking, check, requestAll };
}
