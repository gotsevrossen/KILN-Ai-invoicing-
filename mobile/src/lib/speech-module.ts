import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModuleType } from 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types';

// Phones: the speech package's native part, asked for by name. It isn't in Expo Go, and
// importing the package there would crash, so this is null there and voice is off.
export const speechModule = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>('ExpoSpeechRecognition');
