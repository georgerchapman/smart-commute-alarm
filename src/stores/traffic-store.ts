import { create } from 'zustand';
import type { TrafficResult } from '@/src/types/traffic';

interface TrafficStore {
  lastResult: TrafficResult | null;
  lastFetchedAt: string | null; // ISO 8601 — when the last successful fetch completed
  isFetching: boolean;
  error: string | null;
  setResult: (result: TrafficResult) => void;
  setFetching: (fetching: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTrafficStore = create<TrafficStore>()((set) => ({
  lastResult: null,
  lastFetchedAt: null,
  isFetching: false,
  error: null,

  setResult(result: TrafficResult) {
    set({ lastResult: result, lastFetchedAt: new Date().toISOString(), error: null });
  },

  setFetching(fetching: boolean) {
    set({ isFetching: fetching });
  },

  setError(error: string | null) {
    set({ error });
  },
}));
