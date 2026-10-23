import { useSyncExternalStore } from 'react';

// How many sheets are showing. While one is, the page underneath stops moving for the keyboard:
// the keyboard belongs to the sheet's text box, and an iPhone page that moved for it could be
// left scrolled past its end, with blank space that doesn't scroll back (Capture's note and voice
// sheets did this).

let open = 0;
const listeners = new Set<() => void>();

export function sheetShown(): () => void {
  open += 1;
  listeners.forEach((l) => l());
  return () => {
    open -= 1;
    listeners.forEach((l) => l());
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open > 0, () => false);
}
