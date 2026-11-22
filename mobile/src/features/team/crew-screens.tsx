import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppLockSetting } from '@/components/app-lock';
import { Button, Card, Hair, IconButton, ListCard, ListRow, Notice, PageHeader, Screen, Segmented, T } from '@/components/ui';
import { accountText } from '@/features/account/text';
import { useAuth } from '@/data/auth';
import * as api from '@/data/team-access';
import { onLiveRefresh } from '@/data/live-events';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { useThemeMode } from '@/theme/theme-mode';

import { teamText } from './text';
import { crewRead } from './crew-cache';
import { CrewSyncStatus } from './crew-outbox';
import { CrewCaptureScreen } from './crew-capture';

/** The crew member's assigned jobs, reloaded each time the page comes back into view. */
function useCrewJobs() {
  const { t } = useLang();
  const auth = useAuth();
  const scope = `${auth.session?.user.id}:${auth.businessId}`;
  const [jobs, setJobs] = useState<api.CrewJob[] | null>(null);
  const [error, setError] = useState('');
  const live = useRef(true);
  const request = useRef(0);
  const load = useCallback(() => {
    const token = ++request.current;
    crewRead(scope, 'jobs', api.loadCrewJobs).then((j) => { if (live.current && token === request.current) { setJobs(j); setError(''); } },
      (e: unknown) => { if (live.current && token === request.current) { setJobs(null); setError(userError(t, e)); } });
  }, [scope, t]);
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
    {open.length ? <ListCard>
      {open.map((j, i) => <View key={j.id}>
        {i ? <Hair /> : null}
        <ListRow icon="briefcase" iconTone="accent" title={j.title} sub={`${j.address} · ${j.customer_name}`} onPress={() => onPick(j)} />
      </View>)}
    </ListCard> : null}
    {closed.length ? <ListCard>
      {closed.map((j, i) => <View key={j.id}>
        {i ? <Hair /> : null}
        <ListRow icon="lock" title={j.title} sub={j.address} onPress={() => onPick(j)} />
      </View>)}
    </ListCard> : null}
  </>;
}

export function CrewJobs() {
  const { lang } = useLang();
  const c = teamText(lang);
  const { businessName } = useAuth();
  const { jobs, error, retry } = useCrewJobs();
  return (
    <Screen floatingBar header={<PageHeader title={c.jobs} sub={businessName}
      right={<IconButton icon="settings" label={c.settings} onPress={() => router.push('/crew/settings')} />} />}>
      <CrewSyncStatus />
      {error ? <><Notice text={error} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={retry} /></> : null}
      {!jobs && !error ? <T muted>{c.loading}</T> : null}
      {jobs && !jobs.length ? <Notice text={c.noJobs} tone="soft" icon="info" /> : null}
      {jobs?.length ? <JobList jobs={jobs} onPick={(j) => router.push(`/crew/job/${j.id}`)} /> : null}
    </Screen>
  );
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
        <AppLockSetting />
      </Card>
      <ListCard>
        <ListRow icon="shield" title={t('legal.privacy')} chevron onPress={() => router.push('/privacy' as Href)} />
        <ListRow icon="file-text" title={t('legal.terms')} chevron onPress={() => router.push('/terms' as Href)} />
        {auth.configured && auth.session ? <ListRow icon="trash-2" title={t('deleteAccount.title')} chevron onPress={() => router.push('/delete-account' as Href)} /> : null}
      </ListCard>
      <Card style={{ gap: 10 }}>
        <T v="label">{auth.session?.user.email ?? ''}</T>
        <T v="small" muted>{c.crew}</T>
        <ListRow icon="user" title={accountText(lang).accountTitle} sub={accountText(lang).accountHelp} chevron onPress={() => router.push('/crew/account')} />
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
