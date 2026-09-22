import type {
  NaqibAssignmentWithMember,
  PerkaderanExport,
  UsrahGroup,
  UsrahGroupSummary,
  UsrahMadU,
  UsrahSession,
} from '@/types/database';

import { UserError } from './errors';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk Usrah Sekolah (Naqib/Naqibah, Mad'u, Sesi) —
 * LAJNAH PERKADERAN.
 *
 * Sama seperti `lib/members.ts` / `lib/usrah-events.ts`: setiap fungsi
 * melontar ralat mentah Supabase dan tidak menyemak peranan sendiri. RLS pada
 * setiap table (lihat `20260922000050_sekolah_usrah.sql`) yang menentukan
 * sama ada operasi dibenarkan — super_admin, admin LAJNAH PERKADERAN, atau
 * naqib aktif bagi kumpulan SENDIRI.
 */

// =============================================================================
// Lantikan Naqib (skrin admin/naqib-assignments.tsx)
// =============================================================================

export async function fetchActiveNaqibList(): Promise<NaqibAssignmentWithMember[]> {
  const { data, error } = await supabase.rpc('perkaderan_naqib_list');
  if (error) throw error;
  return (data as NaqibAssignmentWithMember[] | null) ?? [];
}

export async function assignNaqib(memberId: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('perkaderan_naqib_assignments')
    .insert({ member_id: memberId, assigned_by: session.user?.id ?? null });
  if (error) throw error;
}

/** Set `is_active=false` — JANGAN hard delete, kumpulan/sesi lampau kekal wujud secara sejarah. */
export async function removeNaqib(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('perkaderan_naqib_assignments')
    .update({ is_active: false })
    .eq('id', assignmentId);
  if (error) throw error;
}

// =============================================================================
// Kumpulan (admin/perkaderan-groups.tsx, hub naqib, perkaderan-group-detail.tsx)
// =============================================================================

/** Semua kumpulan merentasi semua naqib — untuk skrin admin sahaja (RLS menyekat naqib biasa). */
export async function fetchAllGroupsSummary(): Promise<UsrahGroupSummary[]> {
  const { data, error } = await supabase.rpc('perkaderan_groups_summary');
  if (error) throw error;
  return (data as UsrahGroupSummary[] | null) ?? [];
}

/**
 * Rekod ahli untuk akaun semasa, atau `null` bila akaun ini tiada rekod
 * ahli terpaut. Dikongsi oleh setiap fungsi di bawah yang perlu tahu
 * "kumpulan MANA milik saya" — RLS menyemak perkara sama di pelayan, tetapi
 * app perlukannya untuk membina query dan menentukan `canEdit` UI.
 */
export async function fetchMyMemberId(): Promise<string | null> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return null;

  const { data: member, error } = await supabase.from('members').select('id').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return (member as { id: string } | null)?.id ?? null;
}

/** Kumpulan milik naqib SENDIRI — untuk seksyen "Kumpulan Usrah Saya" di Hub Admin. */
export async function fetchMyGroups(): Promise<UsrahGroup[]> {
  const memberId = await fetchMyMemberId();
  if (!memberId) return [];

  const { data, error } = await supabase
    .from('sekolah_usrah_groups')
    .select('*')
    .eq('naqib_member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as UsrahGroup[] | null) ?? [];
}

export async function fetchGroup(id: string): Promise<UsrahGroup | null> {
  const { data, error } = await supabase.from('sekolah_usrah_groups').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as UsrahGroup | null) ?? null;
}

/**
 * Cipta kumpulan + sesi PERTAMA serentak dalam SATU aliran — bila naqib
 * belum mempunyai kumpulan langsung. Mad'u belum wujud pada peringkat ini,
 * jadi sesi pertama tercipta tanpa sebarang kehadiran; naqib menambah mad'u
 * dan merekod kehadiran bermula sesi kedua.
 *
 * `defaultPartnerNaqibMemberId` disimpan pada KEDUA-DUA kumpulan (cadangan
 * untuk sesi akan datang) DAN sesi pertama ini (nilai sebenar sesi itu) —
 * selepas ini, setiap sesi menyimpan pilihannya sendiri secara berasingan.
 */
