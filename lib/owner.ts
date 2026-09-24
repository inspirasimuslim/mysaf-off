import { supabase } from './supabase';

/**
 * Operasi Owner (pemulihan kecemasan). Semuanya RPC `security definer` yang
 * menyemak `is_owner()` di pelayan — Owner sengaja TIDAK boleh membaca
 * `profiles` terus (RLS), jadi senarai dan carian datang dari sini.
 */

export type SuperAdminRow = {
  profile_id: string;
  member_id: string | null;
  full_name: string | null;
  email: string | null;
};

export type MemberSearchRow = {
  member_id: string;
  full_name: string;
  nombor_ahli: string | null;
  email: string | null;
  role: string;
};

export async function ownerListSuperAdmins(): Promise<SuperAdminRow[]> {
  const { data, error } = await supabase.rpc('owner_list_super_admins');
  if (error) throw error;
  return (data as SuperAdminRow[] | null) ?? [];
}

export async function ownerSearchMembers(query: string): Promise<MemberSearchRow[]> {
  const { data, error } = await supabase.rpc('owner_search_members', { p_query: query });
  if (error) throw error;
  return (data as MemberSearchRow[] | null) ?? [];
}

/** `id` = `members.id` (atau `profiles.id` bagi Super Admin tanpa rekod ahli). */
export async function ownerSetSuperAdmin(id: string, makeSuperAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('owner_set_super_admin', {
    p_member_id: id,
    p_make_super_admin: makeSuperAdmin,
  });
  if (error) throw error;
}
