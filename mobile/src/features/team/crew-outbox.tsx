import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { Button, Notice } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { notifyLiveRefresh, onLiveRefresh } from '@/data/live-events';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import type { NewPhoto } from '@/lib/job-photos';
import { OfflineJournal } from '@/lib/offline-journal';
import { photoBytes, removeFromPhone } from '@/lib/photo-file';
import { supabase } from '@/lib/supabase';
import { userError } from '@/lib/user-errors';

type Command = { id: string; job: string } & (
  { kind: 'note'; text: string } | { kind: 'hours'; hours: number; note: string }
  | { kind: 'work'; item: string; quantity: number } | { kind: 'change'; text: string }
  | { kind: 'photo'; photo: Pick<NewPhoto, 'id' | 'localUri' | 'takenAt'>; tag: 'before' | 'during' | 'after' }
);

type Outbox = { save: (commands: Command[]) => Promise<void>; pending: number; error: unknown; retry: () => void };
const Context = createContext<Outbox | null>(null);

export function CrewOutboxProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const user = auth.session?.user.id ?? '';
  const business = auth.businessId ?? '';
  return <ScopedOutbox key={`${user}:${business}`} user={user} business={business}>{children}</ScopedOutbox>;
}

function ScopedOutbox({ user, business, children }: { user: string; business: string; children: ReactNode }) {
  const [journal] = useState(() => new OfflineJournal<null, Command>({
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  }, 'kiln.crew-outbox:'));
  const active = useRef(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const opened = useRef(false);
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!active.current || !opened.current || !journal.pending || flushing.current) return;
    flushing.current = true;
    const uploaded = new Map<string, string>();
    try {
      await journal.flush(async (entry) => {
        const session = await supabase?.auth.getSession();
        if (!active.current || session?.data.session?.user.id !== user) throw new Error('signed_out');
        switch (entry.kind) {
          case 'note': return api.addTeamNote(entry.id, entry.job, entry.text);
          case 'hours': return api.logTeamHours(entry.id, entry.job, entry.hours, entry.note);
          case 'work': return api.crewAddWork(entry.id, entry.job, entry.item, entry.quantity);
          case 'change': return api.crewSuggestChange(entry.id, entry.job, entry.text);
          case 'photo':
            await api.saveTeamPhoto(business, entry.job, entry.photo, entry.tag);
            uploaded.set(entry.id, entry.photo.localUri);
        }
      });
      if (active.current) { setError(null); notifyLiveRefresh(); }
    } catch (failure) {
      if (active.current) setError(failure);
    } finally {
      flushing.current = false;
      if (active.current) {
        const remaining = new Set(journal.commands().map((entry) => entry.id));
        for (const [id, uri] of uploaded) if (!remaining.has(id)) removeFromPhone(uri);
        setPending(journal.pending);
      }
    }
  }, [journal, business, user]);

  useEffect(() => {
    if (!user || !business) return;
    active.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        journal.open(`${user}:${business}`);
        opened.current = true;
        setPending(journal.pending);
        void flush();
      } catch (failure) { setError(failure); }
    });
    const unsubscribe = onLiveRefresh(() => void flush());
    const timer = setInterval(() => { if (AppState.currentState === 'active' || Platform.OS === 'web') void flush(); }, 30_000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void flush(); });
    return () => {
      cancelled = true;
      active.current = false;
      opened.current = false;
      journal.close();
      unsubscribe();
      clearInterval(timer);
      appState.remove();
    };
  }, [journal, business, user, flush]);

  const save = async (commands: Command[]) => {
    if (!active.current || !opened.current) throw new Error('offline_storage_unavailable');
    const durable = await Promise.all(commands.map(async (command) => {
      if (command.kind !== 'photo' || !command.photo.localUri.startsWith('blob:')) return command;
      const bytes = new Uint8Array(await photoBytes(command.photo.localUri));
      let binary = '';
      for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      return { ...command, photo: { ...command.photo, localUri: `data:image/jpeg;base64,${btoa(binary)}` } };
    }));
    if (!active.current) throw new Error('signed_out');
    journal.append(durable.map((command) => ({ id: command.id, command })), null);
    commands.forEach((command, index) => {
      const stored = durable[index];
      if (command.kind === 'photo' && stored.kind === 'photo' && command.photo.localUri !== stored.photo.localUri) removeFromPhone(command.photo.localUri);
    });
    setPending(journal.pending);
    void flush();
  };
  return <Context.Provider value={{ save, pending, error, retry: () => void flush() }}>{children}</Context.Provider>;
}

/** The crew save queue, or null outside the crew screens (the shared KILN chat uses this). */
export function useCrewOutboxIfCrew() {
  return useContext(Context);
}

export type CrewCommand = Command;

export function useCrewOutbox() {
  const outbox = useContext(Context);
  if (!outbox) throw new Error('Crew outbox provider is missing');
  return outbox;
}

export function CrewSyncStatus() {
  const { pending, error, retry } = useCrewOutbox();
  const { t } = useLang();
  if (!pending && !error) return null;
  return <>
    {pending ? <Notice text={t('offlineSave.waiting', { count: pending })} icon="cloud-off" tone="soft" /> : null}
    {error ? <Notice text={userError(t, error)} tone="danger" /> : null}
    {pending ? <Button label={t('offlineSave.retry')} variant="outline" onPress={retry} /> : null}
  </>;
}
