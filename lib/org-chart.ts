import { supabase } from './supabase';

/**
 * Carta Organisasi — lihat `20260915000029_org_chart.sql`.
 *
 * Bacaan melalui `list_org_chart()` supaya ahli biasa mendapat nama dan avatar
 * pemegang jawatan tanpa RLS `members` dilonggarkan. Tulisan terus ke table
 * `org_positions` (atau RPC `security invoker`) — RLS menolaknya bagi sesiapa
 * yang bukan admin SETIAUSAHA (can_edit) atau Super Admin.
 */

/**
 * Department pemilik modul. BUKAN `SETIAUSAHA_DEPARTMENT` ('JABATAN
 * SETIAUSAHA') dalam `department-access.ts` — dua department berasingan.
 */
export const ORG_CHART_DEPARTMENT = 'SETIAUSAHA';

export type OrgPosition = {
  id: string;
  bahagian: string;
  jawatan: string;
  display_order: number;
  /** NULL = jawatan kosong. */
  member_id: string | null;
  full_name: string | null;
  generasi: string | null;
  avatar_url: string | null;
};

export type OrgSection = { bahagian: string; positions: OrgPosition[] };

export type OrgMemberOption = {
  id: string;
  full_name: string;
  generasi: string | null;
  avatar_url: string | null;
};

export async function fetchOrgChart(): Promise<OrgPosition[]> {
  const { data, error } = await supabase.rpc('list_org_chart');
  if (error) throw error;
  return (data ?? []) as OrgPosition[];
}

export async function fetchOrgMemberOptions(): Promise<OrgMemberOption[]> {
  const { data, error } = await supabase.rpc('org_chart_member_options');
  if (error) throw error;
  return (data ?? []) as OrgMemberOption[];
}

/**
 * Kumpul baris mengikut bahagian. Baris sudah tersusun mengikut
 * `display_order`, jadi bahagian muncul mengikut jawatan pertamanya.
 */
export function groupOrgChart(rows: OrgPosition[]): OrgSection[] {
  const sections: OrgSection[] = [];
  const byName = new Map<string, OrgSection>();

  [...rows]
    .sort((a, b) => a.display_order - b.display_order)
    .forEach((row) => {
      let section = byName.get(row.bahagian);
      if (!section) {
        section = { bahagian: row.bahagian, positions: [] };
        byName.set(row.bahagian, section);
        sections.push(section);
      }
      section.positions.push(row);
    });

  return sections;
}

/** Jujukan id penuh bagi `org_chart_reorder()`. */
export function flattenOrgChart(sections: OrgSection[]): string[] {
  return sections.flatMap((section) => section.positions.map((position) => position.id));
}

/** Jawatan baharu diletakkan di hujung bahagiannya; bahagian baharu di hujung carta. */
export async function addOrgPosition(bahagian: string, jawatan: string, memberId: string | null): Promise<void> {
  const { error } = await supabase.rpc('org_chart_add_position', {
    p_bahagian: bahagian,
    p_jawatan: jawatan,
    p_member_id: memberId,
  });
  if (error) throw error;
}

/**
 * `.select('id')` supaya kemas kini yang ditapis RLS (0 baris) dilaporkan
 * sebagai ralat dan bukan kejayaan senyap.
 */
export async function setOrgPositionMember(id: string, memberId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('org_positions')
    .update({ member_id: memberId })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Anda tiada kebenaran menyunting carta organisasi.');
}

export async function deleteOrgPosition(id: string): Promise<void> {
  const { data, error } = await supabase.from('org_positions').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Jawatan tidak dapat dipadam.');
}

export async function deleteOrgSection(bahagian: string): Promise<void> {
  const { data, error } = await supabase.from('org_positions').delete().eq('bahagian', bahagian).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Bahagian tidak dapat dipadam.');
}

export async function reorderOrgChart(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('org_chart_reorder', { p_ids: ids });
  if (error) throw error;
}

/** Tukar kedudukan dua elemen bersebelahan; tatasusunan asal tidak diubah. */
export function swapAt<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

/**
 * Nama jawatan PERTAMA seorang ahli dalam carta (urutan carta: `display_order`,
 * kemudian `created_at`), atau `null` bila ahli itu tiada rekod.
 *
 * Format "{jawatan} - {bahagian}", dengan akhiran kurungan pada
 * bahagian dibuang: jawatan "Rais" + bahagian "Lajnah Kebajikan (LK)" ->
 * "Rais - Lajnah Kebajikan". Selari dengan `list_members_directory().jawatan`
 * (SQL) — ubah kedua-duanya bersama.
 */
export function jawatanForMember(rows: OrgPosition[], memberId: string): string | null {
  const first = [...rows]
    .sort((a, b) => a.display_order - b.display_order)
    .find((row) => row.member_id === memberId);
  if (!first) return null;

  const jawatan = first.jawatan.trim();
  const bahagian = first.bahagian.replace(/\s*\([^)]*\)/g, '').trim();
  if (!jawatan) return null;
  // Jangan gandakan bila jawatan sudah menyebut bahagian.
  if (!bahagian || jawatan.toLowerCase().includes(bahagian.toLowerCase())) return jawatan;
  return jawatan + ' - ' + bahagian;
}