export async function createGroupWithFirstSession(
  sekolah: string,
  defaultPartnerNaqibMemberId: string | null,
  firstSession: { session_date: string; location_text: string | null; topik: string | null },
): Promise<{ group: UsrahGroup; session: UsrahSession }> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id ?? null;

  const memberId = await fetchMyMemberId();
  if (!memberId) {
    throw new UserError(
      'Rekod ahli untuk akaun ini tidak dijumpai atau akaun masih memerlukan tukar kata laluan sementara. ' +
        'Log masuk semula dan tukar kata laluan dahulu jika masih diminta.',
    );
  }

  const { data: group, error: groupError } = await supabase
    .from('sekolah_usrah_groups')
    .insert({ naqib_member_id: memberId, sekolah, default_partner_naqib_member_id: defaultPartnerNaqibMemberId })
    .select('*')
    .single();
  if (groupError) throw groupError;

  const { data: firstSessionRow, error: sessionError } = await supabase
    .from('sekolah_usrah_sessions')
    .insert({
      group_id: (group as UsrahGroup).id,
      session_date: firstSession.session_date,
      location_text: firstSession.location_text,
      topik: firstSession.topik,
      partner_naqib_member_id: defaultPartnerNaqibMemberId,
      recorded_by: uid,
    })
    .select('*')
    .single();
  if (sessionError) throw sessionError;

  return { group: group as UsrahGroup, session: firstSessionRow as UsrahSession };
}

// =============================================================================
// Mad'u (senarai dalam perkaderan-group-detail.tsx)
// =============================================================================

export async function fetchMadU(groupId: string, includeInactive = false): Promise<UsrahMadU[]> {
  let query = supabase.from('sekolah_usrah_mad_u').select('*').eq('group_id', groupId);
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query.order('nama', { ascending: true });
  if (error) throw error;
  return (data as UsrahMadU[] | null) ?? [];
}

