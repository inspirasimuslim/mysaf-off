-- =============================================================================
-- mysaf-off — Tab Keluarga + Jawatan Rasmi
--
-- Jalankan SELEPAS 20260929000086_keluarga_jawatan_backup.sql.
--   1. Buang `members.nama_anak` (+ `list_mbm_couples()` ditulis semula tanpanya).
--   2. `members.jawatan_rasmi` (teks, nullable) — HANYA admin department
--      SETIAUSAHA (can_edit) dan Super Admin boleh ubah, melalui
--      `set_jawatan_rasmi()`; trigger menolak perubahan langsung oleh sesiapa
--      lain (termasuk ahli sendiri dan admin JABATAN DATA & SUMBER MANUSIA).
--      Department SETIAUSAHA ialah pemilik carta organisasi — BUKAN
--      JABATAN SETIAUSAHA atau TIMBALAN SETIAUSAHA.
--   3. `list_members_directory()` +jawatan_rasmi (drop+create, OUT berubah).
--   4. `members.cenderung_baitul_muslim` (boolean nullable) — soalan hanya
--      untuk ahli bujang berumur > 22 tahun; syarat umur dikawal UI (tarikh
--      lahir diterbitkan daripada NRIC, bukan kolum).
-- =============================================================================


-- =============================================================================
-- 1. nama_anak
-- =============================================================================

drop function if exists public.list_mbm_couples();

create function public.list_mbm_couples()
returns table (
  nama_suami      text,
  generasi_suami  text,
  nama_isteri     text,
  generasi_isteri text,
  tahun_berkahwin text,
  bil_anak        int
)
language sql
stable
security definer
set search_path = public
as $$
  with pasangan as (
    select
      a.full_name as nama_a, a.generasi as generasi_a, a.jantina as jantina_a,
      a.tahun_berkahwin as tahun_a, a.bil_anak as anak_a,
      b.full_name as nama_b, b.generasi as generasi_b, b.jantina as jantina_b,
      b.tahun_berkahwin as tahun_b, b.bil_anak as anak_b
    from public.members a
    join public.members b
      on b.id = a.spouse_member_id
     and a.id = b.spouse_member_id
    where a.id < b.id
  )
  select
    case when jantina_a = 'Muslimin' then nama_a
         when jantina_b = 'Muslimin' then nama_b
         else nama_a end as nama_suami,
    case when jantina_a = 'Muslimin' then generasi_a
         when jantina_b = 'Muslimin' then generasi_b
         else generasi_a end as generasi_suami,
    case when jantina_a = 'Muslimat' then nama_a
         when jantina_b = 'Muslimat' then nama_b
         else nama_b end as nama_isteri,
    case when jantina_a = 'Muslimat' then generasi_a
         when jantina_b = 'Muslimat' then generasi_b
         else generasi_b end as generasi_isteri,
    coalesce(nullif(trim(tahun_a), ''), nullif(trim(tahun_b), '')) as tahun_berkahwin,
    coalesce(anak_a, anak_b) as bil_anak
  from pasangan
  where public.can_read_shared()
  order by generasi_suami nulls last, nama_suami;
$$;

revoke all on function public.list_mbm_couples() from public, anon;
grant execute on function public.list_mbm_couples() to authenticated;

alter table public.members drop column if exists nama_anak;


-- =============================================================================
-- 2. Kolum baharu
-- =============================================================================

alter table public.members
  add column if not exists jawatan_rasmi text,
  add column if not exists cenderung_baitul_muslim boolean;


-- =============================================================================
-- 3. Kebenaran + penjaga jawatan_rasmi
-- =============================================================================

create or replace function public.can_edit_jawatan_rasmi(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('SETIAUSAHA', true, uid);
$$;

revoke all on function public.can_edit_jawatan_rasmi(uuid) from public, anon;
grant execute on function public.can_edit_jawatan_rasmi(uuid) to authenticated;

-- Trigger berasingan daripada guard_member_admin_columns: fungsi itu
-- MEMBENARKAN semua perubahan oleh can_edit_members, sedangkan jawatan_rasmi
-- mesti dikecualikan daripada admin JABATAN DATA juga.
create or replace function public.guard_jawatan_rasmi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
begin
  -- Laluan pentadbir pangkalan data (SQL Editor / psql) atau service_role.
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  if new.jawatan_rasmi is distinct from old.jawatan_rasmi
     and not public.can_edit_jawatan_rasmi(auth.uid()) then
    raise exception 'Jawatan rasmi hanya boleh diubah oleh admin Setiausaha.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists members_guard_jawatan_rasmi on public.members;
create trigger members_guard_jawatan_rasmi
  before update on public.members
  for each row execute function public.guard_jawatan_rasmi();

-- Admin SETIAUSAHA belum tentu ada kebenaran UPDATE pada `members` (RLS), jadi
-- penulisan melalui RPC ini. Kebenaran disemak DI SINI; trigger di atas ialah
-- lapisan kedua untuk laluan langsung.
create or replace function public.set_jawatan_rasmi(p_member_id uuid, p_jawatan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_edit_jawatan_rasmi(auth.uid()), false) then
    raise exception 'Jawatan rasmi hanya boleh diubah oleh admin Setiausaha.'
      using errcode = '42501';
  end if;

  update public.members
  set jawatan_rasmi = nullif(btrim(p_jawatan), '')
  where id = p_member_id;

  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_jawatan_rasmi(uuid, text) from public, anon;
grant execute on function public.set_jawatan_rasmi(uuid, text) to authenticated;


-- =============================================================================
-- 4. list_members_directory() +jawatan_rasmi
-- =============================================================================

drop function if exists public.list_members_directory();

create function public.list_members_directory()
returns table (
  nombor_ahli        text,
  full_name          text,
  generasi           text,
  email              text,
  no_tel             text,
  avatar_url         text,
  status_pekerjaan   text,
  status_perkahwinan text,
  jawatan_rasmi      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    m.email,
    m.no_tel,
    m.avatar_url,
    m.status_pekerjaan,
    m.status_perkahwinan,
    m.jawatan_rasmi
  from public.members m
  where public.can_read_shared()
  order by m.generasi, m.full_name;
$$;

revoke all on function public.list_members_directory() from public, anon;
grant execute on function public.list_members_directory() to authenticated;

notify pgrst, 'reload schema';
