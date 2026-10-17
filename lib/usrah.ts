import { supabase } from './supabase';
import type { UsrahMatch } from './usrah-import';

/**
 * Operasi pangkalan data untuk kehadiran usrah bulanan.
 *
 * Sama seperti `lib/members.ts`: setiap fungsi melontar ralat mentah Supabase
 * dan tidak menyemak peranan sendiri. RLS pada `usrah_monthly_attendance` yang
 * menentukan baris mana boleh dibaca atau ditulis — lihat
 * `20260906000008_usrah_monthly_attendance.sql`.
 */

/** Baris ditulis dalam kelompok supaya satu import setahun tidak menjadi satu permintaan gergasi. */
const UPSERT_CHUNK = 500;

/** 12 nilai, Januari → Disember. `null` bermakna belum ada rekod. */
export type UsrahYear = (boolean | null)[];

/**
 * Asal kehadiran satu bulan: usrah sebenar, atau program bertanda "Ganti Usrah".
 * Lihat `20260915000036_ganti_usrah.sql`.
 */
export type UsrahAttendanceSource = 'usrah' | 'program_ganti';

export type UsrahMonthDetail = {
  attended: boolean | null;
  source: UsrahAttendanceSource | null;
  /** Bulan sudah tamat tanpa sebarang rekod -> dikira tidak hadir (paparan sahaja, DB tidak diubah). */
  autoAbsent: boolean;
};

/**
 * Sudahkah bulan itu TAMAT (waktu Malaysia, UTC+8)? Bulan semasa belum tamat, jadi
 * ahli yang belum scan bulan ini kekal "belum ada rekod" dan bukan terus tidak hadir.
 */
export function isUsrahMonthEnded(year: number, month: number, now: Date = new Date()): boolean {
  const my = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentYear = my.getUTCFullYear();
  const currentMonth = my.getUTCMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

/**
 * Ahli yang direkod SEBELUM tarikh ini ialah "ahli lama" (data diimport): semua bulan dikira.
 * Ahli yang direkod pada/selepas tarikh ini ialah "ahli baharu": hanya bulan SELEPAS (dan termasuk)
 * bulan dia menjadi ahli dikira — bulan sebelumnya kosong. Waktu Malaysia (UTC+8).
 */
const NEW_MEMBER_RULE_START = Date.parse('2026-10-17T00:00:00+08:00');

/** Bulan ini sudah tamat DAN layak dikira tidak hadir automatik (bukan sebelum ahli menjadi ahli). */
export function isUsrahMonthCounted(year: number, month: number, joinedAt: string | null, now: Date = new Date()): boolean {
  if (!isUsrahMonthEnded(year, month, now)) return false;
  if (!joinedAt) return true;
  const joinedMs = Date.parse(joinedAt);
  if (!Number.isFinite(joinedMs) || joinedMs < NEW_MEMBER_RULE_START) return true;
  const my = new Date(joinedMs + 8 * 60 * 60 * 1000);
  return year > my.getUTCFullYear() || (year === my.getUTCFullYear() && month >= my.getUTCMonth() + 1);
}

async function fetchMemberJoinedAt(memberId: string): Promise<string | null> {
  const { data, error } = await supabase.from('members').select('created_at').eq('id', memberId).maybeSingle();
  if (error) return null;
  return (data as { created_at: string } | null)?.created_at ?? null;
}

export type UsrahImportProgress = { done: number; total: number };

type AttendanceRow = {
  member_id: string;
  year: number;
  month: number;
  attended: boolean | null;
  attendance_source: UsrahAttendanceSource;
};

export function emptyUsrahYear(): UsrahYear {
  return Array.from({ length: 12 }, () => null);
}

/**
 * Kehadiran seorang ahli bagi satu tahun, sentiasa sebagai 12 nilai.
 *
 * Bentuk tetap 12 dipilih supaya pemanggil tidak perlu tahu bulan mana yang
 * ada baris dan mana yang tiada — ketiadaan baris dan `attended` NULL
 * bermaksud perkara yang sama kepada pembaca.
 */
export async function fetchUsrahYear(memberId: string, year: number): Promise<UsrahYear> {
  const { data, error } = await supabase
    .from('usrah_monthly_attendance')
    .select('month, attended')
    .eq('member_id', memberId)
    .eq('year', year);

  if (error) throw error;

  const months = emptyUsrahYear();
  ((data as { month: number; attended: boolean | null }[] | null) ?? []).forEach((row) => {
    if (row.month >= 1 && row.month <= 12) months[row.month - 1] = row.attended;
  });

  return months;
}

/**
 * Seperti `fetchUsrahYear`, dengan asal setiap bulan — untuk jalur Dashboard
 * yang melukis bulan program ganti secara berbeza. Bulan tanpa baris:
 * `{ attended: null, source: null }`.
 */
export async function fetchUsrahYearDetail(memberId: string, year: number): Promise<UsrahMonthDetail[]> {
  const [{ data, error }, joinedAt] = await Promise.all([
    supabase
      .from('usrah_monthly_attendance')
      .select('month, attended, attendance_source')
      .eq('member_id', memberId)
      .eq('year', year),
    fetchMemberJoinedAt(memberId),
  ]);

  if (error) throw error;

  const months: UsrahMonthDetail[] = Array.from({ length: 12 }, (_, index) => ({
    attended: null,
    source: null,
    autoAbsent: isUsrahMonthCounted(year, index + 1, joinedAt),
  }));
  (
    (data as { month: number; attended: boolean | null; attendance_source: UsrahAttendanceSource }[] | null) ?? []
  ).forEach((row) => {
    if (row.month >= 1 && row.month <= 12) {
      months[row.month - 1] = {
        attended: row.attended,
        source: row.attendance_source,
        autoAbsent: row.attended === null && isUsrahMonthCounted(year, row.month, joinedAt),
      };
    }
  });

  return months;
}

/**
 * Tulis kehadiran setahun bagi setiap ahli yang dipadankan.
 *
 * Kesemua 12 bulan ditulis, termasuk yang `null`. Import yang hanya menulis
 * bulan berisi akan meninggalkan nilai lama bagi bulan yang dikosongkan dalam
 * fail baharu — dengan menulis kesemuanya, fail yang diimport sentiasa menjadi
 * gambaran muktamad bagi tahun itu.
 *
 * `onConflict` pada (member_id, year, month) yang menjadikan import berulang
 * satu kemas kini, bukan pendua.
 */
export async function importUsrahAttendance(
  matched: UsrahMatch[],
  year: number,
  onProgress?: (progress: UsrahImportProgress) => void,
): Promise<number> {
  const rows: AttendanceRow[] = [];

  matched.forEach((match) => {
    match.months.forEach((attended, index) => {
      // Fail import ialah gambaran muktamad tahun itu — sumbernya usrah.
      rows.push({ member_id: match.memberId, year, month: index + 1, attended, attendance_source: 'usrah' });
    });
  });

  let done = 0;

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);

    const { error } = await supabase
      .from('usrah_monthly_attendance')
      .upsert(chunk, { onConflict: 'member_id,year,month' });
    if (error) throw error;

    done += chunk.length;
    onProgress?.({ done, total: rows.length });
  }

  return done;
}

