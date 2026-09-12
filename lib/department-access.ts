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

/**
 * Department yang memiliki modul Usrah.
 *
 * Sama seperti `DATA_DEPARTMENT`, nama ini mesti sepadan dengan
 * `can_view_usrah()` / `can_edit_usrah()` dalam
 * `20260906000008_usrah_monthly_attendance.sql`.
 */
export const TARBIAH_DEPARTMENT = 'LAJNAH TARBIAH';

/** Pintasan untuk modul Usrah. */
export function useUsrahAccess(): DepartmentAccess {
  return useDepartmentAccess(TARBIAH_DEPARTMENT);
}

/**
 * Department yang memiliki modul Program am.
 *
 * Mesti sepadan dengan `event_department('program')` dalam
 * `20260907000011_event_types.sql`. Usrah dan Program berkongsi satu table
 * tetapi bukan satu pemilik — seorang admin boleh memegang satu tanpa yang
 * satu lagi.
 */
export const SETIAUSAHA_DEPARTMENT = 'JABATAN SETIAUSAHA';

/** Pintasan untuk modul Program am. */
export function useProgramAccess(): DepartmentAccess {
  return useDepartmentAccess(SETIAUSAHA_DEPARTMENT);
}

/**
 * Department yang memiliki modul Yuran.
 *
 * Sama seperti department lain, nama ini mesti sepadan dengan
 * `can_view_yuran()` / `can_edit_yuran()` dalam `20260907000014_yuran.sql`.
 */
export const BENDAHARI_DEPARTMENT = 'BENDAHARI';

/** Pintasan untuk modul Yuran. */
export function useYuranAccess(): DepartmentAccess {
  return useDepartmentAccess(BENDAHARI_DEPARTMENT);
}

/**
 * Department yang memiliki modul Sumbangan PIPIS ASET.
 *
 * Bukan BENDAHARI walaupun kedua-duanya menyentuh wang: yuran ialah hutang
 * keahlian, PIPIS ialah dana aset. Nama ini mesti sepadan dengan
 * `can_view_pipis()` / `can_edit_pipis()` dalam `20260912000015_pipis.sql`.
 */
export const EKONOMI_DEPARTMENT = 'LAJNAH EKONOMI DAN ASET';

/** Pintasan untuk modul PIPIS ASET. */
export function usePipisAccess(): DepartmentAccess {
  return useDepartmentAccess(EKONOMI_DEPARTMENT);
}
