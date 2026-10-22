import '@/lib/storage-install';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

/** The owner's choice in Settings. 'system' follows the phone. */
export type ThemeMode = 'system' | 'light' | 'dark';

// Kept on this device only: one phone can be dark while the owner's computer is light.
const KEY = 'kiln.theme';

function loadMode(): ThemeMode {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Phones: also switch the keyboard, status bar, and other built-in parts. Web has no such switch. */
function applyNative(mode: ThemeMode): void {
  if (Platform.OS !== 'web') Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

const initial = loadMode();
applyNative(initial);

type ThemeContext = { mode: ThemeMode; scheme: 'light' | 'dark'; setMode: (mode: ThemeMode) => void };

const Ctx = createContext<ThemeContext | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(initial);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    applyNative(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not saved; the choice still applies until the app closes
    }
  }, []);

  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeMode(): ThemeContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return ctx;
}

/** 'light' or 'dark' after the owner's choice. Falls back to the phone outside the provider. */
export function useScheme(): 'light' | 'dark' {
  const ctx = useContext(Ctx);
  const system = useColorScheme();
  return ctx ? ctx.scheme : system === 'dark' ? 'dark' : 'light';
}
