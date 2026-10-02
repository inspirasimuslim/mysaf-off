-- =============================================================================
-- mysaf-off — RPC list_all_business_ads_admin()
--
-- `semakan-iklan.tsx` sebelum ini HANYA memaparkan iklan 'menunggu'
-- (list_pending_business_ads), jadi admin tiada cara untuk melihat — dan
-- memadam — iklan yang sudah diluluskan/ditolak/tamat tempoh. Butang "Padam
-- Terus" yang ditambah migration 103 jadi tidak kelihatan langsung untuk
-- status selain 'menunggu'. RPC ini memulangkan SEMUA status untuk admin
-- (can_view_business_ads_admin()) supaya skrin boleh papar tab "Semua Iklan".
-- =============================================================================

create or replace function public.list_all_business_ads_admin()
returns table (
  id             uuid,
  member_id      uuid,
  nama_pemilik   text,
  no_keahlian    text,
  nama_bisnes    text,
  url_poster     text,
  penerangan     text,
  teks_cta       text,
  no_whatsapp    text,
  status_paparan text,
  sebab_tolak    text,
  submitted_at   timestamptz,
  tarikh_mula    timestamptz,
  tarikh_tamat   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, m.nombor_ahli, a.nama_bisnes, a.url_poster,
         a.penerangan, a.teks_cta, a.no_whatsapp,
         case when a.status = 'diluluskan' and a.tarikh_tamat < now()
              then 'tamat_tempoh' else a.status end,
         a.sebab_tolak, a.submitted_at, a.tarikh_mula, a.tarikh_tamat
  from public.member_business_ads a
  join public.members m on m.id = a.member_id
  where public.can_view_business_ads_admin()
  order by (a.status = 'menunggu') desc, a.submitted_at desc, a.id;
$$;

revoke all on function public.list_all_business_ads_admin() from public, anon;
grant execute on function public.list_all_business_ads_admin() to authenticated;

notify pgrst, 'reload schema';