export async function addMadU(groupId: string, nama: string, tingkatan: string | null): Promise<UsrahMadU> {
  const { data, error } = await supabase
    .from('sekolah_usrah_mad_u')
    .insert({ group_id: groupId, nama: nama.trim(), tingkatan: tingkatan?.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  return data as UsrahMadU;
}

/** Soft-remove sahaja — JANGAN hard delete, ia memusnahkan sejarah kehadiran lampau. */
export async function removeMadU(id: string): Promise<void> {
  const { error } = await supabase.from('sekolah_usrah_mad_u').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// =============================================================================
// Sesi (senarai + borang dalam perkaderan-group-detail.tsx)
// =============================================================================

export async function fetchSessions(groupId: string): Promise<UsrahSession[]> {
  const { data, error } = await supabase
    .from('sekolah_usrah_sessions')
    .select('*')
    .eq('group_id', groupId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as UsrahSession[] | null) ?? [];
}

export async function fetchSession(id: string): Promise<UsrahSession | null> {
  const { data, error } = await supabase.from('sekolah_usrah_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as UsrahSession | null) ?? null;
}

export type SessionInput = {
  session_date: string;
  location_text: string | null;
  topik: string | null;
  partner_naqib_member_id: string | null;
  /** Diabaikan bila `partner_naqib_member_id` null — DB kekalkan `true` sebagai lalai. */
  partner_naqib_hadir: boolean;
};

export async function createSession(groupId: string, input: SessionInput): Promise<UsrahSession> {
  const { data: session } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('sekolah_usrah_sessions')
    .insert({ group_id: groupId, ...input, recorded_by: session.user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as UsrahSession;
}

export async function updateSession(id: string, input: SessionInput): Promise<UsrahSession> {
  const { data, error } = await supabase.from('sekolah_usrah_sessions').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data as UsrahSession;
}

// =============================================================================
// Kehadiran — checkbox dalam borang sesi
// =============================================================================

/** Satu mad'u dalam senarai checkbox sesi, dengan status hadir semasa. */
export type AttendanceCandidate = {
  mad_u_id: string;
  nama: string;
  tingkatan: string | null;
  /** Mad'u ini sudah dibuang (`is_active=false`) tetapi kekal papar kerana ada rekod hadir sejarah pada sesi ini. */
  removed: boolean;
  hadir: boolean;
};

/**
 * Senarai checkbox bagi SATU sesi: mad'u AKTIF sekarang, PLUS mana-mana
 * mad'u yang sudah dibuang tetapi ada rekod hadir sejarah pada sesi INI —
 * sejarah kehadiran tidak pernah hilang daripada paparan, walaupun mad'u itu
 * sudah tiada dalam senarai aktif kumpulan.
 *
 * Sesi BAHARU (`sessionId === null`) hanya memulangkan mad'u aktif — belum
 * ada sebarang rekod kehadiran untuk digabungkan.
 */
export async function fetchAttendanceCandidates(groupId: string, sessionId: string | null): Promise<AttendanceCandidate[]> {
  const [activeResult, attendanceResult] = await Promise.all([
    supabase.from('sekolah_usrah_mad_u').select('id, nama, tingkatan').eq('group_id', groupId).eq('is_active', true),
    sessionId
      ? supabase.from('sekolah_usrah_attendance').select('mad_u_id').eq('session_id', sessionId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (activeResult.error) throw activeResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const active = (activeResult.data as { id: string; nama: string; tingkatan: string | null }[] | null) ?? [];
  const attendedIds = new Set(((attendanceResult.data as { mad_u_id: string }[] | null) ?? []).map((row) => row.mad_u_id));

  const candidates = new Map<string, AttendanceCandidate>();
  for (const row of active) {
    candidates.set(row.id, { mad_u_id: row.id, nama: row.nama, tingkatan: row.tingkatan, removed: false, hadir: attendedIds.has(row.id) });
  }

  const missingIds = [...attendedIds].filter((id) => !candidates.has(id));
  if (missingIds.length > 0) {
    const { data: removedRows, error: removedError } = await supabase
      .from('sekolah_usrah_mad_u')
      .select('id, nama, tingkatan')
      .in('id', missingIds);
    if (removedError) throw removedError;

    for (const row of (removedRows as { id: string; nama: string; tingkatan: string | null }[] | null) ?? []) {
      candidates.set(row.id, { mad_u_id: row.id, nama: row.nama, tingkatan: row.tingkatan, removed: true, hadir: true });
    }
  }

  return [...candidates.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'ms', { sensitivity: 'base' }));
}

/**
 * Selaraskan kehadiran sesi dengan set `presentMadUIds` yang ditanda dalam
 * borang — baris ditambah untuk yang baharu ditanda, dipadam untuk yang
 * dinyahtanda. Checkbox tidak ditanda TIDAK PERNAH menulis baris "tidak
 * hadir"; ia hanya memastikan baris itu tiada.
 */
export async function saveAttendance(sessionId: string, presentMadUIds: string[]): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('sekolah_usrah_attendance')
    .select('mad_u_id')
    .eq('session_id', sessionId);
  if (existingError) throw existingError;

  const existingIds = new Set(((existing as { mad_u_id: string }[] | null) ?? []).map((row) => row.mad_u_id));
  const nextIds = new Set(presentMadUIds);

  const toInsert = [...nextIds].filter((id) => !existingIds.has(id));
  const toDelete = [...existingIds].filter((id) => !nextIds.has(id));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('sekolah_usrah_attendance')
      .insert(toInsert.map((mad_u_id) => ({ session_id: sessionId, mad_u_id })));
    if (error) throw error;
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('sekolah_usrah_attendance')
      .delete()
      .eq('session_id', sessionId)
      .in('mad_u_id', toDelete);
    if (error) throw error;
  }
}

// =============================================================================
// Eksport (admin/perkaderan-groups.tsx)
// =============================================================================

export async function fetchPerkaderanExport(groupId: string | null): Promise<PerkaderanExport> {
  const { data, error } = await supabase.rpc('perkaderan_export', { p_group_id: groupId });
  if (error) throw error;
  return (data as PerkaderanExport | null) ?? { ringkasan_sesi: [], kehadiran_terperinci: [] };
}
