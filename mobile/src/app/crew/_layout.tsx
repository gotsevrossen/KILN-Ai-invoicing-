import { Stack } from 'expo-router';

import { usePalette } from '@/theme/use-palette';

/** Crew members' own part of the app: their jobs, and adding work to them. */
export default function CrewLayout() {
  const p = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }} />;
}
