import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { onLiveRefresh } from './live-events';
import { loadInvoiceAcceptance } from './pay-page';

type Acceptance = Awaited<ReturnType<typeof loadInvoiceAcceptance>>;

export function useInvoiceAcceptance(invoiceId: string, businessId: string | null, enabled: boolean) {
  const key = `${businessId}:${invoiceId}`;
  const [latest, setLatest] = useState<{ key: string; value: Acceptance } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void loadInvoiceAcceptance(invoiceId).then((value) => {
        if (active && request === revision) setLatest({ key, value });
      }).catch(() => {});
    };
    refresh();
    const unsubscribe = onLiveRefresh(refresh);
    return () => { active = false; unsubscribe(); };
  }, [enabled, invoiceId, key]));
  return enabled && latest?.key === key ? latest.value : null;
}