// --- Butiran kehadiran (kawasan, lokasi, tarikh) -------------------------------

/** 'system' = imbasan QR; 'admin' = direkod atau dibetulkan secara manual. */
export type UsrahRecordedBy = 'system' | 'admin';

/** Satu bulan dengan butirannya. Bulan tanpa baris: semua nilai `null`. */
export type UsrahMonthRecord = {
  month: number;
  attended: boolean | null;
  source: UsrahAttendanceSource | null;
  kawasanAttended: string | null;
  locationText: string | null;
  /** 'YYYY-MM-DD' */
  attendedDate: string | null;
  recordedBy: UsrahRecordedBy | null;
  /** Tiada rekod hingga bulan tamat -> dikira tidak hadir (paparan sahaja). */
  autoAbsent: boolean;
};

type RecordRow = {
  month: number;
  attended: boolean | null;
  attendance_source: UsrahAttendanceSource;
  kawasan_attended: string | null;
  location_text: string | null;
  attended_date: string | null;
  recorded_by: UsrahRecordedBy;
};

/**
 * 12 bulan setahun beserta butiran — untuk Sejarah Kehadiran ahli dan skrin
 * pembetulan admin. RLS yang sama: ahli membaca barisnya sendiri, admin
 * LAJNAH TARBIAH membaca semua.
 */
export async function fetchUsrahYearRecords(memberId: string, year: number): Promise<UsrahMonthRecord[]> {
  const [{ data, error }, joinedAt] = await Promise.all([
    supabase
      .from('usrah_monthly_attendance')
      .select('month, attended, attendance_source, kawasan_attended, location_text, attended_date, recorded_by')
      .eq('member_id', memberId)
      .eq('year', year),
    fetchMemberJoinedAt(memberId),
  ]);

  if (error) throw error;

  const months: UsrahMonthRecord[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    attended: null,
    source: null,
    kawasanAttended: null,
    locationText: null,
    attendedDate: null,
    recordedBy: null,
    autoAbsent: isUsrahMonthCounted(year, index + 1, joinedAt),
  }));

  ((data as RecordRow[] | null) ?? []).forEach((row) => {
    if (row.month < 1 || row.month > 12) return;
    months[row.month - 1] = {
      month: row.month,
      attended: row.attended,
      source: row.attendance_source,
      kawasanAttended: row.kawasan_attended,
      locationText: row.location_text,
      attendedDate: row.attended_date,
      recordedBy: row.recorded_by,
      autoAbsent: row.attended === null && isUsrahMonthCounted(year, row.month, joinedAt),
    };
  });

  return months;
}

