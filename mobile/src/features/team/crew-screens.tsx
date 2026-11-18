import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Hair, IconButton, ListRow, Notice, PageHeader, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as api from '@/data/team-access';
import { onLiveRefresh } from '@/data/live-events';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { useThemeMode } from '@/theme/theme-mode';

import { fill, teamText } from './text';
import { CrewCaptureScreen } from './crew-capture';

/** The crew member's assigned jobs, reloaded each time the page comes back into view. */
function useCrewJobs() {
  const { t } = useLang();
  const [jobs, setJobs] = useState<api.CrewJob[] | null>(null);
  const [error, setError] = useState('');
  const live = useRef(true);
  const request = useRef(0);
  const load = useCallback(() => {
    const token = ++request.current;
    api.loadCrewJobs().then((j) => { if (live.current && token === request.current) { setJobs(j); setError(''); } },
      (e: unknown) => { if (live.current && token === request.current) { setJobs(null); setError(userError(t, e)); } });
  }, [t]);
  useFocusEffect(useCallback(() => {
    live.current = true;
    load();
    const unsubscribe = onLiveRefresh(load);
    return () => { live.current = false; request.current++; unsubscribe(); };
  }, [load]));
  return { jobs, error, retry: load };
}

function JobList({ jobs, onPick }: { jobs: api.CrewJob[]; onPick: (job: api.CrewJob) => void }) {
  const open = jobs.filter((j) => j.is_open);
  const closed = jobs.filter((j) => !j.is_open);
  return <>
    {open.length ? <Card style={{ paddingVertical: 4 }}>
      {open.map((j, i) => <View key={j.id}>
        {i ? <Hair /> : null}
        <ListRow icon="briefcase" iconTone="accent" title={j.title} sub={`${j.address} · ${j.customer_name}`} onPress={() => onPick(j)} />
      </View>)}
    </Card> : null}
    {closed.length ? <Card style={{ paddingVertical: 4 }}>
      {closed.map((j, i) => <View key={j.id}>
        {i ? <Hair /> : null}
        <ListRow icon="lock" title={j.title} sub={j.address} onPress={() => onPick(j)} />
      </View>)}
    </Card> : null}
  </>;
}

function Jobs({ title, sub, home }: { title: string; sub?: string; home?: boolean }) {
  const { lang } = useLang();
  const c = teamText(lang);
  const { jobs, error, retry } = useCrewJobs();
  return (
    <Screen tabs header={<PageHeader title={title} sub={sub}
      right={home ? <IconButton icon="settings" label={c.settings} onPress={() => router.push('/crew/settings')} /> : undefined} />}>
      {error ? <><Notice text={error} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={retry} /></> : null}
      {!jobs && !error ? <T muted>{c.loading}</T> : null}
      {jobs && !jobs.length ? <Notice text={c.noJobs} tone="soft" icon="info" /> : null}
      {jobs?.length ? <>{home ? <T v="eyebrow">{c.yourJobs}</T> : null}<JobList jobs={jobs} onPick={(j) => router.push(`/crew/job/${j.id}`)} /></> : null}
    </Screen>
  );
}

export function CrewHome() {
  const { lang } = useLang();
  const auth = useAuth();
  const c = teamText(lang);
  const me = auth.memberName || (auth.session?.user.email?.split('@')[0] ?? '');
  return <Jobs home title={fill(c.hello, { name: me })} sub={auth.businessName} />;
}

export function CrewJobs() {
  const { lang } = useLang();
  return <Jobs title={teamText(lang).jobs} />;
}

/** Capture shares the office layout, while its picker only lists assigned jobs. */
export function CrewCapture() {
  return <CrewCaptureScreen {...useCrewJobs()} />;
}

export function CrewSettings() {
  const { lang, setLang, t } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const theme = useThemeMode();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Screen header={<PageHeader title={c.settings} sub={auth.businessName} back={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{c.language}</T>
        <Segmented label={c.language} value={lang} onChange={setLang} options={[{ key: 'en', label: 'English' }, { key: 'es', label: 'Español' }]} />
        <T v="eyebrow">{c.theme}</T>
        <Segmented label={c.theme} value={theme.mode} onChange={theme.setMode}
          options={[{ key: 'light', label: t('settings.themeLight') }, { key: 'dark', label: t('settings.themeDark') }, { key: 'system', label: t('settings.themeSystem') }]} />
      </Card>
      <Card style={{ gap: 10 }}>
        <T v="label">{auth.session?.user.email ?? ''}</T>
        <T v="small" muted>{c.crew}</T>
        {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
        <Button label={c.signOut} icon="log-out" variant="outline" disabled={busy} onPress={() => void auth.signOut().then(() => router.replace('/sign-in'), (e: unknown) => setError(userError(t, e)))} />
        {confirm ? <>
          <Notice text={c.leaveHelp} tone="flag" icon="alert-triangle" />
          <Button label={c.leaveConfirm} variant="danger" disabled={busy} onPress={() => {
            setBusy(true); setError('');
            api.leaveTeam().then(() => { auth.retryLoad(); router.replace('/'); }, (e: unknown) => setError(userError(t, e))).finally(() => setBusy(false));
          }} />
          <Button label={c.cancel} variant="outline" onPress={() => setConfirm(false)} />
        </> : <Button label={c.leaveTeam} variant="ghost" onPress={() => setConfirm(true)} />}
      </Card>
    </Screen>
  );
}
