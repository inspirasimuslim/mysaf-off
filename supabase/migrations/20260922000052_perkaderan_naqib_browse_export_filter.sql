-- =============================================================================
-- mysaf-off — Navigasi 3-peringkat admin (Naqib -> Sesi -> Butiran) + tapisan
-- Bulan/Tahun pada eksport Usrah Sekolah
--
-- Jalankan SELEPAS 20260922000051_perkaderan_partner_naqib.sql. Idempotent.
-- =============================================================================


-- =============================================================================
-- 1. perkaderan_export() — tambah p_month/p_year (null = semua)
--
-- Parameter TAMBAHAN pada penghujung menukar tandatangan fungsi (1 argumen ->
-- 3 argumen), jadi `create or replace` TIDAK memadai — ia akan mencipta
-- OVERLOAD kedua yang bertindih dengan versi lama dan menyebabkan panggilan
-- 1-argumen jadi tak jelas (ambiguous). Versi lama mesti digugurkan dahulu.
-- =============================================================================

drop function if exists public.perkaderan_export(uuid);

create or replace function public.perkaderan_export(p_group_id uuid default null, p_month int default null, p_year int default null)
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
    where (p_month is null or extract(month from s.session_date) = p_month)
      and (p_year is null or extract(year from s.session_date) = p_year)
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
  -- `detail` bercantum dengan `session_summary` (bukan `sekolah_usrah_sessions`
  -- terus), jadi tapisan bulan/tahun di atas terpakai automatik di sini juga.
  detail as (
    select
      ss.group_name,
      rm.nama,
      rm.tingkatan,
      ss.session_date,
      ss.partner_naqib_name,
      ss.partner_naqib_hadir,
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
          'hadir', hadir,
          'partner_naqib', partner_naqib_name,
          'partner_hadir', case when partner_naqib_name is null then null else partner_naqib_hadir end
        ) order by group_name, session_date, nama
      ), '[]'::jsonb)
      from detail
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.perkaderan_export(uuid, int, int) from public, anon;
grant execute on function public.perkaderan_export(uuid, int, int) to authenticated;


-- =============================================================================
-- 2. perkaderan_naqib_overview() — PERINGKAT 1 admin: senarai naqib
--
-- Satu baris SETIAP naqib aktif, digabung merentasi SEMUA kumpulan yang
-- dipegangnya (naqib boleh pegang >1 kumpulan/sekolah).
-- =============================================================================

create or replace function public.perkaderan_naqib_overview()
returns table (
  member_id     uuid,
  full_name     text,
  generasi      text,
  sekolah_list  text,
  group_count   bigint,
  session_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.full_name,
    m.generasi,
    coalesce(string_agg(distinct g.sekolah, ', ' order by g.sekolah), 'Tiada kumpulan'),
    count(distinct g.id),
    count(s.id)
  from public.perkaderan_naqib_assignments a
  join public.members m on m.id = a.member_id
  left join public.sekolah_usrah_groups g on g.naqib_member_id = m.id
  left join public.sekolah_usrah_sessions s on s.group_id = g.id
  where a.is_active = true
    and (public.is_super_admin() or public.can_view_perkaderan())
  group by m.id, m.full_name, m.generasi
  order by m.full_name;
$$;

revoke all on function public.perkaderan_naqib_overview() from public, anon;
grant execute on function public.perkaderan_naqib_overview() to authenticated;


-- =============================================================================
-- 3. perkaderan_naqib_sessions(p_naqib_member_id) — PERINGKAT 2 admin: sesi
-- SEMUA kumpulan naqib tu, tersusun terkini dahulu.
-- =============================================================================

create or replace function public.perkaderan_naqib_sessions(p_naqib_member_id uuid)
returns table (
  session_id    uuid,
  group_id      uuid,
  session_date  date,
  location_text text,
  sekolah       text,
  group_name    text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.group_id, s.session_date, s.location_text, g.sekolah, g.group_name
  from public.sekolah_usrah_sessions s
  join public.sekolah_usrah_groups g on g.id = s.group_id
  where g.naqib_member_id = p_naqib_member_id
    and (public.is_super_admin() or public.can_view_perkaderan())
  order by s.session_date desc;
$$;

revoke all on function public.perkaderan_naqib_sessions(uuid) from public, anon;
grant execute on function public.perkaderan_naqib_sessions(uuid) to authenticated;


-- =============================================================================
-- 4. perkaderan_groups_summary() digantikan sepenuhnya oleh
-- perkaderan_naqib_overview() (skrin admin/perkaderan-groups.tsx kini
-- menyenaraikan NAQIB, bukan kumpulan) — gugurkan supaya tiada RPC lapuk
-- tak terpakai tertinggal.
-- =============================================================================

drop function if exists public.perkaderan_groups_summary();

notify pgrst, 'reload schema';
