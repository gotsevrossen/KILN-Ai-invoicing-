import '@/lib/storage-install';

import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';
import { Platform } from 'react-native';

import type { VoiceLang } from './voice-text';

// Voice notes use the phone's own speech recognition (Apple / Google): free, and on the phone
// itself when it supports it. It listens in one language at a time, set in Settings.
//
// The package's native part isn't in Expo Go. Asking for it by name (instead of importing the
// package, which would crash there) lets Expo Go keep working: voice is simply off.

const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');

/** The phone's speech recognition, or null (Expo Go, web). */
export const speech = native;
export const voiceAvailable = native !== null;

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
