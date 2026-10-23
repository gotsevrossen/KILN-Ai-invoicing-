import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { PhotoImage } from '@/components/job-photos';
import { RecordGate } from '@/components/record-gate';
import { Sheet } from '@/components/sheet';
import { Button, Card, Notice, PageHeader, Screen, Segmented, T } from '@/components/ui';
import { jobById, workLocked } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import type { PhotoTag } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { localDay } from '@/lib/photo-facts';

/** One job photo: big, its before/during/after tag, when and where it was taken, and delete. */
function PhotoPage() {
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const photo = state.photos.find((p) => p.id === id)!;
  const job = jobById(photo.jobId);
  const locked = workLocked(state, job.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const taken = new Date(photo.takenAt);
  const time = taken.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen header={<PageHeader title={t('photos.photo')} sub={job.title} back={() => router.back()} />}>
      <PhotoImage photo={photo} height={420} />
      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('photos.tag')}</T>
        {locked ? <T v="label">{t(`job.${photo.tag}`)}</T> : (
          <Segmented<PhotoTag>
            label={t('photos.tag')}
            value={photo.tag}
            onChange={(tag) => actions.setPhotoTag(photo.id, tag)}
            options={(['before', 'during', 'after'] as const).map((tag) => ({ key: tag, label: t(`job.${tag}`) }))}
          />
        )}
        <T v="small" muted>{t('photos.when', { date: f.date(localDay(photo.takenAt)), time })}</T>
        <T v="small" muted>
          {photo.lat !== undefined ? t('photos.where', { lat: photo.lat.toFixed(4), lng: photo.lng!.toFixed(4) }) : t('photos.noWhere')}
        </T>
      </Card>
      {!photo.path ? <Notice text={t('photos.waitingLong')} icon="upload-cloud" tone="soft" /> : null}
      {locked ? <Notice text={t('photos.locked')} icon="lock" tone="soft" /> : (
        <Button label={t('photos.delete')} icon="trash-2" variant="outline" onPress={() => setDeleteOpen(true)} />
      )}

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('photos.deleteTitle')}>
        <T v="body">{t('photos.deleteBody')}</T>
        <Button label={t('photos.delete')} icon="trash-2" variant="danger" big onPress={() => {
          setDeleteOpen(false);
          router.back();
          // once this page has closed, so it never shows a photo that's gone
          setTimeout(() => actions.removePhoto(photo.id), 400);
        }} />
        <Button label={t('common.cancel')} variant="outline" onPress={() => setDeleteOpen(false)} />
      </Sheet>
    </Screen>
  );
}

/** Waits for the photo to load (a link or refresh can arrive first) instead of crashing. */
export default function PhotoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => currentState().photos.some((p) => p.id === id)}><PhotoPage /></RecordGate>;
}
