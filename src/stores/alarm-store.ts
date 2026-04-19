import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
// crypto.randomUUID() is available on Hermes (RN 0.73+) but absent in Expo Go's older Hermes build.
const uuidv4 = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
import type { AlarmConfig, AlarmState, AlarmStatus } from '@/src/types/alarm';
import { AlarmStorage, HistoryStorage } from '@/src/services/storage/alarm-storage';
import { buildArrivalDate, nextOccurrenceDate } from '@/src/utils/time';
import {
  calculateWakeTime,
  shouldReschedule,
} from '@/src/utils/backoff';
import {
  DEFAULT_PREP_MINUTES,
  MAX_SNOOZE_COUNT,
  MIN_SNOOZE_INTERVAL_MS,
  FALLBACK_COMMUTE_SECONDS,
} from '@/src/constants/alarm';
import { NotificationService } from '@/src/services/notifications/notification-service';
import { logger } from '@/src/utils/logger';

interface AlarmStore extends AlarmState {
  // Actions
  initFromStorage: () => void;
  setConfig: (partial: Partial<AlarmConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: AlarmStatus) => void;
  setFiring: () => void;
  setLastCalculatedWakeTime: (isoString: string) => void;
  snooze: (fetchLiveDuration: () => Promise<number>) => Promise<void>;
  dismiss: () => void;
  /** Cancel the notification burst, record history, then reschedule or disable. */
  performDismiss: (lastTrafficDurationSeconds?: number) => Promise<void>;
  /** Schedule the alarm for its next weekly occurrence (or disable if one-off). */
  rescheduleForNextDay: (durationSeconds?: number) => Promise<void>;
  reset: () => void;

  // Phase 2 extension: briefingContent will be added here
}

const defaultState: AlarmState = {
  config: null,
  status: 'idle',
  lastCalculatedWakeTime: null,
  lastTrafficCheckAt: null,
  snoozeCount: 0,
  todayFiredAt: null,
};

