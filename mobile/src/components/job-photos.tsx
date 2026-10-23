import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { photoLink } from '@/data/db-photos';
import { useStore } from '@/data/store';
import type { Photo } from '@/data/types';
import { useLang, type TFn } from '@/i18n';
import { pickJobPhotos, type NewPhoto } from '@/lib/job-photos';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Sheet } from './sheet';
import { Button, Icon, PhotoTile, Row, T } from './ui';

/** A photo from this phone (waiting to upload) or from the server, with its tag on top. */
export function PhotoImage({ photo, height = 96, tag, style }: { photo: Photo; height?: number; tag?: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const { t } = useLang();
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (photo.localUri || !photo.path) return;
    let live = true;
    const path = photo.path;
    photoLink(path).then((url) => {
      if (live) setLink({ path, url });
    }, () => {});
    return () => {
      live = false;
    };
  }, [photo.localUri, photo.path]);
  const uri = photo.localUri ?? (link && link.path === photo.path ? link.url : undefined);
  return (
    <View style={[{ height, borderRadius: radius.xs, overflow: 'hidden', backgroundColor: p.ground }, style]}>
      {uri ? (
        // the link changes every hour; the cache key keeps the same photo from loading again
        <Image source={{ uri, cacheKey: photo.path ?? photo.id }} contentFit="cover" style={{ flex: 1 }}
          accessibilityLabel={tag ? `${t('photos.photo')}: ${tag}` : t('photos.photo')} />
      ) : null}
      {tag ? (
        <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: p.inverse, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
          <T v="small" color={p.onInverse}>{tag}</T>
        </View>
      ) : null}
      {!photo.path ? (
        <View style={{ position: 'absolute', right: 6, top: 6, backgroundColor: p.card, borderRadius: radius.pill, padding: 4 }}
          accessibilityLabel={t('photos.waiting')}>
          <Icon name="upload-cloud" size={14} color={p.ink} />
        </View>
      ) : null}
    </View>
  );
}

/** Up to `max` photos in a row, each opening the photo page. */
export function PhotoStrip({ photos, max = 3, height = 96 }: { photos: Photo[]; max?: number; height?: number }) {
  const { t } = useLang();
  return (
    <Row gap={8}>
      {photos.slice(0, max).map((photo) => (
        <Pressable key={photo.id} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t('photos.open')}
          onPress={() => router.push({ pathname: '/photo/[id]', params: { id: photo.id } })}>
          <PhotoImage photo={photo} height={height} tag={t(`job.${photo.tag}`)} />
        </Pressable>
      ))}
      {/* keeps one or two photos from stretching across the whole card */}
      {Array.from({ length: Math.max(0, Math.min(max, 3) - photos.length) }, (_, i) => <View key={i} style={{ flex: 1 }} />)}
    </Row>
  );
}

/** Take a photo or choose some, then hand them to `onPicked`. Each is shrunk and saved on the phone first. */
export function PhotoSourceSheet({ open, onClose, onPicked }: { open: boolean; onClose: () => void; onPicked: (photos: NewPhoto[]) => void }) {
  const p = usePalette();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (camera: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const { photos, problem } = await pickJobPhotos(camera);
      if (problem) setError(t('ai.cameraDenied'));
      if (photos.length) onPicked(photos);
    } catch {
      setError(t('photos.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('photos.add')}>
      <Button label={busy ? t('photos.saving') : t('ai.takePhoto')} icon="camera" big disabled={busy} onPress={() => pick(true)} />
      <Button label={t('photos.choose')} icon="image" variant="outline" disabled={busy} onPress={() => pick(false)} />
      {error ? <T v="small" color={p.danger}>{error}</T> : null}
      <T v="small" muted>{t('photos.help')}</T>
    </Sheet>
  );
}

/**
 * Before and after photos for proof of work. With `showLocation` (the owner's choice on the
 * invoice), where each was taken is shown too. Example jobs with no photos show stand-ins.
 */
export function ProofPhotos({ jobId, t, showLocation = false, height = 110 }: { jobId: string; t: TFn; showLocation?: boolean; height?: number }) {
  const { state } = useStore();
  const photos = state.photos.filter((p) => p.jobId === jobId && p.tag !== 'during');
  const before = photos.filter((p) => p.tag === 'before').slice(0, 2);
  const after = photos.filter((p) => p.tag === 'after').slice(-2);
  if (!before.length && !after.length) {
    return state.mode === 'example' ? (
      <Row gap={8}>
        <PhotoTile tag={t('job.before')} height={height} />
        <PhotoTile tag={t('job.after')} height={height} />
      </Row>
    ) : <T v="small" muted>{t('photos.noProof')}</T>;
  }
  const shown = [...before, ...after];
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8}>
        {shown.map((photo) => <PhotoImage key={photo.id} photo={photo} height={height} tag={t(`job.${photo.tag}`)} style={{ flex: 1 }} />)}
      </Row>
      {showLocation ? shown.filter((p) => p.lat !== undefined).map((photo) => (
        <T key={photo.id} v="small" muted>
          {t('photos.takenAt', { tag: t(`job.${photo.tag}`), lat: photo.lat!.toFixed(4), lng: photo.lng!.toFixed(4) })}
        </T>
      )) : null}
    </View>
  );
}
