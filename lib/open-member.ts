import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useMemberAccess } from '@/lib/department-access';
import { fetchMemberDirectory, fetchMembers } from '@/lib/members';
import type { DirectoryMember } from '@/types/database';

/**
 * Buka profil ahli daripada `nombor_ahli` (cth dari senarai hari jadi).
 *
 * Corak ketukan sama seperti tab Ahli: admin yang boleh LIHAT ahli dibawa ke
 * butiran penuh, ahli biasa ke paparan terhad (`ahli-view`). Direktori dibaca
 * melalui `list_members_directory()`; peta `nombor_ahli -> id` dibaca hanya untuk
 * admin. Kegagalan membaca senyap — `canOpen` pulang false, nama tidak boleh diketik.
 */
export function useMemberOpener() {
  const router = useRouter();
  const { loading: accessLoading, canView } = useMemberAccess();
  const [directory, setDirectory] = useState<Map<string, DirectoryMember>>(new Map());
  const [idByNumber, setIdByNumber] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (accessLoading) return;
    let active = true;

    void (async () => {
      try {
        const rows = await fetchMemberDirectory();
        if (!active) return;
        setDirectory(new Map(rows.filter((row) => row.nombor_ahli).map((row) => [row.nombor_ahli as string, row] as const)));
      } catch {
        return;
      }

      if (!canView) return;
      try {
        const rows = await fetchMembers();
        if (!active) return;
        setIdByNumber(
          new Map(rows.filter((row) => row.nombor_ahli).map((row) => [row.nombor_ahli as string, row.id] as const)),
        );
      } catch {
        if (active) setIdByNumber(new Map());
      }
    })();

    return () => {
      active = false;
    };
  }, [accessLoading, canView]);

  const canOpen = useCallback((nomborAhli?: string | null) => !!nomborAhli && directory.has(nomborAhli), [directory]);

  const open = useCallback(
    (nomborAhli?: string | null) => {
      const member = nomborAhli ? directory.get(nomborAhli) : undefined;
      if (!nomborAhli || !member) return;

      const id = idByNumber.get(nomborAhli);
      if (canView && id) {
        router.push({ pathname: '/(app)/admin/ahli-detail', params: { id } });
        return;
      }

      router.push({
        pathname: '/(app)/ahli-view',
        params: {
          nama: member.full_name,
          generasi: member.generasi ?? '',
          emel: member.email ?? '',
          tel: member.no_tel ?? '',
          avatar: member.avatar_url ?? '',
          pekerjaan: member.status_pekerjaan ?? '',
          perkahwinan: member.status_perkahwinan ?? '',
          jawatan: member.jawatan ?? '',
        },
      });
    },
    [canView, directory, idByNumber, router],
  );

  return { open, canOpen };
}
