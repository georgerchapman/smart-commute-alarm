// NOTE: Stub replacing react-native-purchases for Expo Go compatibility.
// Always returns free tier. Swap back to the real RevenueCat implementation for the dev build.
import type { SubscriptionStatus } from '@/src/types/subscription';

const FREE_STATUS: SubscriptionStatus = {
  tier: 'free',
  isActive: false,
  entitlements: [],
  expiresAt: null,
  lastCheckedAt: new Date().toISOString(),
};

export const PurchasesService = {
  init(): void {
    // no-op in Expo Go stub
  },

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return FREE_STATUS;
  },

  async restorePurchases(): Promise<SubscriptionStatus> {
    return FREE_STATUS;
  },
};
