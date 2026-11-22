import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppLockSetting } from '@/components/app-lock';
import { Button, Card, Hair, ListCard, ListRow, Notice, PageHeader, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import { aiReady } from '@/data/ai';
import { useAuth } from '@/data/auth';
import { loadAutoSave, saveAutoSave } from '@/data/job-cleanup';
import { useStore } from '@/data/store';
import { saveTeamSettings, type TeamSettings } from '@/data/team-access';
import { accountText } from '@/features/account/text';
import { cleanupText } from '@/features/cleanup/text';
import { teamText } from '@/features/team/text';
import { refreshTeam, useTeam } from '@/features/team/use-team';
import { can } from '@/lib/permissions';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { loadVoiceLang, saveVoiceLang, type VoiceLang } from '@/lib/voice';
import { useThemeMode } from '@/theme/theme-mode';

/** Settings home: language right here, everything else one tap away on its own page. */
export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { state, actions } = useStore();
  const auth = useAuth();
  const theme = useThemeMode();
  const s = state.settings;
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(loadVoiceLang);
  const [error, setError] = useState<string | null>(null);
  const unpriced = state.priceList.filter((i) => i.unitCents === null).length;
  const team = useTeam();
  const c = teamText(lang);
  const owner = can(auth.role, 'businessSettings');
  const [teamError, setTeamError] = useState<string | null>(null);
  const k = cleanupText(lang);
  const a = accountText(lang);
  const connected = state.mode === 'connected' && !!auth.businessId;
  const [autoSave, setAutoSave] = useState<boolean | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  useEffect(() => {
    if (!connected || !owner || !auth.businessId) return;
    let live = true;
    loadAutoSave(auth.businessId).then((on) => { if (live) setAutoSave(on); }, (e: unknown) => { if (live) setDocsError(userError(t, e)); });
    return () => { live = false; };
  }, [connected, owner, auth.businessId, t]);
  const changeAutoSave = (on: boolean) => {
    if (!auth.businessId) return;
    const before = autoSave;
    setAutoSave(on);
    setDocsError(null);
    saveAutoSave(auth.businessId, on).catch((e: unknown) => { setAutoSave(before); setDocsError(userError(t, e)); });
  };
  const setTeam = (patch: Partial<TeamSettings>) => {
    if (!team.businessId) return;
    setTeamError(null);
    saveTeamSettings(team.businessId, patch).then(refreshTeam, (e: unknown) => setTeamError(userError(t, e)));
  };

  return (
    <Screen
      header={
        <PageHeader title={t('settings.title')} back={() => router.back()} />
      }>

      <Card style={{ gap: 8 }}>
        <T v="h3">{state.profile.businessName}</T>
        {state.profile.phone || state.profile.email ? <T v="small" muted>{[state.profile.phone, state.profile.email].filter(Boolean).join(' · ')}</T> : null}
        {owner ? <ListRow icon="briefcase" title={a.editBusiness} chevron onPress={() => router.push('/settings/business')} /> : null}
        {auth.configured && auth.session ? <ListRow icon="user" title={a.accountTitle} sub={auth.session.user.email} chevron onPress={() => router.push('/settings/account')} /> : null}
      </Card>

      <ListCard>
        {owner ? <>
          <ListRow icon="tool" title={t('settings.trades')} sub={state.profile.trades.map((id) => t(`trades.${id}`)).join(', ')} onPress={() => router.push('/settings/trades')} />
          <Hair />
        </> : null}
        <ListRow
          icon="tag"
          iconTone={unpriced > 0 ? 'flag' : 'soft'}
          title={t('settings.priceList')}
          sub={unpriced > 0 ? t('settings.needPrices', { count: unpriced }) : t('settings.itemCount', { count: state.priceList.length })}
          onPress={() => router.push('/settings/prices')}
        />
        {owner ? <>
          <Hair />
          <ListRow icon="percent" title={t('settings.pricing')} sub={t('settings.pricingSub', { markup: s.markupBps / 100, tax: s.tax.rateBps / 100 })} onPress={() => router.push('/settings/pricing')} />
          <Hair />
          <ListRow icon="credit-card" title={t('settings.payments')}
            sub={`${t('settings.due')}: ${s.dueDays === 0 ? t('settings.dueOnReceipt') : t('settings.dueDays', { days: s.dueDays })}`}
            onPress={() => router.push('/settings/payments')} />
        </> : null}
        {connected && (auth.role === 'owner' || auth.role === 'manager') ? <>
          <Hair />
          <ListRow icon="file-text" title={k.history} onPress={() => router.push('/saved-documents')} />
        </> : null}
      </ListCard>

      {team.businessId && owner && team.data ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{c.teamSection}</T>
          <SwitchRow label={c.hasTeam} help={c.hasTeamHelp} value={team.data.settings.hasTeam} onChange={(hasTeam) => setTeam({ hasTeam })} />
          {team.data.settings.hasTeam ? <>
            <SwitchRow label={c.crewPrices} help={c.crewPricesHelp} value={team.data.settings.crewSeesPrices} onChange={(crewSeesPrices) => setTeam({ crewSeesPrices })} />
            <SwitchRow label={c.managerCosts} help={c.managerCostsHelp} value={team.data.settings.managersSeeCosts} onChange={(managersSeeCosts) => setTeam({ managersSeeCosts })} />
          </> : null}
          {teamError ? <Notice text={teamError} tone="danger" icon="alert-circle" /> : null}
        </Card>
      ) : null}

      {owner && ((connected && autoSave !== null) || aiReady(state.mode)) ? (
        <Card style={{ gap: 12 }}>
          {connected && autoSave !== null ? <SwitchRow label={k.autoSave} help={k.autoSaveHelp} value={autoSave} onChange={changeAutoSave} /> : null}
          {docsError ? <Notice text={docsError} tone="danger" icon="alert-circle" /> : null}
          {aiReady(state.mode) ? <SwitchRow label={t('ai.scopeSetting')} help={t('ai.scopeSettingHelp')} value={state.aiScope} onChange={actions.setAiScope} /> : null}
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <T v="label">{t('settings.language')}</T>
        <Segmented label={t('settings.language')} value={lang} onChange={setLang}
          options={[{ key: 'en', label: 'English' }, { key: 'es', label: 'Español' }]} />
        <T v="small" muted>{t('settings.languageHelp')}</T>
        <T v="label">{t('voice.langSetting')}</T>
        <Segmented label={t('voice.langSetting')} value={voiceLang}
          onChange={(v) => { setVoiceLang(v); saveVoiceLang(v); }}
          options={[{ key: 'app', label: t('voice.sameAsApp') }, { key: 'en', label: 'English' }, { key: 'es', label: 'Español' }]} />
        <T v="small" muted>{t('voice.langHelp')}</T>
        <T v="label">{t('settings.theme')}</T>
        <Segmented label={t('settings.theme')} value={theme.mode} onChange={theme.setMode}
          options={[{ key: 'light', label: t('settings.themeLight') }, { key: 'dark', label: t('settings.themeDark') }, { key: 'system', label: t('settings.themeSystem') }]} />
        <AppLockSetting />
      </Card>

      <Card style={{ gap: 8 }}>
        {auth.configured ? (
          <>
            {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
            <Button label={t('auth.signOut')} icon="log-out" variant="outline" onPress={() => {
              setError(null);
              void auth.signOut().then(() => router.replace('/sign-in')).catch((e: unknown) => setError(userError(t, e)));
            }} />
          </>
        ) : (
          <Button
            label={t('settings.redoSetup')}
            icon="refresh-cw"
            variant="outline"
            onPress={() => {
              actions.redoSetup();
              router.replace('/setup');
            }}
          />
        )}
      </Card>

      {state.mode === 'example' ? <>
        <Hair />
        <Notice text={t('settings.about')} icon="info" tone="soft" />
      </> : null}
    </Screen>
  );
}
