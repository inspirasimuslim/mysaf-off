import { supabase } from './supabase';

/**
 * Permintaan padam akaun. Berasaskan permintaan (bukan padam serta-merta):
 * rekod yuran/PIPIS/kehadiran terikat pada akaun, jadi Super Admin menyemak
 * dan memproses. Semua operasi melalui RPC (migration 143).
 */

export type AccountDeletionRequest = {
  id: string;
  member_id: string;
  full_name: string;
  generasi: string | null;
  alasan: string | null;
  status: 'pending' | 'selesai' | 'ditolak';
  created_at: string;
};

export async function requestAccountDeletion(alasan: string): Promise<void> {
  const { error } = await supabase.rpc('request_account_deletion', { p_alasan: alasan });
  if (error) throw error;
}

export async function hasPendingAccountDeletion(): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_account_deletion_pending');
  if (error) throw error;
  return data === true;
}

export async function listAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  const { data, error } = await supabase.rpc('list_account_deletion_requests');
  if (error) throw error;
  return (data as AccountDeletionRequest[] | null) ?? [];
}

export async function resolveAccountDeletionRequest(id: string, status: 'selesai' | 'ditolak'): Promise<void> {
  const { error } = await supabase.rpc('resolve_account_deletion_request', { p_id: id, p_status: status });
  if (error) throw error;
}
