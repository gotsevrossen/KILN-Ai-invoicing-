import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

import { refreshTeam } from '@/features/team/use-team';
import { LiveRefresh } from '@/lib/live-refresh';
import { supabase } from '@/lib/supabase';

import { useAuth } from './auth';
import { notifyLiveRefresh } from './live-events';
import { storeActions } from './store';

/** One connection per account, shared by the office and the isolated crew screens. */
export function LiveUpdates() {
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const businessId = auth.businessId;
  const ready = auth.ready;
  const pending = auth.pending;
  const refresh = useEffectEvent(async () => {
    if (!await auth.refreshMembership()) return true;
    let applied = true;
    if (auth.role === 'owner' || auth.role === 'manager') {
      applied = await storeActions.refreshDocuments();
      refreshTeam();
    }
    notifyLiveRefresh();
    return applied;
  });

  useEffect(() => {
    const client = supabase;
    if (!client || !ready || !userId) return;
    let active = true;
    let lastRefresh = 0;
    const subscribed = new Set<string>();
    const scope = new LiveRefresh(async () => {
      if (!active || AppState.currentState === 'background' || AppState.currentState === 'inactive') return true;
      const applied = await refresh();
      if (applied) lastRefresh = Date.now();
      return applied;
    });
    const topics = [`kiln:user:${userId}`, ...businessId && !pending ? [`kiln:business:${businessId}`] : []];
    const channels = topics.map((topic) => client.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, scope.request));
    void client.realtime.setAuth().then(() => {
      if (!active) return;
      for (const channel of channels) channel.subscribe((status) => {
        // Re-read after initial connection and after reconnects to cover any missed events.
        if (status === 'SUBSCRIBED') { subscribed.add(channel.topic); scope.request(); }
        else subscribed.delete(channel.topic);
      });
    }).catch(() => {});
    // Keep a recovery path if a device/network blocks WebSockets or drops an event.
    const fallback = setInterval(() => {
      if (subscribed.size < channels.length || Date.now() - lastRefresh > 120_000) scope.request();
    }, 30_000);
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') scope.request(); });
    scope.request();
    return () => {
      active = false;
      scope.stop();
      clearInterval(fallback);
      foreground.remove();
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [ready, userId, businessId, pending]);
  return null;
}
