import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSubscriptionStore } from '@/src/stores/subscription-store';
import { PurchasesService } from '@/src/services/purchases/purchases-service';
import { ENTITLEMENT_PRO } from '@/src/constants/revenuecat';

export function useSubscription() {
  const router = useRouter();
  const { status, setStatus } = useSubscriptionStore();

  const refresh = useCallback(async () => {
    const updated = await PurchasesService.getSubscriptionStatus();
    setStatus(updated);
    return updated;
  }, [setStatus]);

  const restore = useCallback(async () => {
    const updated = await PurchasesService.restorePurchases();
    setStatus(updated);
    return updated;
  }, [setStatus]);

  /**
   * Gate a feature behind Pro.
   * If user has Pro, calls onProceed immediately.
   * Otherwise navigates to the paywall.
   */
  const requirePro = useCallback(
    (onProceed: () => void) => {
      if (status.entitlements.includes(ENTITLEMENT_PRO)) {
        onProceed();
      } else {
        router.push('/paywall');
      }
    },
    [status, router]
  );

  const isPro = status.entitlements.includes(ENTITLEMENT_PRO);

  return { status, isPro, refresh, restore, requirePro };
}
