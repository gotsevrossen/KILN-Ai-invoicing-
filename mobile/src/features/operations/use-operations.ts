import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import * as api from './api';
import { emptyOperations, type Operations } from './model';
import { operationsText } from './text';

/** Server-confirmed writes, scoped to the account that opened the page. */
export function useOperations() {
  const { state } = useStore();
  const auth = useAuth();
  const { t, lang } = useLang();
  const copy = operationsText(lang);
  const businessId = state.businessId;
  const connected = state.mode === 'connected';
  const scope = connected ? `${businessId ?? ''}:${auth.session?.user.id ?? ''}` : 'example';
  const currentScope = useRef(scope);
  useEffect(() => { currentScope.current = scope; }, [scope]);
  const [loaded, setLoaded] = useState<{ scope: string; data: Operations } | null>(null);
  const [problem, setProblem] = useState<{ scope: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const writeInFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    writeInFlight.current = false;
    if (connected && (!businessId || !auth.session)) return;
    const load = connected ? api.loadOperations(businessId!) : Promise.resolve(api.exampleOperations());
    load.then((data) => {
      if (!cancelled) { setLoaded({ scope, data }); setProblem(null); setBusy(false); }
    }, (error: unknown) => {
      if (!cancelled) setProblem({ scope, text: userError(t, error) });
    });
    return () => { cancelled = true; };
  }, [scope, connected, businessId, auth.session, attempt, t]);
  const data = loaded?.scope === scope ? loaded.data : null;
  const run = useCallback(async (write: (businessId: string) => Promise<void>, preview: (data: Operations) => Operations): Promise<boolean> => {
    if (!data || busy || writeInFlight.current || currentScope.current !== scope) return false;
    writeInFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      if (connected) {
        if (!businessId) throw new Error('No server is set up');
        await write(businessId);
        if (currentScope.current !== scope) return false;
        const fresh = await api.loadOperations(businessId);
        if (currentScope.current !== scope) return false;
        setLoaded({ scope, data: fresh });
      } else {
        const next = preview(data);
        api.setExampleOperations(next);
        setLoaded({ scope, data: next });
      }
      return true;
    } catch (error) {
      if (currentScope.current === scope) setProblem({ scope, text: (error as { code?: string })?.code === '23P01' ? copy.overlap : userError(t, error) });
      return false;
    } finally {
      if (currentScope.current === scope) { writeInFlight.current = false; setBusy(false); }
    }
  }, [data, busy, connected, businessId, scope, copy.overlap, t]);
  return { data: data ?? emptyOperations(), ready: !!data, error: problem?.scope === scope ? problem.text : null, busy, run, retry: () => setAttempt((a) => a + 1), connected, businessId: businessId ?? 'example', copy };
}
