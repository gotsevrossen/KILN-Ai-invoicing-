import 'react-native-url-polyfill/auto';
import './storage-install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Values come from mobile/.env.local (never committed). See mobile/.env.example.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * The Supabase client, or null when no server is set up. With no server the app
 * runs in example mode (example data in memory), like before.
 * The publishable key is safe in the app: Row Level Security decides what each
 * user can see. Secret keys (Claude, Stripe, Deepgram…) live only on the server.
 */
// The web build also renders pages once on the computer (no browser there, so no
// localStorage). Sessions are only kept where storage exists: phones and browsers.
const hasStorage = typeof localStorage !== 'undefined';

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: hasStorage ? localStorage : undefined,
          autoRefreshToken: hasStorage,
          persistSession: hasStorage,
          detectSessionInUrl: false,
        },
      })
    : null;

// keep the session fresh only while the app is open
if (supabase && hasStorage) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
