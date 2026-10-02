-- =============================================================================
-- mysaf-off — Padam Iklan Perniagaan Ahli (RPC delete_business_ad)
--
-- Susulan kepada 20260929000099. Membenarkan DUA pihak memadam terus (tiada
-- ubah status "ditolak" sebagai ganti) — pemilik iklan sendiri (mana-mana
-- status) dan admin LAJNAH EKONOMI DAN ASET (can_review_business_ads(), sama
-- kebenaran dengan meluluskan/menolak). Fail poster di storage dipadam serentak
-- supaya tidak tertinggal objek anak yatim dalam bucket 'business-ads'.
-- Tiada snapshot — memadam baris sedia ada atas permintaan pengguna, bukan
-- ubah struktur/jenis data.
-- =============================================================================

create or replace function public.delete_business_ad(p_ad_id uuid)
returns void
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

  -- Fail poster bernama '<member_id>_<epoch>.jpg' — buang prefix URL awam
  -- untuk dapatkan nama fail sebenar dalam bucket.
  delete from storage.objects
   where bucket_id = 'business-ads'
     and name = regexp_replace(ad.url_poster, '^.*/business-ads/', '');
end;
$$;

revoke all on function public.delete_business_ad(uuid) from public, anon;
grant execute on function public.delete_business_ad(uuid) to authenticated;

notify pgrst, 'reload schema';
