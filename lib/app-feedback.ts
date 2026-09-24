import { supabase } from './supabase';

export const FEEDBACK_MAX_LENGTH = 1000;

export type AppFeedbackRow = {
  id: string;
  full_name: string;
  generasi: string | null;
  message: string;
  created_at: string;
};

/**
 * Hantar maklum balas untuk ahli sendiri.
 *
 * Tiada `.select()` selepas insert dengan sengaja: ahli biasa tiada kebenaran
 * SELECT pada jadual ini, jadi `RETURNING` akan ditolak RLS.
 */
export async function submitAppFeedback(memberId: string, message: string): Promise<void> {
  const { error } = await supabase.from('app_feedback').insert({ member_id: memberId, message: message.trim() });
  if (error) throw error;
}

/** Super Admin sahaja — RPC menolak selain itu. Terkini dahulu. */
export async function fetchAppFeedback(): Promise<AppFeedbackRow[]> {
  const { data, error } = await supabase.rpc('list_app_feedback');
  if (error) throw error;
  return (data as AppFeedbackRow[] | null) ?? [];
}
