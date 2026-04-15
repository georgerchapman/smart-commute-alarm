export type NotificationPayloadType = 'alarm_fire' | 'alarm_reschedule' | 'snooze_recheck';

export interface NotificationPayload {
  type: NotificationPayloadType;
  alarmId: string;
  wakeTime: string; // ISO 8601
  trafficDurationSeconds?: number;
}

export interface ScheduledNotification {
  expoNotificationId: string;
  payload: NotificationPayload;
  scheduledFor: string; // ISO 8601
}
