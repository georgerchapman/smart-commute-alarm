import { create } from 'zustand';
import type { SubscriptionStatus } from '@/src/types/subscription';

interface SubscriptionStore {
  status: SubscriptionStatus;
  setStatus: (status: SubscriptionStatus) => void;
}

const defaultStatus: SubscriptionStatus = {
  tier: 'free',
  isActive: false,
  entitlements: [],
  expiresAt: null,
  lastCheckedAt: null,
};

export const useSubscriptionStore = create<SubscriptionStore>()((set) => ({
  status: defaultStatus,
  setStatus: (status: SubscriptionStatus) => set({ status }),
}));
