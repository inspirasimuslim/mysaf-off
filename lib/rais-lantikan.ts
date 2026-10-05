import { supabase } from './supabase';
import { KAWASAN_USRAH_OPTIONS } from '@/types/database';

/**
 * Rais/Raisah Generasi dan Rais/Raisah Usrah Kawasan.
 *
 * Slot tetap dalam `rais_lantikan` (satu baris setiap generasi/kawasan +
 * peranan); hanya pemegangnya berubah. Bacaan terbuka kepada semua ahli
 * (`list_rais_lantikan()`), tulis terhad kepada department JABATAN
 * SETIAUSAHA melalui `set_rais_lantikan()` -- lihat
 * `20261005000133_rais_lantikan.sql`.
 */
export type RaisLantikan = {
  id: string;
  jenis: 'generasi' | 'kawasan';
  kod: string;
  peranan: 'rais' | 'raisah';
  member_id: string | null;
  full_name: string | null;
  generasi: string | null;
  avatar_url: string | null;
};

export type RaisMemberOption = {
  id: string;
  full_name: string;
  generasi: string | null;
  avatar_url: string | null;
  jantina: string | null;
  kawasan_usrah: string | null;
};

export type RaisGroup = { kod: string; rows: RaisLantikan[] };

export async function fetchRaisLantikan(): Promise<RaisLantikan[]> {
  const { data, error } = await supabase.rpc('list_rais_lantikan');
  if (error) throw error;
  return (data ?? []) as RaisLantikan[];
}

export async function fetchRaisMemberOptions(): Promise<RaisMemberOption[]> {
  const { data, error } = await supabase.rpc('rais_member_options');
  if (error) throw error;
  return (data ?? []) as RaisMemberOption[];
}

export async function setRaisLantikan(id: string, memberId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_rais_lantikan', { p_id: id, p_member_id: memberId });
  if (error) throw error;
}

/** Kumpul mengikut kod (generasi atau kawasan) dengan mengekalkan susunan pelayan. */
export function groupRais(rows: RaisLantikan[], jenis: RaisLantikan['jenis']): RaisGroup[] {
  const groups: RaisGroup[] = [];
  for (const row of rows) {
    if (row.jenis !== jenis) continue;
    const last = groups[groups.length - 1];
    if (last && last.kod === row.kod) last.rows.push(row);
    else groups.push({ kod: row.kod, rows: [row] });
  }
  return groups;
}

export function perananLabel(peranan: RaisLantikan['peranan']): string {
  return peranan === 'rais' ? 'Rais' : 'Raisah';
}

/** 'ULK' -> 'Usrah Lembah Klang (ULK)'; label yang sudah bermaksud kod ('UP') tidak digandakan. */
export function kawasanHeading(code: string): string {
  const option = KAWASAN_USRAH_OPTIONS.find((row) => row.value === code);
  if (!option) return code;
  return option.label.endsWith('(' + code + ')') ? option.label : option.label + ' (' + code + ')';
}

export function raisGroupHeading(jenis: RaisLantikan['jenis'], kod: string): string {
  return jenis === 'generasi' ? 'Generasi ' + kod : kawasanHeading(kod);
}
