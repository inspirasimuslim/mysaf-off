-- =============================================================================
-- mysaf-off — Eksport ahli: sheet Pendidikan/Perniagaan + eksport Kesihatan
-- berasingan (BELUM di-push)
--
-- Tiga fungsi BAHARU sahaja; tiada data/kolum disentuh, tiada snapshot.
--
--   * members_export_pendidikan()  — satu baris setiap `member_education`
--   * members_export_perniagaan()  — satu baris setiap `member_businesses`
--     Kedua-duanya: `can_view_members()` (sama `members_full_export()`).
--
--   * members_export_kesihatan()   — satu baris setiap `member_health_issues`
--     DATA SENSITIF. Sengaja TIDAK guna `can_view_members()` (JABATAN DATA
--     tidak boleh) dan TIDAK guna `can_view_health(member_id)` (klausa
--     "pemilik sendiri" akan membenarkan mana-mana ahli memanggil eksport
--     pukal). Hanya admin LAJNAH KEBAJIKAN (can_view) + Super Admin
--     (dirangkumi has_department_access). Tidak masuk `members_full_export()`.
--
-- Pekerjaan/Keluarga/Komitmen tidak perlukan RPC baharu — semua medannya sudah
-- ada dalam `members_full_export()` (migration 093), sheet dibina di klien.
-- =============================================================================

create or replace function public.members_export_pendidikan()
returns table (
  nombor_ahli      text,
  full_name        text,
  generasi         text,
  peringkat        text,
  jurusan          text,
  institusi        text,
  status_pengajian text,
  sumber_pembiayaan text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport data ahli memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select m.nombor_ahli, m.full_name, m.generasi,
         e.peringkat, e.jurusan, e.institusi, e.status_pengajian, e.sumber_pembiayaan
  from public.member_education e
  join public.members m on m.id = e.member_id
  order by m.nombor_ahli nulls last, m.full_name, e.created_at;
end;
$$;

create or replace function public.members_export_perniagaan()
returns table (
  nombor_ahli               text,
  full_name                 text,
  generasi                  text,
  mode                      text,
  sub_kategori              text[],
  nama_perniagaan           text,
  negeri_operasi            text,
  anggaran_pendapatan_range text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport data ahli memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select m.nombor_ahli, m.full_name, m.generasi,
         b.mode, b.sub_kategori, b.nama_perniagaan, b.negeri_operasi, b.anggaran_pendapatan_range
  from public.member_businesses b
  join public.members m on m.id = b.member_id
  order by m.nombor_ahli nulls last, m.full_name, b.created_at;
end;
$$;

create or replace function public.members_export_kesihatan()
returns table (
  nombor_ahli            text,
  full_name              text,
  generasi               text,
  jenis_masalah          text,
  nama_penyakit          text,
  ada_temujanji_hospital boolean,
  keterangan_lain        text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.has_department_access('LAJNAH KEBAJIKAN', false), false) then
    raise exception 'Eksport data kesihatan hanya untuk admin LAJNAH KEBAJIKAN dan Super Admin.'
      using errcode = 'MS001';
  end if;

  return query
  select m.nombor_ahli, m.full_name, m.generasi,
         h.jenis_masalah, h.nama_penyakit, h.ada_temujanji_hospital, h.keterangan_lain
  from public.member_health_issues h
  join public.members m on m.id = h.member_id
  order by m.nombor_ahli nulls last, m.full_name, h.created_at;
end;
$$;

revoke all on function public.members_export_pendidikan() from public, anon;
revoke all on function public.members_export_perniagaan() from public, anon;
revoke all on function public.members_export_kesihatan() from public, anon;
grant execute on function public.members_export_pendidikan() to authenticated;
grant execute on function public.members_export_perniagaan() to authenticated;
grant execute on function public.members_export_kesihatan() to authenticated;

notify pgrst, 'reload schema';
