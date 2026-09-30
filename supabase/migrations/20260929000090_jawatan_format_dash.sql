-- =============================================================================
-- mysaf-off — Format jawatan direktori: "{jawatan} - {bahagian}"
--
-- Jalankan SELEPAS 20260929000089_jawatan_dari_carta.sql. Hanya format string
-- berubah (gabung terus -> dash dengan ruang); bentuk output
-- `list_members_directory()` TIDAK berubah, jadi `create or replace` sah dan
-- tiada snapshot dijana. Logik lain kekal: akhiran kurungan pada bahagian
-- dibuang ("Lajnah Kebajikan (LK)" -> "Lajnah Kebajikan"), dan bahagian tidak
-- digandakan jika jawatan sudah menyebutnya. Selari dengan `jawatanForMember()`
-- dalam `lib/org-chart.ts` — ubah kedua-duanya bersama.
-- =============================================================================

create or replace function public.list_members_directory()
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
    select
      case
        when position(lower(x.bahagian) in lower(x.jawatan)) > 0 then x.jawatan
        else x.jawatan || ' - ' || x.bahagian
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
