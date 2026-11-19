import { Stack } from 'expo-router';

import { CrewOutboxProvider } from '@/features/team/crew-outbox';
import { usePalette } from '@/theme/use-palette';

/** Crew members' own part of the app: their jobs, and adding work to them. */
export default function CrewLayout() {
  const p = usePalette();
  return <CrewOutboxProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }} /></CrewOutboxProvider>;
}
