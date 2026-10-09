import { vars } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, View, useColorScheme as useSystemColorScheme } from 'react-native';

import { DarkColors, LightColors, type ThemeColors } from '@/constants/theme';

import { getItem, setItem } from './secure-storage';

/**
 * Tema app: cerah / gelap / ikut telefon.
 *
 * Pilihan disimpan pada peranti (bukan akaun) — tema ialah tetapan paparan
 * sesebuah peranti, dan ahli boleh mahu telefon gelap tetapi komputer cerah.
 * Lalai "cerah" supaya rupa app tidak berubah mengejut bagi sesiapa yang belum
 * memilih.
 *
 * Cara ia berfungsi:
 *  - Kelas Tailwind (`bg-surface`, `text-ink` …) membaca pembolehubah CSS `--c-*`;
 *    `ThemeProvider` mengisinya melalui `vars()` pada pembungkus akar.
 *  - Warna yang mesti diberi sebagai nilai literal (ikon, `placeholderTextColor`,
 *    gradient, opsyen navigasi) dibaca melalui `useColors()`.
 */
export type ThemePreference = 'sistem' | 'cerah' | 'gelap';
export type ThemeScheme = 'light' | 'dark';

const STORAGE_KEY = 'mysaff.theme';
const DEFAULT_PREFERENCE: ThemePreference = 'cerah';

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeScheme;
  colors: ThemeColors;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: DEFAULT_PREFERENCE,
  scheme: 'light',
  colors: LightColors,
  setPreference: () => undefined,
});

function isPreference(value: string | null): value is ThemePreference {
  return value === 'sistem' || value === 'cerah' || value === 'gelap';
}

/** '#0F5132' -> '15 81 50' (format saluran yang diharapkan `rgb(var(--c-x) / <alpha-value>)`). */
function hexToChannels(hex: string): string {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).join(' ');
}

function toCssVars(colors: ThemeColors): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, hex] of Object.entries(colors)) {
    result['--c-' + name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())] = hexToChannels(hex);
  }
  return result;
}

const LIGHT_VARS = vars(toCssVars(LightColors));
const DARK_VARS = vars(toCssVars(DarkColors));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    let cancelled = false;
    getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const scheme: ThemeScheme =
    preference === 'sistem' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference === 'gelap' ? 'dark' : 'light';
  const colors = scheme === 'dark' ? DarkColors : LightColors;

  // Biar dialog/sistem native (papan kekunci, pemilih tarikh) ikut pilihan, bukan hanya app.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(preference === 'sistem' ? 'unspecified' : scheme);
    } catch {
      // Tidak kritikal — app sendiri tetap ikut `scheme`.
    }
  }, [preference, scheme]);

  // Web: warna latar dokumen (kawasan di luar pokok React, overscroll) dan kawalan bawaan pelayar.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = colors.background;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = colors.background;
    // Modal web dirender dalam portal di luar pembungkus akar — pembolehubah CSS mesti ada pada <html> juga.
    for (const [name, channels] of Object.entries(toCssVars(colors))) {
      document.documentElement.style.setProperty(name, channels);
    }
  }, [colors, scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, colors, setPreference }),
    [preference, scheme, colors, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: colors.background }, scheme === 'dark' ? DARK_VARS : LIGHT_VARS]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Palet semasa sebagai nilai literal — untuk prop yang tidak menerima `className`. */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
