import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { eventFileName } from './event-attendance-report';
import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
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

export type RsvpSummary = {
  hadir: number;
  tidak_hadir: number;
  belum: number;
  /** Jumlah anak yang dibawa ahli yang akan hadir. */
  anak: number;
  ahli_bermalam: number;
  anak_bermalam: number;
};

/** Jawapan RSVP lengkap seorang ahli. `bermalam` meliputi ahli dan anak yang dibawa. */
export type MyRsvp = { response: RsvpResponse; bil_anak: number; bermalam: boolean };

export const MAX_ANAK = 6;

/** RSVP dibuka selagi acara belum melepasi tetingkap sahnya (RLS menyemak perkara yang sama). */
export function rsvpOpen(validUntil: string): boolean {
  return Date.parse(validUntil) > Date.now();
}

export async function fetchMyRsvp(eventId: string): Promise<MyRsvp | null> {
  const { data, error } = await supabase.rpc('my_event_rsvp_detail', { p_event_id: eventId });
  if (error) throw error;
  return ((data as MyRsvp[] | null) ?? [])[0] ?? null;
}

/** Upsert pada (event_id, member_id): menukar jawapan, bukan menambah baris. */
export async function setMyRsvp(eventId: string, answer: MyRsvp): Promise<void> {
  const hadir = answer.response === 'hadir';
  const { error } = await supabase.from('event_rsvp').upsert(
    {
      event_id: eventId,
      response: answer.response,
      bil_anak: hadir ? Math.min(Math.max(answer.bil_anak, 0), MAX_ANAK) : 0,
      bermalam: hadir && answer.bermalam,
    },
    { onConflict: 'event_id,member_id' },
  );
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
  bil_anak: number;
  bermalam: boolean;
};

export async function downloadRsvpList(
  eventId: string,
  eventName: string,
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  const { data, error } = await supabase.rpc('event_rsvp_export', { p_event_id: eventId });
  if (error) throw error;

  const rows = (data as RsvpExportRow[] | null) ?? [];
  if (!rows.length) {
    throw new UserError('Belum ada ahli yang memberi respon RSVP untuk acara ini.');
  }

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => {
      const hadir = row.response === 'hadir';
      const anak = hadir ? row.bil_anak : 0;
      return {
        'Nombor Ahli': row.nombor_ahli ?? '',
        Nama: row.full_name,
        Generasi: generationLabel(row.generasi),
        Response: RSVP_LABEL[row.response] ?? row.response,
        'Bawa Anak': hadir ? (anak > 0 ? 'Ya' : 'Tidak') : '',
        'Bil. Anak': anak,
        Bermalam: hadir ? (row.bermalam ? 'Ya' : 'Tidak') : '',
        'Jumlah Makan': hadir ? 1 + anak : 0,
        'Jumlah Bermalam': hadir && row.bermalam ? 1 + anak : 0,
        'Masa Response': new Date(row.responded_at).toLocaleString('ms-MY'),
      };
    }),
  );
  sheet['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 16 }, { wch: 22 }];

  const attending = rows.filter((row) => row.response === 'hadir');
  const anakTotal = attending.reduce((sum, row) => sum + row.bil_anak, 0);
  const bermalamRows = attending.filter((row) => row.bermalam);
  const anakBermalam = bermalamRows.reduce((sum, row) => sum + row.bil_anak, 0);
  const ringkasan = XLSX.utils.aoa_to_sheet([
    ['RINGKASAN (untuk bajet makanan & penginapan)', 'Bilangan'],
    ['Ahli akan hadir', attending.length],
    ['Anak dibawa', anakTotal],
    ['Jumlah makan (ahli + anak)', attending.length + anakTotal],
    [],
    ['Ahli bermalam', bermalamRows.length],
    ['Anak bermalam', anakBermalam],
    ['Jumlah bermalam (ahli + anak)', bermalamRows.length + anakBermalam],
    [],
    ['Ahli tidak hadir', rows.length - attending.length],
  ]);
  ringkasan['!cols'] = [{ wch: 46 }, { wch: 10 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ringkasan, 'Ringkasan');
  XLSX.utils.book_append_sheet(book, sheet, 'RSVP');

  const fileName = eventFileName('rsvp', eventName);
  const result = await deliverWorkbook(book, fileName, 'RSVP ' + eventName, mode);

  return { rows: rows.length, fileName, result };
}
