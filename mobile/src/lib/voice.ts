import '@/lib/storage-install';

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { speechModule } from './speech-module';
import type { VoiceLang } from './voice-text';

// Voice notes use the phone's own speech recognition (Apple / Google): free, and on the phone
// itself when it supports it. In a browser, Safari's or Chrome's own. It listens in one
// language at a time, set in Settings. Off in Expo Go (see speech-module.ts).

/** The phone's or browser's speech recognition, or null. */
export const speech = speechModule;

const noChange = () => () => {};
// a browser can lack it (Firefox), and the web version is also drawn on the computer first,
// where there's no browser at all: so it's checked on the page, and off until then
const available = () => speech !== null && (Platform.OS !== 'web' || speech.isRecognitionAvailable());

/** True when this phone or browser can turn voice notes into text. */
export function useVoiceAvailable(): boolean {
  return useSyncExternalStore(noChange, available, () => false);
}

/** "Same as the app", or always English or Spanish. Kept on this phone only, like the theme. */
export type { VoiceLang } from './voice-text';

const KEY = 'kiln.voiceLang';

export function loadVoiceLang(): VoiceLang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return saved === 'en' || saved === 'es' ? saved : 'app';
  } catch {
    return 'app';
  }
}

export function saveVoiceLang(lang: VoiceLang): void {
  try {
    if (lang === 'app') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, lang);
  } catch {
    // no storage (private browser window): the choice lasts until the app closes
  }
}

export { joinHeard, voiceLocale } from './voice-text';
