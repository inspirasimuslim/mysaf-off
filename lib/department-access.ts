import { useEffect, useState } from 'react';

import { fetchDepartments } from './admin';
import { usePermissions } from './permissions';

/**
 * Department yang memiliki modul Senarai Ahli.
 *
 * Nama ini mesti sepadan dengan `can_view_members()` / `can_edit_members()`
 * dalam `20260906000002_members.sql` — app dan RLS menyemak department yang
 * SAMA, cuma di lapisan berbeza.
 */
export const DATA_DEPARTMENT = 'JABATAN DATA & SUMBER MANUSIA';

export type DepartmentAccess = {
  loading: boolean;
  canView: boolean;
  canEdit: boolean;
};

/**
 * Terjemah nama department kepada kebenaran pengguna semasa.
 *
 * `usePermissions` menyimpan assignment mengikut `department_id`, sedangkan
 * modul merujuk department mengikut nama — jadi senarai department perlu dibaca
 * sekali untuk merapatkan kedua-duanya.
 *
 * Ini kawalan UI semata-mata. Bila bacaan gagal, kebenaran ditolak (`false`)
 * dan RLS tetap menjadi penentu muktamad di Supabase.
 */
export function useDepartmentAccess(name: string): DepartmentAccess {
  const { loading: permissionsLoading, isSuperAdmin, canView, canEdit } = usePermissions();

  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const departments = await fetchDepartments();
        if (!active) return;
        setDepartmentId(departments.find((row) => row.name === name)?.id ?? null);
      } catch {
        // Kegagalan bacaan tidak boleh membuka akses — biarkan id kekal null.
        if (active) setDepartmentId(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [name]);

  // Super Admin melangkaui department, jadi tidak perlu menunggu senarai dibaca.
  if (!permissionsLoading && isSuperAdmin()) {
    return { loading: false, canView: true, canEdit: true };
  }

  if (permissionsLoading || loading) {
    return { loading: true, canView: false, canEdit: false };
  }

  if (!departmentId) return { loading: false, canView: false, canEdit: false };

  return { loading: false, canView: canView(departmentId), canEdit: canEdit(departmentId) };
}

/** Pintasan untuk modul Senarai Ahli. */
export function useMemberAccess(): DepartmentAccess {
  return useDepartmentAccess(DATA_DEPARTMENT);
}
