import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AdminAssignment, Profile, UserRole } from '@/types/database';

import { useAuth } from './auth-context';
import { toMalayError } from './errors';
import { supabase } from './supabase';

/**
 * Sumber tunggal kebenaran di dalam app.
 *
 * Profil + admin_assignments dibaca SEKALI semasa sesi bermula, kemudian
 * disimpan dalam context supaya modul akan datang hanya perlu memanggil
 * `canView(departmentId)` / `canEdit(departmentId)` tanpa query berulang.
 *
 * Semakan di sini adalah untuk UI sahaja. Kuasa sebenar terletak pada RLS di
 * Supabase — lihat `supabase/migrations/20260906000001_roles_permissions.sql`.
 */

export type PermissionsState = {
  /** `true` sehingga profil + assignment selesai dibaca. */
  loading: boolean;
  profile: Profile | null;
  role: UserRole;
  assignments: AdminAssignment[];
  /** Mesej BM bila bacaan gagal (rangkaian / RLS), `null` bila lancar. */
  error: string | null;
  /** Baca semula selepas peranan atau assignment berubah. */
  refresh: () => Promise<void>;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  canView: (departmentId: string) => boolean;
  canEdit: (departmentId: string) => boolean;
};

const EMPTY: PermissionsState = {
  loading: true,
  profile: null,
  role: 'ahli',
  assignments: [],
  error: null,
  refresh: async () => {},
  isSuperAdmin: () => false,
  isAdmin: () => false,
  canView: () => false,
  canEdit: () => false,
};

const PermissionsContext = createContext<PermissionsState>(EMPTY);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  const userId = user?.id ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Menapis hasil query yang sampai lewat selepas pengguna bertukar / log keluar. */
  const activeUser = useRef<string | null>(null);

  const load = useCallback(async (uid: string | null) => {
    activeUser.current = uid;

    if (!uid) {
      setProfile(null);
      setAssignments([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [profileResult, assignmentResult] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, role').eq('id', uid).maybeSingle(),
        supabase.from('admin_assignments').select('id, user_id, department_id, can_view, can_edit').eq('user_id', uid),
      ]);

      // Sesi sudah bertukar semasa query berjalan — abaikan hasil lapuk ini.
      if (activeUser.current !== uid) return;

      if (profileResult.error) throw profileResult.error;
      if (assignmentResult.error) throw assignmentResult.error;

      setProfile((profileResult.data as Profile | null) ?? null);
      setAssignments((assignmentResult.data as AdminAssignment[] | null) ?? []);
      setError(null);
    } catch (caught) {
      if (activeUser.current !== uid) return;
      setProfile(null);
      setAssignments([]);
      setError(toMalayError(caught, 'Gagal membaca kebenaran akaun.'));
    } finally {
      if (activeUser.current === uid) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Tunggu sesi tersimpan selesai dibaca supaya tiada query tanpa token.
    if (initialising) return;
    void load(userId);
  }, [initialising, load, userId]);

  const refresh = useCallback(async () => {
    await load(userId);
  }, [load, userId]);

  const value = useMemo<PermissionsState>(() => {
    const role: UserRole = profile?.role ?? 'ahli';
    const superAdmin = role === 'super_admin';

    /** Super Admin melangkaui department — tiada baris assignment diperlukan. */
    const find = (departmentId: string) => assignments.find((row) => row.department_id === departmentId);

    return {
      loading,
      profile,
      role,
      assignments,
      error,
      refresh,
      isSuperAdmin: () => superAdmin,
      isAdmin: () => role === 'admin' || superAdmin,
      canView: (departmentId: string) => superAdmin || Boolean(find(departmentId)?.can_view),
      canEdit: (departmentId: string) => superAdmin || Boolean(find(departmentId)?.can_edit),
    };
  }, [assignments, error, loading, profile, refresh]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsState {
  return useContext(PermissionsContext);
}

/** Pintasan untuk komponen yang hanya perlukan satu semakan. */
export function useIsSuperAdmin(): boolean {
  return usePermissions().role === 'super_admin';
}
