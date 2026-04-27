export type AlarmStatus =
  | 'idle'
  | 'scheduled'
  | 'monitoring'
  | 'firing'
  | 'snoozed'
  | 'dismissed';

export interface Destination {
  label: string;
  address: string;
  placeId?: string; // Phase 2: Google Places autocomplete
  latitude: number;
  longitude: number;
}

export interface AlarmConfig {
  id: string;
  enabled: boolean;
  arrivalTime: {
    hour: number; // 0–23
    minute: number; // 0–59
  };
  daysOfWeek: number[]; // 0=Sun…6=Sat; [] = one-off (next occurrence only)
  destination: Destination;
  prepMinutes: number; // user-configured preparation buffer, default 30
  calendarEventId?: string; // Phase 2: calendar sync
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface AlarmState {
  config: AlarmConfig | null;
  status: AlarmStatus;
  lastCalculatedWakeTime: string | null; // ISO 8601
  lastTrafficCheckAt: string | null; // ISO 8601
  snoozeCount: number;
  todayFiredAt: string | null; // ISO 8601 — prevents double-firing same day
}

export interface AlarmHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  configuredArrivalTime: string; // ISO 8601
  actualWakeTime: string; // ISO 8601 — what the algorithm landed on
  trafficDurationSeconds: number;
  prepMinutes: number;
  outcome: 'dismissed' | 'snoozed' | 'missed'; // 'missed' is V2: alarm fired but user never interacted
  snoozeCount: number;
}
