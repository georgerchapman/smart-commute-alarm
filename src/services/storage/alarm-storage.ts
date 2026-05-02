import { createMMKV } from 'react-native-mmkv';
import type { AlarmConfig, AlarmState, AlarmHistoryEntry } from '@/src/types/alarm';

const storage = createMMKV({ id: 'alarm-storage' });

const KEYS = {
  CONFIG: 'alarm_config',
  STATE: 'alarm_state',
  SCHEDULED_NOTIFICATION_PREFIX: 'scheduled_notif_',
  HAS_SEEN_ONBOARDING: 'has_seen_onboarding',
  LAST_KNOWN_LOCATION: 'last_known_location',
} as const;

export const AlarmStorage = {
  // ─── Config ───────────────────────────────────────────────────────────────

  readConfig(): AlarmConfig | null {
    const raw = storage.getString(KEYS.CONFIG);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AlarmConfig;
    } catch {
      return null;
    }
  },

  writeConfig(config: AlarmConfig): void {
    storage.set(KEYS.CONFIG, JSON.stringify(config));
  },

  clearConfig(): void {
    storage.remove(KEYS.CONFIG);
  },

  // ─── Runtime State ────────────────────────────────────────────────────────

  readState(): AlarmState {
    const raw = storage.getString(KEYS.STATE);
    if (!raw) {
      return {
        config: null,
        status: 'idle',
        lastCalculatedWakeTime: null,
        lastTrafficCheckAt: null,
        snoozeCount: 0,
        todayFiredAt: null,
      };
    }
    try {
      return JSON.parse(raw) as AlarmState;
    } catch {
      return {
        config: null,
        status: 'idle',
        lastCalculatedWakeTime: null,
        lastTrafficCheckAt: null,
        snoozeCount: 0,
        todayFiredAt: null,
      };
    }
  },

  writeState(state: Partial<AlarmState>): void {
    const current = this.readState();
    storage.set(KEYS.STATE, JSON.stringify({ ...current, ...state }));
  },

  // ─── Scheduled Notification IDs ──────────────────────────────────────────
  // Stored as a JSON array to support the multi-notification burst pattern.

  readScheduledNotificationIds(alarmId: string): string[] {
    const raw = storage.getString(`${KEYS.SCHEDULED_NOTIFICATION_PREFIX}${alarmId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as string[];
      // Migrate legacy single-string value
      if (typeof parsed === 'string') return [parsed];
      return [];
    } catch {
      return [];
    }
  },

  writeScheduledNotificationIds(alarmId: string, notificationIds: string[]): void {
    storage.set(`${KEYS.SCHEDULED_NOTIFICATION_PREFIX}${alarmId}`, JSON.stringify(notificationIds));
  },

  clearScheduledNotificationIds(alarmId: string): void {
    storage.remove(`${KEYS.SCHEDULED_NOTIFICATION_PREFIX}${alarmId}`);
  },

  // ─── Last Known Location ──────────────────────────────────────────────────
  // Used by the background traffic task (which cannot access live location
  // after switching from "Always" to "When In Use" location permissions).

  readLastKnownLocation(): { latitude: number; longitude: number; fetchedAt: string } | null {
    const raw = storage.getString(KEYS.LAST_KNOWN_LOCATION);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  writeLastKnownLocation(latitude: number, longitude: number): void {
    storage.set(
      KEYS.LAST_KNOWN_LOCATION,
      JSON.stringify({ latitude, longitude, fetchedAt: new Date().toISOString() })
    );
  },

  // ─── Onboarding ───────────────────────────────────────────────────────────

  hasSeenOnboarding(): boolean {
    return storage.getBoolean(KEYS.HAS_SEEN_ONBOARDING) ?? false;
  },

  markOnboardingComplete(): void {
    storage.set(KEYS.HAS_SEEN_ONBOARDING, true);
  },
};

// ─── History ─────────────────────────────────────────────────────────────────

const historyStorage = createMMKV({ id: 'alarm-history' });

const HISTORY_KEY = 'alarm_history';
const MAX_HISTORY_ENTRIES = 90; // ~3 months

export const HistoryStorage = {
  readAll(): AlarmHistoryEntry[] {
    const raw = historyStorage.getString(HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as AlarmHistoryEntry[];
    } catch {
      return [];
    }
  },

  append(entry: AlarmHistoryEntry): void {
    const entries = this.readAll();
    const updated = [entry, ...entries].slice(0, MAX_HISTORY_ENTRIES);
    historyStorage.set(HISTORY_KEY, JSON.stringify(updated));
  },

  clear(): void {
    historyStorage.remove(HISTORY_KEY);
  },
};
