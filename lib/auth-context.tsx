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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    let active = true;

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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void syncStoredRefreshToken(nextSession?.refresh_token);
    });

    return () => {
      active = false;
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
