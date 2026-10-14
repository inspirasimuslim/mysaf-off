import { supabase } from './supabase';

/**
 * NGO Rasmi — lihat `20261014000157_ngo_rasmi.sql`.
 *
 * Bacaan terbuka kepada semua ahli log masuk; tulisan terus ke table dan hanya
 * diterima RLS bagi admin LAJNAH PEMBANGUNAN NGO (can_edit) atau Super Admin.
 */

/** Mesti sepadan dengan `can_edit_ngo()` dalam migration 157. */
export const NGO_DEPARTMENT = 'LAJNAH PEMBANGUNAN NGO';

export type Ngo = {
  id: string;
  nama: string;
  nama_penuh: string | null;
  perihal: string | null;
  tahun_penubuhan: number | null;
  display_order: number;
};

export type NgoMember = {
  id: string;
  ngo_id: string;
  jawatan: string;
  nama: string;
  generasi: string | null;
  kumpulan: string | null;
  display_order: number;
};

export type NgoInput = {
  nama: string;
  nama_penuh: string | null;
  perihal: string | null;
  tahun_penubuhan: number | null;
};

export type NgoMemberInput = {
  jawatan: string;
  nama: string;
  generasi: string | null;
  kumpulan: string | null;
};

const NGO_COLUMNS = 'id, nama, nama_penuh, perihal, tahun_penubuhan, display_order';
const MEMBER_COLUMNS = 'id, ngo_id, jawatan, nama, generasi, kumpulan, display_order';

export async function fetchNgos(): Promise<Ngo[]> {
  const { data, error } = await supabase
    .from('ngos')
    .select(NGO_COLUMNS)
    .order('display_order', { ascending: true })
    .order('nama', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ngo[];
}

export async function fetchNgo(id: string): Promise<{ ngo: Ngo | null; members: NgoMember[] }> {
  const [ngoResult, membersResult] = await Promise.all([
    supabase.from('ngos').select(NGO_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('ngo_committee')
      .select(MEMBER_COLUMNS)
      .eq('ngo_id', id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  if (ngoResult.error) throw ngoResult.error;
  if (membersResult.error) throw membersResult.error;
  return { ngo: (ngoResult.data as Ngo | null) ?? null, members: (membersResult.data ?? []) as NgoMember[] };
}

async function nextOrder(table: 'ngos' | 'ngo_committee', ngoId?: string): Promise<number> {
  let query = supabase.from(table).select('display_order').order('display_order', { ascending: false }).limit(1);
  if (table === 'ngo_committee' && ngoId) query = query.eq('ngo_id', ngoId);
  const { data, error } = await query;
  if (error) throw error;
  const top = (data?.[0] as { display_order: number } | undefined)?.display_order ?? 0;
  return top + 1;
}

export async function createNgo(input: NgoInput): Promise<string> {
  const display_order = await nextOrder('ngos');
  const { data, error } = await supabase.from('ngos').insert({ ...input, display_order }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateNgo(id: string, input: NgoInput): Promise<void> {
  const { error } = await supabase.from('ngos').update(input).eq('id', id);
  if (error) throw error;
}

/** Padam NGO beserta semua ahli jawatankuasanya (`on delete cascade`). */
export async function deleteNgo(id: string): Promise<void> {
  const { error } = await supabase.from('ngos').delete().eq('id', id);
  if (error) throw error;
}

export async function addNgoMember(ngoId: string, input: NgoMemberInput): Promise<void> {
  const display_order = await nextOrder('ngo_committee', ngoId);
  const { error } = await supabase.from('ngo_committee').insert({ ...input, ngo_id: ngoId, display_order });
  if (error) throw error;
}

export async function updateNgoMember(id: string, input: NgoMemberInput): Promise<void> {
  const { error } = await supabase.from('ngo_committee').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteNgoMember(id: string): Promise<void> {
  const { error } = await supabase.from('ngo_committee').delete().eq('id', id);
  if (error) throw error;
}

export type NgoMemberGroup = { kumpulan: string | null; members: NgoMember[] };

/** Kumpul ikut `kumpulan` mengikut susunan kemunculan pertama; jawatankuasa utama (tanpa kumpulan) dahulu. */
export function groupNgoMembers(rows: NgoMember[]): NgoMemberGroup[] {
  const groups: NgoMemberGroup[] = [];
  const byKey = new Map<string, NgoMemberGroup>();
  [...rows]
    .sort((a, b) => a.display_order - b.display_order)
    .forEach((row) => {
      const key = row.kumpulan ?? '';
      let group = byKey.get(key);
      if (!group) {
        group = { kumpulan: row.kumpulan, members: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.members.push(row);
    });
  return groups.sort((a, b) => Number(a.kumpulan !== null) - Number(b.kumpulan !== null));
}

/** Teks bebas -> null jika kosong; ruang berganda dimampatkan. */
export function cleanText(value: string): string | null {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned : null;
}
