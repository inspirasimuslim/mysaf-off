-- =============================================================================
-- mysaf-off — Baiki delete_business_ad(): buang DELETE terus pada
-- storage.objects (Supabase menyekat ini — "Direct deletion from storage
-- tables is not allowed. Use the Storage API instead.", ditemui semasa ujian
-- peranti sebenar selepas migration 103 live).
--
-- Fungsi kini HANYA memadam baris member_business_ads dan memulangkan
-- url_poster baris itu; klien memadam fail storage selepas itu melalui
-- Storage API (supabase.storage.from('business-ads').remove(...)), yang
-- dibenarkan oleh polisi RLS business_ads_delete sedia ada (pemilik atau
-- can_review_business_ads()). Jika pemadaman storage gagal selepas baris
-- DB berjaya dipadam, fail tertinggal sebagai objek anak yatim tidak
-- berbahaya (tiada baris merujuknya) — lebih baik daripada transaksi gagal
-- disebabkan sekatan storage.
-- =============================================================================

drop function if exists public.delete_business_ad(uuid);

create or replace function public.delete_business_ad(p_ad_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ad public.member_business_ads;
begin
  select * into ad from public.member_business_ads where id = p_ad_id for update;
  if not found then
    raise exception 'Iklan tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not (ad.member_id = public.my_member_id() or public.can_review_business_ads()) then
    raise exception 'Anda tidak dibenarkan memadam iklan ini.' using errcode = '42501';
  end if;

  delete from public.member_business_ads where id = p_ad_id;

  return ad.url_poster;
end;
$$;

revoke all on function public.delete_business_ad(uuid) from public, anon;
grant execute on function public.delete_business_ad(uuid) to authenticated;

notify pgrst, 'reload schema';
