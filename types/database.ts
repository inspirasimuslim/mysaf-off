/**
 * Bentuk baris table Supabase yang digunakan oleh app.
 * Selari dengan `supabase/migrations/20260906000001_roles_permissions.sql`.
 */

export type UserRole = 'super_admin' | 'admin' | 'ahli';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
};

export type Department = {
  id: string;
  name: string;
  is_active: boolean;
};

export type AdminAssignment = {
  id: string;
  user_id: string;
  department_id: string;
  can_view: boolean;
  can_edit: boolean;
};

/** Kebenaran satu department tanpa metadata baris — bentuk yang diedit dalam borang. */
export type Permission = {
  can_view: boolean;
  can_edit: boolean;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  ahli: 'Ahli',
};

/** Nama paparan untuk satu profil: nama penuh > emel > "Tanpa nama". */
export function profileName(profile: Pick<Profile, 'full_name' | 'email'>): string {
  const name = profile.full_name?.trim();
  if (name) return name;
  const email = profile.email?.trim();
  if (email) return email;
  return 'Tanpa nama';
}
