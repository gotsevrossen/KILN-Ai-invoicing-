import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';

// Browsers: the package's web version, built on the browser's own speech recognition
// (Safari and Chrome have it; Firefox doesn't, and voice stays off there).
export const speechModule: ExpoSpeechRecognitionModuleType | null = ExpoSpeechRecognitionModule;
