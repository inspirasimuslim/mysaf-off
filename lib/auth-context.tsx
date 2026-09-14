import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { syncStoredRefreshToken } from './biometrics';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** `true` sehingga sesi tersimpan selesai dibaca. */
  initialising: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  initialising: true,
});

let forcedSignedOut = false;
let applyForcedSignOut: (() => void) | null = null;

/**
 * Keluarkan sesi dari UI SERTA-MERTA, tanpa menunggu Supabase.
 *
 * `supabase.auth.signOut()` boleh tergantung (permintaan rangkaian pada
 * sambungan mati, atau menunggu refresh token yang memegang kunci dalaman).
 * Selagi ia belum selesai, `TOKEN_REFRESHED` yang tiba lewat diabaikan supaya
 * sesi tidak hidup semula; `SIGNED_OUT` atau `SIGNED_IN` sebenar menamatkan
 * keadaan ini.
 */
export function forceSignedOut(): void {
  forcedSignedOut = true;
  applyForcedSignOut?.();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    let active = true;
    applyForcedSignOut = () => setSession(null);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setInitialising(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void syncStoredRefreshToken(nextSession?.refresh_token);

      if (forcedSignedOut) {
        if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN') return;
        forcedSignedOut = false;
      }
      setSession(nextSession);
    });

    return () => {
      active = false;
      applyForcedSignOut = null;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, initialising }),
    [session, initialising],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Nama paparan: metadata > bahagian awal emel > "Ahli". */
export function displayName(user: User | null): string {
  if (!user) return 'Ahli';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = meta?.full_name ?? meta?.name;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const local = user.email?.split('@')[0];
  if (!local) return 'Ahli';
  return local.charAt(0).toUpperCase() + local.slice(1);
}
