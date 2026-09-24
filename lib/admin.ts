import type { AdminAssignment, Department, Permission, Profile, UserRole } from '@/types/database';

import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk panel Super Admin.
 *
 * Setiap fungsi melontar (throw) ralat mentah Supabase — skrin pemanggil yang
 * menterjemahnya melalui `toMalayError`. RLS di Supabase yang menentukan sama
 * ada operasi ini dibenarkan; fungsi di sini tidak menyemak peranan sendiri.
 */

// --- Departments -------------------------------------------------------------

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('id, name, is_active').order('name');
  if (error) throw error;
  return (data as Department[] | null) ?? [];
}

export async function createDepartment(name: string): Promise<void> {
  const { error } = await supabase.from('departments').insert({ name: name.trim() });
  if (error) throw error;
}

export async function setDepartmentActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('departments').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/** Assignment yang merujuk department ini turut terpadam (on delete cascade). */
export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', id);
  if (error) throw error;
}

// --- Profil & assignment -----------------------------------------------------

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('email', { ascending: true });
  if (error) throw error;
  return (data as Profile[] | null) ?? [];
}

/** Semua assignment dalam sistem — hanya Super Admin yang dibenarkan RLS membacanya. */
export async function fetchAssignments(): Promise<AdminAssignment[]> {
  const { data, error } = await supabase
    .from('admin_assignments')
    .select('id, user_id, department_id, can_view, can_edit');
  if (error) throw error;
  return (data as AdminAssignment[] | null) ?? [];
}

export async function setRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

/**
 * Selaraskan assignment seorang pengguna dengan `desired` — baris yang tiada
 * dalam `desired` dibuang, yang ada dimasukkan atau dikemas kini.
 *
 * Peranan turut diselaraskan: ada sekurang-kurangnya satu department → `admin`,
 * tiada langsung → `ahli`. Super Admin dikecualikan supaya penyuntingan
 * assignment tidak sesekali menurunkan pangkatnya.
 */
export async function saveAssignments(
  userId: string,
  desired: Record<string, Permission>,
  currentRole: UserRole,
): Promise<void> {
  const keep = Object.keys(desired);

  let remove = supabase.from('admin_assignments').delete().eq('user_id', userId);
  if (keep.length) {
    // Petik ganda supaya UUID berhias sempadan yang jelas dalam senarai PostgREST.
    remove = remove.not('department_id', 'in', '(' + keep.map((id) => '"' + id + '"').join(',') + ')');
  }
  const { error: removeError } = await remove;
  if (removeError) throw removeError;

  if (keep.length) {
    const rows = Object.entries(desired).map(([department_id, permission]) => ({
      user_id: userId,
      department_id,
      can_view: permission.can_view,
      can_edit: permission.can_edit,
    }));

    const { error } = await supabase
      .from('admin_assignments')
      .upsert(rows, { onConflict: 'user_id,department_id' });
    if (error) throw error;
  }

  // Super Admin & Owner: peranannya tidak diselaraskan daripada assignment.
  if (currentRole === 'super_admin' || currentRole === 'owner') return;

  const nextRole: UserRole = keep.length ? 'admin' : 'ahli';
  if (nextRole !== currentRole) await setRole(userId, nextRole);
}

/** Tanggalkan seseorang daripada SEMUA department dan kembalikan peranannya kepada `ahli`. */
export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await supabase.from('admin_assignments').delete().eq('user_id', userId);
  if (error) throw error;
  await setRole(userId, 'ahli');
}
