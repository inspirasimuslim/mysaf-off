import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SecureStorageAdapter } from './secure-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * `false` bermakna .env belum diisi. App tetap boleh dibuka supaya
 * skrin log masuk dapat papar mesej panduan, bukannya crash.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Hanya relevan untuk aliran berasaskan URL (magic link) di web.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

// Refresh token hanya berjalan bila app berada di latar depan (mobile sahaja).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