export const useAlarmStore = create<AlarmStore>()(
  subscribeWithSelector((set, get) => ({
    ...defaultState,

    initFromStorage() {
      const freshConfig = AlarmStorage.readConfig();
      const { config: _ignoredConfig, ...rest } = AlarmStorage.readState();
      set({ config: freshConfig, ...rest });
      logger.info('Alarm store initialised from storage');
    },

    setConfig(partial: Partial<AlarmConfig>) {
      const existing = get().config;
      const now = new Date().toISOString();
      const defaults: AlarmConfig = {
        id: uuidv4(),
        enabled: false,
        arrivalTime: { hour: 9, minute: 0 },
        daysOfWeek: [1, 2, 3, 4, 5], // Mon–Fri default
        destination: { label: '', address: '', latitude: 0, longitude: 0 },
        prepMinutes: DEFAULT_PREP_MINUTES,
        failsafeWakeTime: { hour: 7, minute: 30 },
        createdAt: now,
        updatedAt: now,
      };
      const next: AlarmConfig = existing
        ? { ...existing, ...partial, updatedAt: now }
        : { ...defaults, ...partial, createdAt: now, updatedAt: now };
      AlarmStorage.writeConfig(next);
      set({ config: next });
    },

    setEnabled(enabled: boolean) {
      const { config } = get();
      if (!config) return;
      const updated = { ...config, enabled, updatedAt: new Date().toISOString() };
      AlarmStorage.writeConfig(updated);
      set({ config: updated, status: enabled ? 'scheduled' : 'idle' });
      logger.alarm(`Status → ${enabled ? 'scheduled' : 'idle'} (setEnabled: ${enabled})`);
    },

    setStatus(status: AlarmStatus) {
      AlarmStorage.writeState({ status });
      set({ status });
    },

    setLastCalculatedWakeTime(isoString: string) {
      AlarmStorage.writeState({
        lastCalculatedWakeTime: isoString,
        lastTrafficCheckAt: new Date().toISOString(),
      });
      set({
        lastCalculatedWakeTime: isoString,
        lastTrafficCheckAt: new Date().toISOString(),
      });
    },

    setFiring() {
      AlarmStorage.writeState({ status: 'firing' });
      set({ status: 'firing' });
      logger.alarm('Status → firing (alarm countdown expired)');
    },

    async performDismiss(lastTrafficDurationSeconds?: number) {
      const { config, snoozeCount, lastCalculatedWakeTime } = get();
      if (!config) return;

      const outcome = snoozeCount > 0 ? 'snoozed' : 'dismissed';
      logger.alarm(`performDismiss — outcome: "${outcome}", snoozeCount: ${snoozeCount}, lastTraffic: ${lastTrafficDurationSeconds != null ? `${Math.round(lastTrafficDurationSeconds / 60)} min` : 'none'}`);

      await NotificationService.cancelAlarm(config.id);

      const firedAt = new Date().toISOString();
      if (lastCalculatedWakeTime) {
        HistoryStorage.append({
          id: uuidv4(),
          date: firedAt.slice(0, 10),
          configuredArrivalTime: buildArrivalDate(config.arrivalTime).toISOString(),
          actualWakeTime: lastCalculatedWakeTime,
          trafficDurationSeconds: lastTrafficDurationSeconds ?? 0,
          prepMinutes: config.prepMinutes,
          outcome,
          snoozeCount,
        });
        logger.alarm(`History entry recorded: outcome="${outcome}", wakeTime=${lastCalculatedWakeTime}`);
      }

      AlarmStorage.writeState({ snoozeCount: 0, todayFiredAt: firedAt });
      set({ snoozeCount: 0, todayFiredAt: firedAt });

      await get().rescheduleForNextDay(lastTrafficDurationSeconds);
    },

    async rescheduleForNextDay(durationSeconds?: number) {
      const { config } = get();
      if (!config) return;

      if (config.daysOfWeek.length === 0) {
        // One-off alarm — disable entirely after it fires
        const updated = { ...config, enabled: false, updatedAt: new Date().toISOString() };
        AlarmStorage.writeConfig(updated);
        AlarmStorage.writeState({ status: 'idle', lastCalculatedWakeTime: null });
        set({ config: updated, status: 'idle', lastCalculatedWakeTime: null });
        logger.info('One-off alarm dismissed and disabled');
        return;
      }

      const nextArrival = nextOccurrenceDate(config.daysOfWeek, config.arrivalTime);
      if (!nextArrival) return;

      const duration = durationSeconds ?? FALLBACK_COMMUTE_SECONDS;
      const rawWake = calculateWakeTime(nextArrival, duration, config.prepMinutes);
      const nextWake = new Date(Math.max(rawWake.getTime(), Date.now() + 10_000));
      const wasClamped = nextWake.getTime() !== rawWake.getTime();

      logger.alarm(`rescheduleForNextDay — nextArrival: ${nextArrival.toISOString()}, duration: ${Math.round(duration / 60)} min, prep: ${config.prepMinutes} min, rawWake: ${rawWake.toISOString()}, nextWake: ${nextWake.toISOString()}${wasClamped ? ' (CLAMPED)' : ''}`);

      await NotificationService.scheduleAlarm(config.id, nextWake, {
        type: 'alarm_fire',
        alarmId: config.id,
        wakeTime: nextWake.toISOString(),
      });

      const now = new Date().toISOString();
      AlarmStorage.writeState({
        status: 'scheduled',
        lastCalculatedWakeTime: nextWake.toISOString(),
        lastTrafficCheckAt: now,
        snoozeCount: 0,
      });
      set({
        status: 'scheduled',
        lastCalculatedWakeTime: nextWake.toISOString(),
        lastTrafficCheckAt: now,
      });
      logger.alarm(`Status → scheduled. Next alarm: ${nextWake.toISOString()}`);
    },

    async snooze(fetchLiveDuration: () => Promise<number>) {
      const { config, snoozeCount } = get();
      if (!config) return;

      if (snoozeCount >= MAX_SNOOZE_COUNT) {
        get().dismiss();
        return;
      }

      const newCount = snoozeCount + 1;
      set({ status: 'snoozed', snoozeCount: newCount });
      AlarmStorage.writeState({ status: 'snoozed', snoozeCount: newCount });
      logger.alarm(`Status → snoozed (snoozeCount: ${newCount}/${MAX_SNOOZE_COUNT})`);

      try {
        const durationSeconds = await fetchLiveDuration();
        const arrivalTime = buildArrivalDate(config.arrivalTime);
        const newWakeTime = calculateWakeTime(arrivalTime, durationSeconds, config.prepMinutes);
        const now = new Date();
        const minSnoozeTarget = new Date(now.getTime() + MIN_SNOOZE_INTERVAL_MS);
        const clampedWakeTime = new Date(
          Math.max(newWakeTime.getTime(), minSnoozeTarget.getTime())
        );
        const wasClamped = clampedWakeTime.getTime() !== newWakeTime.getTime();

        logger.alarm(`Snooze #${newCount}: traffic=${Math.round(durationSeconds / 60)}min, rawWake=${newWakeTime.toISOString()}, finalWake=${clampedWakeTime.toISOString()}${wasClamped ? ` (CLAMPED — raw was < ${MIN_SNOOZE_INTERVAL_MS / 60000} min away)` : ''}`);

        set({ lastCalculatedWakeTime: clampedWakeTime.toISOString() });
        AlarmStorage.writeState({ lastCalculatedWakeTime: clampedWakeTime.toISOString() });
        return clampedWakeTime as unknown as void;
      } catch (err) {
        logger.error('Snooze traffic fetch failed — using fixed 5-min interval', err);
        const fallback = new Date(Date.now() + MIN_SNOOZE_INTERVAL_MS);
        logger.alarm(`Snooze fallback wake time: ${fallback.toISOString()}`);
        set({ lastCalculatedWakeTime: fallback.toISOString() });
        AlarmStorage.writeState({ lastCalculatedWakeTime: fallback.toISOString() });
        return fallback as unknown as void;
      }
    },

    dismiss() {
      const { config, snoozeCount, lastCalculatedWakeTime } = get();
      const firedAt = new Date().toISOString();

      if (config && lastCalculatedWakeTime) {
        HistoryStorage.append({
          id: uuidv4(),
          date: firedAt.slice(0, 10),
          configuredArrivalTime: (() => {
            const d = buildArrivalDate(config.arrivalTime);
            return d.toISOString();
          })(),
          actualWakeTime: lastCalculatedWakeTime,
          trafficDurationSeconds: 0, // updated by background task in practice
          prepMinutes: config.prepMinutes,
          outcome: snoozeCount > 0 ? 'snoozed' : 'dismissed',
          snoozeCount,
        });
      }

      const next: Partial<AlarmState> = {
        status: 'dismissed',
        snoozeCount: 0,
        todayFiredAt: firedAt,
      };
      AlarmStorage.writeState(next);
      set(next);
    },

    reset() {
      AlarmStorage.writeState(defaultState);
      set(defaultState);
    },
  }))
);