export type AdminUsrahAttendanceInput = {
  memberId: string;
  year: number;
  month: number;
  attended: boolean;
  kawasanAttended: string | null;
  locationText: string | null;
  /** 'YYYY-MM-DD' atau null */
  attendedDate: string | null;
};

/**
 * Rekod atau betulkan satu bulan. Kebenaran disemak di pelayan
 * (`admin_set_usrah_attendance` — LAJNAH TARBIAH sunting / Super Admin).
 */
export async function adminSetUsrahAttendance(input: AdminUsrahAttendanceInput): Promise<void> {
  const { error } = await supabase.rpc('admin_set_usrah_attendance', {
    p_member_id: input.memberId,
    p_year: input.year,
    p_month: input.month,
    p_attended: input.attended,
    p_kawasan_attended: input.kawasanAttended,
    p_location_text: input.locationText,
    p_attended_date: input.attendedDate,
  });
  if (error) throw new Error(error.message);
}

/**
 * Kosongkan status satu bulan — fall back ke "belum ditanda" (baris
 * dipadam terus, bukan attended=null, supaya bentuknya sama seperti bulan
 * yang memang tiada rekod). Kebenaran disemak di pelayan
 * (`admin_clear_usrah_attendance` — LAJNAH TARBIAH sunting / Super Admin).
 */
export async function adminClearUsrahAttendance(input: { memberId: string; year: number; month: number }): Promise<void> {
  const { error } = await supabase.rpc('admin_clear_usrah_attendance', {
    p_member_id: input.memberId,
    p_year: input.year,
    p_month: input.month,
  });
  if (error) throw new Error(error.message);
}

export type UsrahSessionOption = {
  eventId: string;
  name: string;
  /** 'YYYY-MM-DD' */
  date: string;
  locationText: string | null;
};

/**
 * Sesi usrah yang SUDAH berlangsung bagi bulan + kawasan (waktu Malaysia) — untuk
 * mengisi tarikh dan tempat secara automatik semasa admin menanda ahli hadir.
 */
export async function fetchUsrahSessions(year: number, month: number, kawasan: string): Promise<UsrahSessionOption[]> {
  const todayMy = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('usrah_events')
    .select('id, name, start_date, location_text')
    .eq('event_type', 'usrah')
    .eq('kawasan_usrah', kawasan)
    .eq('year', year)
    .eq('month', month)
    .is('archived_at', null)
    .lte('start_date', todayMy)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return ((data as { id: string; name: string; start_date: string; location_text: string | null }[] | null) ?? []).map(
    (row) => ({ eventId: row.id, name: row.name, date: row.start_date, locationText: row.location_text }),
  );
}

/** Tahun untuk pemilih: tahun depan hingga tahun data terawal (2025). */
export function usrahYearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let year = current + 1; year >= Math.min(2025, current); year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}


export type AttendanceEventOption = {
  eventId: string;
  name: string;
  eventType: string;
  startDate: string;
  kawasanUsrah: string | null;
  hadir: boolean;
  attendanceMode: 'bersemuka' | 'online' | null;
};

/**
 * Acara (usrah/program) yang BOLEH disunting oleh admin ini, dengan status
 * kehadiran ahli itu pada setiap satu. Kebenaran disemak di pelayan.
 */
export async function fetchAttendanceEvents(memberId: string): Promise<AttendanceEventOption[]> {
  const { data, error } = await supabase.rpc('admin_events_for_attendance', { p_member_id: memberId });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    eventId: row.event_id as string,
    name: row.name as string,
    eventType: row.event_type as string,
    startDate: row.start_date as string,
    kawasanUsrah: (row.kawasan_usrah as string | null) ?? null,
    hadir: row.hadir === true,
    attendanceMode: (row.attendance_mode as 'bersemuka' | 'online' | null) ?? null,
  }));
}

/**
 * Tanda (atau buang) kehadiran ahli pada SATU acara — menulis rekod acara yang dibaca
 * Excel kehadiran + grid bulanan. Migration 155.
 */
export async function adminSetEventAttendance(input: {
  memberId: string;
  eventId: string;
  hadir: boolean;
  mode: 'bersemuka' | 'online';
}): Promise<void> {
  const { error } = await supabase.rpc('admin_set_event_attendance', {
    p_member_id: input.memberId,
    p_event_id: input.eventId,
    p_hadir: input.hadir,
    p_mode: input.mode,
  });
  if (error) throw new Error(error.message);
}
