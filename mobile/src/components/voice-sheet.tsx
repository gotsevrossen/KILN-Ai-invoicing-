import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { useLang } from '@/i18n';
import { joinHeard, loadVoiceLang, speech, useVoiceAvailable, voiceLocale } from '@/lib/voice';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Sheet } from './sheet';
import { Button, Icon, Notice, Row, T } from './ui';

/**
 * Records a voice note with the phone's speech recognition. The owner starts and stops it with
 * one button, can record more after stopping (it's added on), and taps Done to use the text.
 * Listens in the voice note language from Settings. Nothing is saved here.
 * The words can be fixed by hand once it stops. Without speech recognition (Expo Go) the
 * Record button is shown but off, and the owner types the note instead.
 */
export function VoiceSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const p = usePalette();
  const { t, lang: appLang } = useLang();
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const available = useVoiceAvailable();
  const [error, setError] = useState<string | null>(null);
  // read when recording starts, so a change in Settings counts right away
  const [lang, setLang] = useState(() => voiceLocale(loadVoiceLang(), appLang));
  const locale = useRef(lang.locale);
  const finals = useRef<string[]>([]);
  const partial = useRef('');
  const finishing = useRef<'done' | 'cancel' | null>(null);
  const onDevice = useRef(false);
  const retryOnline = useRef(false);

  const reset = () => {
    finals.current = [];
    partial.current = '';
    finishing.current = null;
    setHeard('');
    setError(null);
    setListening(false);
  };

  const start = (onPhone: boolean) => {
    onDevice.current = onPhone;
    speech?.start({
      lang: locale.current,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      // on the phone itself when it can; otherwise Apple's or Google's own service
      requiresOnDeviceRecognition: onPhone,
    });
  };

  const onResult = useEffectEvent((text: string, isFinal: boolean) => {
    if (isFinal) {
      finals.current.push(text);
      partial.current = '';
    } else {
      partial.current = text;
    }
    setHeard(joinHeard(finals.current, partial.current));
  });
  const onError = useEffectEvent((code: string) => {
    if (code === 'aborted') return;
    // this language isn't downloaded for on-phone use: try the phone maker's service instead
    // (once this attempt has fully stopped: 'end' always comes last)
    if (onDevice.current && (code === 'language-not-supported' || code === 'service-not-allowed')) {
      retryOnline.current = true;
      return;
    }
    setListening(false);
    setError(t(code === 'not-allowed' ? 'voice.denied'
      : code === 'no-speech' || code === 'speech-timeout' ? 'voice.noSpeech'
      : code === 'network' ? 'ai.errors.offline'
      : code === 'language-not-supported' ? 'voice.noLanguage'
      : 'voice.failed'));
  });
  /** The owner tapped Done and listening has stopped: hand back what was heard. */
  const finish = () => {
    const text = joinHeard(finals.current, partial.current);
    if (!text) {
      finishing.current = null;
      setError(t('voice.noSpeech'));
      return;
    }
    reset();
    onDone(text);
  };
  const onEnd = useEffectEvent(() => {
    if (retryOnline.current) {
      retryOnline.current = false;
      start(false);
      return;
    }
    setListening(false);
    if (finishing.current === 'done') finish();
  });

  useEffect(() => {
    if (!open || !speech) return;
    const subs = [
      speech.addListener('result', (e) => onResult(e.results[0]?.transcript ?? '', e.isFinal)),
      speech.addListener('error', (e) => onError(e.error)),
      speech.addListener('end', () => onEnd()),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      speech?.abort();
    };
  }, [open]);

  /** Start, or start again after a stop: what was already heard stays, and new words go after it. */
  const record = async () => {
    if (!speech || listening || starting) return;
    setError(null);
    setStarting(true);
    try {
      if (!(await speech.requestPermissionsAsync()).granted) {
        setError(t('voice.denied'));
        return;
      }
      const now = voiceLocale(loadVoiceLang(), appLang);
      setLang(now);
      locale.current = now.locale;
      if (partial.current) {
        finals.current.push(partial.current);
        partial.current = '';
      }
      finishing.current = null;
      setListening(true);
      start(speech.supportsOnDeviceRecognition());
    } catch {
      setError(t('voice.failed'));
    } finally {
      setStarting(false);
    }
  };
  /** The owner fixed or typed the words: they become what's heard so far. */
  const edit = (text: string) => {
    finals.current = text.trim() ? [text] : [];
    partial.current = '';
    setHeard(text);
  };
  // the last words arrive as listening stops; 'end' then marks it stopped
  const stop = () => speech?.stop();

  const done = () => {
    finishing.current = 'done';
    // stopped on its own (a long pause on older phones): what was heard is already here
    if (!listening) finish();
    else speech?.stop();
  };
  const cancel = () => {
    finishing.current = 'cancel';
    speech?.abort();
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={cancel} title={t('voice.title')}>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Icon name={listening ? 'radio' : 'mic'} size={18} color={listening ? p.danger : p.muted} />
        <T v="small" muted={!listening} style={{ flex: 1 }}>
          {listening ? t('voice.listening', { language: lang.lang === 'es' ? 'Español' : 'English' })
            : !available ? t('voice.typeHere') : heard ? t('voice.paused') : t('voice.ready')}
        </T>
      </Row>
      {!available ? <Notice text={t('voice.unavailable')} icon="info" tone="soft" /> : null}
      {listening ? (
        <View style={{ minHeight: 140, borderRadius: radius.sm, backgroundColor: p.ground, padding: 16 }}>
          <T v="body" muted={!heard} style={{ fontSize: 18, lineHeight: 26 }}>{heard || t('voice.speakNow')}</T>
        </View>
      ) : (
        <TextInput value={heard} onChangeText={edit} multiline maxLength={1000} accessibilityLabel={t('voice.title')}
          placeholder={available ? t('voice.speakNow') : t('voice.typeHere')} placeholderTextColor={p.muted}
          style={{ minHeight: 140, borderRadius: radius.sm, backgroundColor: p.ground, padding: 16, fontSize: 18, lineHeight: 26,
            color: p.ink, textAlignVertical: 'top' }} />
      )}
      {heard && !listening && available ? <T v="small" muted>{t('voice.canFix')}</T> : null}
      {error ? <T v="small" color={p.danger}>{error}</T> : null}
      <Button
        label={listening ? t('voice.stop') : heard ? t('voice.again') : t('voice.start')}
        icon={listening ? 'square' : 'mic'}
        variant={listening ? 'danger' : 'primary'}
        big
        disabled={starting || !available}
        onPress={listening ? stop : record}
      />
      <Button label={t('voice.done')} icon="check" variant="dark" big disabled={!heard || starting} onPress={done} />
      <Button label={t('common.cancel')} variant="outline" onPress={cancel} />
      <T v="small" muted>{t('voice.help')}</T>
    </Sheet>
  );
}
