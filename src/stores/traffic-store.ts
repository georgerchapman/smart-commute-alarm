import { create } from 'zustand';
import type { TrafficResult } from '@/src/types/traffic';

interface TrafficStore {
  lastResult: TrafficResult | null;
  isFetching: boolean;
  error: string | null;
  setResult: (result: TrafficResult) => void;
  setFetching: (fetching: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTrafficStore = create<TrafficStore>()((set) => ({
  lastResult: null,
  isFetching: false,
  error: null,

  setResult(result: TrafficResult) {
    set({ lastResult: result, error: null });
  },

  setFetching(fetching: boolean) {
    set({ isFetching: fetching });
  },

  setError(error: string | null) {
    set({ error });
  },
}));
