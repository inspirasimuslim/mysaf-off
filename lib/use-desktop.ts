import { Platform, useWindowDimensions } from 'react-native';

/** Lebar minimum (px) bagi mod desktop web. Di bawahnya app kekal susun atur telefon. */
export const DESKTOP_BREAKPOINT = 1024;

/**
 * Mod desktop: web DAN lebar tetingkap >= 1024px. Native (termasuk tablet) dan
 * web sempit sentiasa `false`, jadi susun atur telefon tidak berubah langsung.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
