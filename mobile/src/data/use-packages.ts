import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from './db-packages';
import { onLiveRefresh } from './live-events';
import { currentState, useStore } from './store';
import type { ServicePackage } from './service-packages';

let examplePackages: ServicePackage[] = [];

/** No optimistic success: failed connected writes leave the editor open to retry. */
export function usePackages() {
  const { state } = useStore();
  const account = state.mode === 'connected' ? state.businessId : 'example';
  const [loaded, setLoaded] = useState<{ account: string | null; items: ServicePackage[] }>({ account: null, items: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const writing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = useCallback(() => {
    const now = currentState();
    return mounted.current && (now.mode === 'connected' ? now.businessId : 'example') === account;
  }, [account]);
  const reload = useCallback(async () => {
    if (writing.current) return;
    const token = ++request.current;
    setBusy(true); setError(false);
    try {
      const items = account === 'example' ? examplePackages : account ? await api.loadPackages(account) : [];
      if (active() && token === request.current) setLoaded({ account, items });
    } catch { if (active() && token === request.current) setError(true); }
    finally { if (active() && token === request.current) setBusy(false); }
  }, [account, active]);
  useEffect(() => onLiveRefresh(() => { if (account && account !== 'example') void reload(); }), [account, reload]);
  useEffect(() => {
    let live = true;
    const token = ++request.current;
    const load = account === 'example' ? Promise.resolve(examplePackages) : account ? api.loadPackages(account) : Promise.resolve([]);
    load.then((items) => { if (live && active() && token === request.current) { setLoaded({ account, items }); setBusy(false); setError(false); } }, () => { if (live && active()) { setError(true); setBusy(false); } });
    return () => { live = false; };
  }, [account, active]);
  const mutate = async (preset: ServicePackage, remove: boolean): Promise<boolean> => {
    if (busy || writing.current || !account || !active()) return false;
    writing.current = true;
    request.current++;
    setBusy(true); setError(false);
    try {
      if (account === 'example') {
        examplePackages = remove ? examplePackages.filter((p) => p.id !== preset.id)
          : [...examplePackages.filter((p) => p.id !== preset.id), { ...preset, lines: preset.lines.map((l) => ({ ...l })), scope: { ...preset.scope } }];
      } else if (remove) await api.deletePackage(account, preset.id);
      else await api.savePackage(account, preset);
      if (!active()) return false;
      const items = account === 'example' ? examplePackages : await api.loadPackages(account);
      if (!active()) return false;
      setLoaded({ account, items });
      return true;
    } catch { if (active()) setError(true); return false; }
    finally { writing.current = false; if (active()) setBusy(false); }
  };
  return { items: loaded.account === account ? loaded.items : [], busy, error, reload,
    save: (preset: ServicePackage) => mutate(preset, false), remove: (preset: ServicePackage) => mutate(preset, true) };
}
