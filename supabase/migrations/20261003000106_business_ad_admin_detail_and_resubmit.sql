-- =============================================================================
-- mysaf-off — Rombak alir kerja Iklan Perniagaan Ahli (fasa 2)
--
-- Dua RPC baharu susulan permintaan:
--   1. Admin hub kini senarai ringkas (baris padat, sama corak Program Usrah)
--      + skrin detail BERASINGAN (admin/iklan-detail.tsx) — perlukan cara
--      admin membaca SATU iklan mana-mana status (bukan hanya aktif/milik
--      sendiri seperti get_business_ad() sedia ada untuk ahli biasa).
--   2. Iklan yang DITOLAK kini boleh disunting & dihantar semula oleh pemilik
--      (iklan DILULUSKAN tidak boleh disunting terus — kekal, bukan "edit
--      senyap" pada iklan yang sedang berjalan). Baris sedia ada dikemaskini
--      (bukan row baharu) supaya sejarah/ID kekal sama; status kembali ke
--      'menunggu' dan disemak semula sepenuhnya oleh queue/had sama seperti
--      penghantaran baharu.
-- =============================================================================

-- 1. Bacaan SATU iklan untuk admin — mana-mana status, mana-mana pemilik.
create or replace function public.get_business_ad_admin(p_ad_id uuid)
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
  where a.id = p_ad_id and public.can_view_business_ads_admin();
$$;

revoke all on function public.get_business_ad_admin(uuid) from public, anon;
grant execute on function public.get_business_ad_admin(uuid) to authenticated;


-- 2. Sunting & hantar semula iklan DITOLAK — salinan hampir tepat
--    submit_business_ad() (sama pengesahan/had queue) tetapi UPDATE baris
--    sedia ada dan disekat kepada status 'ditolak' + pemilik sendiri.
create or replace function public.resubmit_business_ad(
  p_ad_id       uuid,
  p_nama_bisnes text,
  p_url_poster  text,
  p_penerangan  text,
  p_teks_cta    text,
  p_no_whatsapp text
)
returns public.member_business_ads
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_queue    constant integer := 20;
  c_max_per_ahli constant integer := 3;
  me             uuid := public.my_member_id();
  wa             text := regexp_replace(coalesce(p_no_whatsapp, ''), '[^0-9]', '', 'g');
  mine           integer;
  ad             public.member_business_ads;
  result         public.member_business_ads;
begin
  if auth.uid() is null or me is null then
    raise exception 'Hanya ahli log masuk boleh menghantar iklan.' using errcode = '42501';
  end if;
  if public.account_suspended(auth.uid()) or public.temp_password_pending(auth.uid()) then
    raise exception 'Akaun anda tidak dibenarkan menghantar iklan.' using errcode = '42501';
  end if;

  select * into ad from public.member_business_ads where id = p_ad_id for update;
  if not found or ad.member_id <> me then
    raise exception 'Iklan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if ad.status <> 'ditolak' then
    raise exception 'Hanya iklan yang ditolak boleh disunting semula.' using errcode = 'P0001';
  end if;

  if wa ~ '^0[0-9]+$' then
    wa := '6' || wa;
  end if;
  if wa !~ '^[0-9]{9,15}$' then
    raise exception 'Nombor WhatsApp tidak sah.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nama_bisnes, ''))) not between 2 and 80 then
    raise exception 'Nama bisnes mesti 2 hingga 80 aksara.' using errcode = '22023';
  end if;
  if p_penerangan is not null and char_length(p_penerangan) > 1000 then
    raise exception 'Penerangan terlalu panjang (maksimum 1000 aksara).' using errcode = '22023';
  end if;
  if p_teks_cta is not null and char_length(p_teks_cta) > 40 then
    raise exception 'Teks CTA terlalu panjang (maksimum 40 aksara).' using errcode = '22023';
  end if;
  if coalesce(p_url_poster, '') !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Poster tidak sah — muat naik poster melalui aplikasi.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('member_business_ads_queue'));
  perform public.expire_business_ads();

  if public.business_ads_queue_used() >= c_max_queue then
    raise exception 'Queue iklan penuh (% slot). Sila cuba lagi apabila ada iklan tamat atau selesai disemak.', c_max_queue
      using errcode = 'P0001';
  end if;

  -- `id <> p_ad_id` — baris ini sendiri belum dikira (masih 'ditolak') tetapi
  -- akan bertukar 'menunggu' selepas UPDATE, jadi semak had TANPA ia dahulu.
  select count(*) into mine from public.member_business_ads
   where member_id = me and id <> p_ad_id
     and (status = 'menunggu' or (status = 'diluluskan' and tarikh_tamat >= now()));
  if mine >= c_max_per_ahli then
    raise exception 'Anda sudah ada % iklan menunggu/aktif (had setiap ahli).', c_max_per_ahli
      using errcode = 'P0001';
  end if;

  update public.member_business_ads
     set nama_bisnes  = btrim(p_nama_bisnes),
         url_poster   = p_url_poster,
         penerangan   = nullif(btrim(p_penerangan), ''),
         teks_cta     = nullif(btrim(p_teks_cta), ''),
         no_whatsapp  = wa,
         status       = 'menunggu',
         sebab_tolak  = null,
         submitted_at = now(),
         reviewed_by  = null,
         reviewed_at  = null
   where id = p_ad_id
   returning * into result;

  return result;
end;
$$;

revoke all on function public.resubmit_business_ad(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_business_ad(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
