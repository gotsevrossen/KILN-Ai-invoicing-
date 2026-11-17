import { useState } from 'react';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { Button, Notice, T } from './ui';

/** Local durability and server confirmation are deliberately different states. */
export function OfflineStatus() {
  const { state, actions } = useStore();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  if (state.mode !== 'connected' || !state.businessId) return null;
  if (state.localSave === 'confirmed') return <T v="small" muted>{t('offlineSave.confirmed')}</T>;
  return <>
    <Notice text={state.localSave === 'failed' ? t('offlineSave.failed') : t('offlineSave.waiting', { count: state.pendingSaves })}
      tone={state.localSave === 'failed' ? 'danger' : 'soft'} icon="cloud-off" />
    <Button label={busy ? t('common.loading') : t('offlineSave.retry')} variant="outline" disabled={busy} onPress={() => {
      setBusy(true);
      void actions.retryOffline().catch(() => {}).finally(() => setBusy(false));
    }} />
  </>;
}
