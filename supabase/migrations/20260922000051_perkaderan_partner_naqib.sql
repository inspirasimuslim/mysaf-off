-- =============================================================================
-- mysaf-off — Partner Naqib untuk Usrah Sekolah
--
-- Jalankan SELEPAS 20260922000050_sekolah_usrah.sql. Idempotent.
--
-- Kolum tambahan sahaja pada dua table SEDIA ADA — RLS tidak berubah (policy
-- sudah menyemak baris melalui `group_id`/`naqib_member_id`, bukan senarai
-- kolum tertentu).
--
-- `default_partner_naqib_member_id` pada kumpulan ialah CADANGAN sahaja
-- (pra-isi borang sesi baharu); setiap sesi menyimpan pilihannya SENDIRI
-- (`partner_naqib_member_id`) supaya menukar partner untuk SATU sesi tidak
-- menjejaskan sesi lain atau default kumpulan.
-- =============================================================================

alter table public.sekolah_usrah_groups
  add column if not exists default_partner_naqib_member_id uuid references public.members (id) on delete set null;

alter table public.sekolah_usrah_sessions
  add column if not exists partner_naqib_member_id uuid references public.members (id) on delete set null,
  add column if not exists partner_naqib_hadir boolean not null default true;


-- =============================================================================
-- perkaderan_export() — tambah "Partner Naqib" + "Partner Hadir" pada
-- helaian Ringkasan Sesi. `create or replace` menggantikan versi
-- `20260922000050_sekolah_usrah.sql` sepenuhnya.
-- =============================================================================

create or replace function public.perkaderan_export(p_group_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Eksport ini hanya untuk admin LAJNAH PERKADERAN.' using errcode = 'PK001';
  end if;

  with relevant_groups as (
    select g.id, g.group_name, g.sekolah, m.full_name as naqib_name
    from public.sekolah_usrah_groups g
    join public.members m on m.id = g.naqib_member_id
    where p_group_id is null or g.id = p_group_id
  ),
  session_summary as (
    select
      rg.group_name,
      rg.naqib_name,
      rg.sekolah,
      s.id as session_id,
      s.session_date,
      s.location_text,
      s.topik,
      pm.full_name as partner_naqib_name,
      s.partner_naqib_hadir,
      (select count(*) from public.sekolah_usrah_attendance a where a.session_id = s.id) as bilangan_hadir
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
    left join public.members pm on pm.id = s.partner_naqib_member_id
  ),
  -- Mad'u relevan bagi setiap sesi: AKTIF sekarang, PLUS mana-mana mad'u yang
  -- sudah dibuang tetapi ada rekod hadir sejarah pada sesi itu — sejarah tidak
  -- pernah hilang daripada laporan walaupun mad'u itu sudah tiada dalam senarai.
  relevant_mad_u as (
    select s.id as session_id, mu.id as mad_u_id, mu.nama, mu.tingkatan
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
    join public.sekolah_usrah_mad_u mu on mu.group_id = s.group_id and mu.is_active = true
    union
    select a.session_id, mu.id, mu.nama, mu.tingkatan
    from public.sekolah_usrah_attendance a
    join public.sekolah_usrah_mad_u mu on mu.id = a.mad_u_id
    join public.sekolah_usrah_sessions s on s.id = a.session_id
    join relevant_groups rg on rg.id = s.group_id
  ),
  detail as (
    select
      ss.group_name,
      rm.nama,
      rm.tingkatan,
      ss.session_date,
      exists (
        select 1 from public.sekolah_usrah_attendance a
        where a.session_id = rm.session_id and a.mad_u_id = rm.mad_u_id
      ) as hadir
    from relevant_mad_u rm
    join session_summary ss on ss.session_id = rm.session_id
  )
  select jsonb_build_object(
    'ringkasan_sesi', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'naqib', naqib_name,
          'sekolah', sekolah,
          'tarikh', session_date,
          'lokasi', location_text,
          'topik', topik,
          'bilangan_hadir', bilangan_hadir,
          'partner_naqib', partner_naqib_name,
          'partner_hadir', case when partner_naqib_name is null then null else partner_naqib_hadir end
        ) order by group_name, session_date
      ), '[]'::jsonb)
      from session_summary
    ),
    'kehadiran_terperinci', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'nama_mad_u', nama,
          'tingkatan', tingkatan,
          'tarikh_sesi', session_date,
          'hadir', hadir
        ) order by group_name, session_date, nama
      ), '[]'::jsonb)
      from detail
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.perkaderan_export(uuid) from public, anon;
grant execute on function public.perkaderan_export(uuid) to authenticated;

notify pgrst, 'reload schema';
