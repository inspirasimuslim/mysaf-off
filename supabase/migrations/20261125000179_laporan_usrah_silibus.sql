-- Laporan usrah: silibus, jenis sesi, refleksi, jenis tamrin, naqib setaraf  (2026-11-25)
--  * perkaderan_silibus : senarai Fikrah setiap tingkatan, diurus admin Lajnah (tiada data awal — admin isi senarai rasmi).
--  * sekolah_usrah_sessions : jenis (fikrah/bonding), silibus_ids (boleh >1 bila dua silibus digabung sebulan), refleksi.
--  * perkaderan_tamrin : jenis (TAQ, Tampenor, QTC, Kuiz 3K, Tamrin 3K) + tingkatan.
--  * Naqib SETARAF: partner kumpulan (default_partner_naqib_member_id) turut dapat melihat/merekod sesi, mad'u dan kehadiran
--    kumpulan itu. Mengubah/memadam KUMPULAN itu sendiri kekal untuk naqib utama + admin.
create table if not exists public.perkaderan_silibus (
  id         uuid primary key default gen_random_uuid(),
  tingkatan  text not null check (tingkatan in ('Tingkatan 3','Tingkatan 4','Tingkatan 5')),
  urutan     integer not null check (urutan between 1 and 30),
  tajuk      text not null check (char_length(tajuk) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (tingkatan, urutan)
);
alter table public.perkaderan_silibus enable row level security;
drop policy if exists perkaderan_silibus_select on public.perkaderan_silibus;
create policy perkaderan_silibus_select on public.perkaderan_silibus for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_active_naqib());
drop policy if exists perkaderan_silibus_write on public.perkaderan_silibus;
create policy perkaderan_silibus_write on public.perkaderan_silibus for all to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan())
  with check (public.is_super_admin() or public.can_edit_perkaderan());
revoke all on public.perkaderan_silibus from anon;
revoke truncate, references, trigger on public.perkaderan_silibus from authenticated;

alter table public.sekolah_usrah_sessions
  add column if not exists jenis text not null default 'fikrah' check (jenis in ('fikrah','bonding')),
  add column if not exists silibus_ids uuid[] not null default '{}',
  add column if not exists refleksi text check (refleksi is null or char_length(refleksi) <= 2000);

alter table public.perkaderan_tamrin
  add column if not exists jenis text not null default 'lain' check (jenis in ('taq','tampenor','qtc','kuiz_3k','tamrin_3k','lain')),
  add column if not exists tingkatan text check (tingkatan is null or tingkatan in ('Tingkatan 3','Tingkatan 4','Tingkatan 5'));

-- Naqib setaraf
create or replace function public.is_own_naqib_group(p_group_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_naqib(uid) and exists (
    select 1 from public.sekolah_usrah_groups g
    where g.id = p_group_id
      and public.my_member_id(uid) in (g.naqib_member_id, g.default_partner_naqib_member_id)
  );
$$;

drop policy if exists sekolah_usrah_groups_select on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_select on public.sekolah_usrah_groups for select to authenticated
  using (
    public.is_super_admin()
    or public.can_view_perkaderan()
    or (public.is_active_naqib() and (
         naqib_member_id = public.my_member_id() or default_partner_naqib_member_id = public.my_member_id()))
  );
