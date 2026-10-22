import { useScheme } from './theme-mode';
import { dark, light, type Palette } from './tokens';

export function usePalette(): Palette {
  return useScheme() === 'dark' ? dark : light;
}
