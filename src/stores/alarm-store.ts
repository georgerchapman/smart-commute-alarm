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
import { buildArrivalDate } from '@/src/utils/time';
import {
  calculateWakeTime,
  shouldReschedule,
} from '@/src/utils/backoff';
import {
  DEFAULT_PREP_MINUTES,
  MAX_SNOOZE_COUNT,
  MIN_SNOOZE_INTERVAL_MS,
} from '@/src/constants/alarm';
import { logger } from '@/src/utils/logger';

interface AlarmStore extends AlarmState {
  // Actions
  initFromStorage: () => void;
  setConfig: (partial: Partial<AlarmConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: AlarmStatus) => void;
  setLastCalculatedWakeTime: (isoString: string) => void;
  snooze: (fetchLiveDuration: () => Promise<number>) => Promise<void>;
  dismiss: () => void;
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

      try {
        const durationSeconds = await fetchLiveDuration();
        const arrivalTime = buildArrivalDate(config.arrivalTime);
        const newWakeTime = calculateWakeTime(arrivalTime, durationSeconds, config.prepMinutes);
        const now = new Date();
        const clampedWakeTime = new Date(
          Math.max(newWakeTime.getTime(), now.getTime() + MIN_SNOOZE_INTERVAL_MS)
        );

        set({ lastCalculatedWakeTime: clampedWakeTime.toISOString() });
        AlarmStorage.writeState({ lastCalculatedWakeTime: clampedWakeTime.toISOString() });
        logger.info(`Snooze #${newCount}: ringing at ${clampedWakeTime.toISOString()}`);
        return clampedWakeTime as unknown as void;
      } catch (err) {
        logger.error('Snooze traffic fetch failed, using fixed interval', err);
        const fallback = new Date(Date.now() + MIN_SNOOZE_INTERVAL_MS);
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
