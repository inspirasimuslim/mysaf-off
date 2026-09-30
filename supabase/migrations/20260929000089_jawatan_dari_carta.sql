-- =============================================================================
-- mysaf-off — Jawatan dipaparkan automatik daripada carta organisasi
--
-- Jalankan SELEPAS 20260929000088_jawatan_revert_backup.sql.
-- Reka bentuk `jawatan_rasmi` (087) salah faham: jawatan sepatutnya diambil
-- AUTOMATIK daripada `org_positions` (carta organisasi), bukan medan manual.
--   1. Buang trigger, RPC, fungsi kebenaran dan kolum `jawatan_rasmi`.
--   2. `list_members_directory()` memulangkan `jawatan` ("{jawatan} {bahagian}",
--      bahagian tanpa akhiran kurungan, cth "Rais Lajnah Kebajikan") — jawatan
--      PERTAMA ahli itu dalam carta (urutan carta sedia ada: display_order, kemudian
--      created_at). Ahli tanpa rekod dalam carta -> null.
-- Profil (Data Utama) membaca `list_org_chart()` sedia ada — tiada RPC baharu.
-- =============================================================================


-- =============================================================================
-- 1. Revert infrastruktur jawatan_rasmi (087)
-- =============================================================================

drop trigger if exists members_guard_jawatan_rasmi on public.members;
drop function if exists public.guard_jawatan_rasmi();
drop function if exists public.set_jawatan_rasmi(uuid, text);
drop function if exists public.can_edit_jawatan_rasmi(uuid);

alter table public.members drop column if exists jawatan_rasmi;


-- =============================================================================
-- 2. list_members_directory() — jawatan daripada org_positions
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
  jawatan            text
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
    j.jawatan
  from public.members m
  left join lateral (
    -- "{jawatan} {bahagian}" tanpa separator; akhiran dalam kurungan pada
    -- bahagian (cth "(LK)") dibuang dahulu. Jika jawatan sudah mengandungi nama
    -- bahagian, ia tidak digandakan.
    select
      case
        when position(lower(x.bahagian) in lower(x.jawatan)) > 0 then x.jawatan
        else x.jawatan || ' ' || x.bahagian
      end as jawatan
    from (
      select
        btrim(p.jawatan) as jawatan,
        btrim(regexp_replace(p.bahagian, '\s*\([^)]*\)', '', 'g')) as bahagian,
        p.display_order,
        p.created_at
      from public.org_positions p
      where p.member_id = m.id
    ) x
    order by x.display_order, x.created_at
    limit 1
  ) j on true
  where public.can_read_shared()
  order by m.generasi, m.full_name;
$$;

revoke all on function public.list_members_directory() from public, anon;
grant execute on function public.list_members_directory() to authenticated;

notify pgrst, 'reload schema';
