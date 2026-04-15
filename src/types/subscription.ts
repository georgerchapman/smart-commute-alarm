export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  entitlements: string[]; // RevenueCat entitlement IDs
  expiresAt: string | null; // ISO 8601
  lastCheckedAt: string | null; // ISO 8601
}
