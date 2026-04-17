// NOTE: In-memory shim replacing react-native-mmkv for Expo Go compatibility.
// Data does not persist across restarts. Swap back to MMKV for the dev build.
import type { AlarmConfig, AlarmState, AlarmHistoryEntry } from '@/src/types/alarm';

function createMemoryStore() {
  const _store = new Map<string, string | boolean>();
  return {
    getString(key: string): string | undefined {
      const v = _store.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean(key: string): boolean | undefined {
      const v = _store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    set(key: string, value: string | boolean): void {
      _store.set(key, value);
    },
    remove(key: string): void {
      _store.delete(key);
    },
    contains(key: string): boolean {
      return _store.has(key);
    },
  };
}

const storage = createMemoryStore();

const KEYS = {
  CONFIG: 'alarm_config',
  STATE: 'alarm_state',
  SCHEDULED_NOTIFICATION_PREFIX: 'scheduled_notif_',
  HAS_SEEN_ONBOARDING: 'has_seen_onboarding',
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

  // ─── Onboarding ───────────────────────────────────────────────────────────

  hasSeenOnboarding(): boolean {
    return storage.getBoolean(KEYS.HAS_SEEN_ONBOARDING) ?? false;
  },

  markOnboardingComplete(): void {
    storage.set(KEYS.HAS_SEEN_ONBOARDING, true);
  },
};

// Separate in-memory store for history (mirrors the MMKV instance)
const historyStorage = createMemoryStore();

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
