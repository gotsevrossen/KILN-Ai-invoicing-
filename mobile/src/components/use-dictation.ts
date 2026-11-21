import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { useLang } from '@/i18n';
import { joinHeard, loadVoiceLang, speech, useVoiceAvailable, voiceLocale } from '@/lib/voice';

/**
 * Talk straight into a text box, like a messaging app's mic: one tap starts listening, the words
 * show up as they're heard (`onHeard` gets everything heard in this recording so far), and a second
 * tap stops it. No pop-up, nothing saved. Listens in the voice note language from Settings.
 * Only reacts to the phone's speech events while it started them, so a voice note pop-up on
 * another screen isn't disturbed.
 */
export function useDictation(onHeard: (heard: string) => void) {
  const { t, lang: appLang } = useLang();
  const available = useVoiceAvailable();
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const finals = useRef<string[]>([]);
  const partial = useRef('');
  const locale = useRef<string>('en-US');
  const onDevice = useRef(false);
  const retryOnline = useRef(false);

  const begin = (onPhone: boolean) => {
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
    if (!active.current) return;
    if (isFinal) {
      finals.current.push(text);
      partial.current = '';
    } else {
      partial.current = text;
    }
    onHeard(joinHeard(finals.current, partial.current));
  });
  const onError = useEffectEvent((code: string) => {
    if (!active.current || code === 'aborted') return;
    // this language isn't downloaded for on-phone use: try the phone maker's service instead
    // (once this attempt has fully stopped: 'end' always comes last)
    if (onDevice.current && (code === 'language-not-supported' || code === 'service-not-allowed')) {
      retryOnline.current = true;
      return;
    }
    // a pause with words already in the box isn't worth a warning
    if ((code === 'no-speech' || code === 'speech-timeout') && joinHeard(finals.current, partial.current)) return;
    setError(t(code === 'not-allowed' ? 'voice.denied'
      : code === 'no-speech' || code === 'speech-timeout' ? 'voice.noSpeech'
      : code === 'network' ? 'ai.errors.offline'
      : code === 'language-not-supported' ? 'voice.noLanguage'
      : 'voice.failed'));
  });
  const onEnd = useEffectEvent(() => {
    if (!active.current) return;
    if (retryOnline.current) {
      retryOnline.current = false;
      begin(false);
      return;
    }
    active.current = false;
    setListening(false);
  });

  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('result', (e) => onResult(e.results[0]?.transcript ?? '', e.isFinal)),
      speech.addListener('error', (e) => onError(e.error)),
      speech.addListener('end', () => onEnd()),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      if (active.current) speech?.abort();
      active.current = false;
    };
  }, []);

  const start = async () => {
    if (listening || starting) return;
    setError(null);
    if (!speech || !available) {
      setError(t('voice.unavailableChat'));
      return;
    }
    setStarting(true);
    try {
      if (!(await speech.requestPermissionsAsync()).granted) {
        setError(t('voice.denied'));
        return;
      }
      locale.current = voiceLocale(loadVoiceLang(), appLang).locale;
      finals.current = [];
      partial.current = '';
      retryOnline.current = false;
      active.current = true;
      setListening(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      begin(speech.supportsOnDeviceRecognition());
    } catch {
      active.current = false;
      setListening(false);
      setError(t('voice.failed'));
    } finally {
      setStarting(false);
    }
  };
  /** Stops listening; the last words still arrive before it ends. */
  const stop = () => {
    if (!active.current) return;
    void Haptics.selectionAsync().catch(() => {});
    speech?.stop();
  };
  /** Stops right away and ignores anything still on its way (the message is being sent). */
  const cancel = () => {
    if (!active.current) return;
    active.current = false;
    speech?.abort();
    setListening(false);
  };

  return { listening, starting, error, toggle: () => (listening ? stop() : void start()), cancel };
}
