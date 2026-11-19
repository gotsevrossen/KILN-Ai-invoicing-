import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, ButtonRow, Card, Hair, Notice, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as api from '@/data/job-cleanup';
import { onLiveRefresh } from '@/data/live-events';
import { storeActions, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { userError } from '@/lib/user-errors';

import { cleanupText } from './text';

// Removing due jobs runs at most this often while the app is open (it also runs on each start).
const CLEANUP_EVERY = 10 * 60 * 1000;
let lastCleanup = 0;

/**
 * Home, owner only: paid jobs leaving KILN within a day. Showing the card counts as the warning,
 * which starts the owner's last day. Each job asks "save the documents?"; nothing else is kept.
 * Opening Home also asks the server to remove jobs whose time has come.
 */
export function LeavingJobs() {
  const { lang, t } = useLang();
  const c = cleanupText(lang);
  const f = useFormat();
  const auth = useAuth();
  const { state } = useStore();
  const [jobs, setJobs] = useState<api.LeavingJob[]>([]);
  const [removed, setRemoved] = useState(0);
  const [error, setError] = useState('');
  const [cleanupError, setCleanupError] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const owner = auth.role === 'owner' && state.mode === 'connected';

  const load = useCallback(async () => {
    if (!owner) return;
    try {
      if (Date.now() - lastCleanup > CLEANUP_EVERY) {
        lastCleanup = Date.now();
        let failureMessage = '';
        const result = await api.removeDueJobs().catch((failure) => {
          failureMessage = userError(t, failure);
          return null;
        });
        if (live.current) setCleanupError(result?.failed ? t('errors.failed') : failureMessage);
        if (result?.removed) {
          if (live.current) setRemoved(result.removed);
          await storeActions.refreshDocuments();
        }
      }
      const leaving = await api.loadLeavingJobs();
      if (!live.current) return;
      setJobs(leaving);
      setError('');
      // seeing this card is the warning; the server starts the last day from now
      const unseen = leaving.filter((j) => !j.warnedAt).map((j) => j.id);
      if (unseen.length) await api.markLeavingSeen(unseen);
    } catch (e) {
      if (live.current) setError(userError(t, e));
    }
  }, [owner, t]);

  useFocusEffect(useCallback(() => {
    live.current = true;
    void load();
    const unsubscribe = onLiveRefresh(() => void load());
    return () => { live.current = false; unsubscribe(); };
  }, [load]));

  const choose = async (ids: string[], choice: 'save' | 'discard') => {
    setBusy(true);
    try {
      for (const id of ids) await api.chooseDocuments(id, choice);
      setJobs((all) => all.map((j) => (ids.includes(j.id) ? { ...j, choice } : j)));
      setError('');
    } catch (e) {
      setError(userError(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (!owner) return null;
  const open = jobs.filter((j) => j.choice === null);
  return <>
    {removed ? <Notice text={c.removed.replace('%{count}', String(removed))} tone="soft" icon="info" /> : null}
    {error || cleanupError ? <Notice text={error || cleanupError} tone="danger" icon="alert-circle" /> : null}
    {jobs.length ? <Card tone="flag" style={{ gap: 10 }}>
      <T v="h3">{c.leavingTitle}</T>
      <T v="small">{c.leavingHelp}</T>
      {jobs.map((j, i) => <View key={j.id} style={{ gap: 8 }}>
        {i ? <Hair /> : null}
        <T v="label">{j.title}</T>
        <T v="small">{j.customerName} · {c.leavesOn.replace('%{when}', f.date(j.leavesAt.slice(0, 10)))}</T>
        {j.choice ? (
          <ButtonRow>
            <Button label={j.choice === 'save' ? c.willSave : c.willNotSave} icon={j.choice === 'save' ? 'check' : 'x'} variant="soft" disabled />
            <Button label={c.undo} variant="outline" disabled={busy} onPress={() => void choose([j.id], j.choice === 'save' ? 'discard' : 'save')} />
          </ButtonRow>
        ) : (
          <ButtonRow>
            <Button label={c.saveDocs} icon="download" variant="dark" disabled={busy} onPress={() => void choose([j.id], 'save')} />
            <Button label={c.letGo} variant="outline" disabled={busy} onPress={() => void choose([j.id], 'discard')} />
          </ButtonRow>
        )}
        <Button label={c.openJob} variant="outline" onPress={() => router.push(`/job/${j.id}`)} />
      </View>)}
      {open.length > 1 ? <Button label={c.saveAll} icon="download" disabled={busy} onPress={() => void choose(open.map((j) => j.id), 'save')} /> : null}
    </Card> : null}
  </>;
}
