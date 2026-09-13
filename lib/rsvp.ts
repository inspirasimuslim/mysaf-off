import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { eventFileName } from './event-attendance-report';
import { UserError } from './errors';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * RSVP ahli untuk acara — lihat `20260913000027_event_rsvp.sql`.
 *
 * Ahli menulis terus ke `event_rsvp` (RLS: baris sendiri, acara masih dibuka).
 * `member_id` TIDAK dihantar: lalainya `my_member_id()` di pelayan, jadi app
 * tidak pernah memegang id ahli untuk dipalsukan. Admin membaca melalui RPC
 * `security definer` kerana nama ahli dan kiraan "belum respon" memerlukan
 * `members`, yang belum tentu boleh dibaca oleh admin department acara.
 */

export type RsvpResponse = 'hadir' | 'tidak_hadir';

export const RSVP_LABEL: Record<RsvpResponse, string> = {
  hadir: 'Akan Hadir',
  tidak_hadir: 'Tidak Akan Hadir',
};

export type RsvpSummary = { hadir: number; tidak_hadir: number; belum: number };

/** RSVP dibuka selagi acara belum melepasi tetingkap sahnya (RLS menyemak perkara yang sama). */
export function rsvpOpen(validUntil: string): boolean {
  return Date.parse(validUntil) > Date.now();
}

export async function fetchMyRsvp(eventId: string): Promise<RsvpResponse | null> {
  const { data, error } = await supabase.rpc('my_event_rsvp', { p_event_id: eventId });
  if (error) throw error;
  return (data as RsvpResponse | null) ?? null;
}

/** Upsert pada (event_id, member_id): menukar jawapan, bukan menambah baris. */
export async function setMyRsvp(eventId: string, response: RsvpResponse): Promise<void> {
  const { error } = await supabase
    .from('event_rsvp')
    .upsert({ event_id: eventId, response }, { onConflict: 'event_id,member_id' });
  if (error) throw error;
}

export async function fetchRsvpSummary(eventId: string): Promise<RsvpSummary | null> {
  const { data, error } = await supabase.rpc('event_rsvp_summary', { p_event_id: eventId });
  if (error) throw error;
  return ((data as RsvpSummary[] | null) ?? [])[0] ?? null;
}

type RsvpExportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  response: RsvpResponse;
  responded_at: string;
};

export async function downloadRsvpList(eventId: string, eventName: string): Promise<{ rows: number; fileName: string }> {
  const { data, error } = await supabase.rpc('event_rsvp_export', { p_event_id: eventId });
  if (error) throw error;

  const rows = (data as RsvpExportRow[] | null) ?? [];
  if (!rows.length) {
    throw new UserError('Belum ada ahli yang memberi respon RSVP untuk acara ini.');
  }

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      'Nombor Ahli': row.nombor_ahli ?? '',
      Nama: row.full_name,
      Generasi: generationLabel(row.generasi),
      Response: RSVP_LABEL[row.response] ?? row.response,
      'Masa Response': new Date(row.responded_at).toLocaleString('ms-MY'),
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'RSVP');

  const fileName = eventFileName('rsvp', eventName);
  await deliverWorkbook(book, fileName, 'RSVP ' + eventName);

  return { rows: rows.length, fileName };
}
