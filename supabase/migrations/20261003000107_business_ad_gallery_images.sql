-- =============================================================================
-- mysaf-off — Galeri gambar iklan bisnes (maksimum 3 keping)
--
-- Permintaan 2026-10-03: ahli boleh muat naik SEHINGGA 3 gambar setiap iklan.
-- Gambar 1 (`url_poster`, KEKAL nama kolum sedia ada) kekal khas untuk
-- paparan dashboard/carousel/"Semua Iklan" (nisbah tetap POSTER_ASPECT_RATIO
-- 1024×550) — tiada ahli sedia ada terjejas, lajur ini wajib seperti dulu.
-- Dua kolum BAHARU `url_gambar_2`/`url_gambar_3` PILIHAN, bebas orientation
-- (tiada CHECK nisbah) — hanya dipaparkan dalam skrin detail (galeri),
-- TIDAK PERNAH pada dashboard/carousel/kad ringkas. Tiada data sedia ada
-- disentuh (kolum baharu nullable), jadi tiada snapshot dijana.
--
-- Nama fail storage kekal corak sedia ada `<member_id>_<epoch ms>.jpg`
-- (storage_name_ok() sudah generik, tidak kira kedudukan gambar) — muat naik
-- 3 kali hanya menghasilkan 3 epoch berlainan, tiada migration storage
-- diperlukan.
-- =============================================================================

alter table public.member_business_ads
  add column if not exists url_gambar_2 text,
  add column if not exists url_gambar_3 text;

comment on column public.member_business_ads.url_poster is
  'Gambar 1 — WAJIB, khas untuk paparan dashboard/carousel/"Semua Iklan" (nisbah tetap POSTER_ASPECT_RATIO).';
comment on column public.member_business_ads.url_gambar_2 is
  'Gambar 2 — PILIHAN, bebas orientation, hanya dipaparkan dalam galeri skrin detail.';
comment on column public.member_business_ads.url_gambar_3 is
  'Gambar 3 — PILIHAN, bebas orientation, hanya dipaparkan dalam galeri skrin detail.';


-- =============================================================================
-- 1. submit_business_ad() — +2 parameter pilihan. PENTING: `create or
--    replace` dengan senarai parameter BERBEZA mencipta OVERLOAD baharu,
--    BUKAN menggantikan fungsi lama — PostgREST kemudian menolak panggilan
--    client (5 argumen) sebagai "ambiguous" sebab ia sepadan DUA fungsi
--    serentak (ditemui semasa jalankan migration ini secara langsung di
--    production 2026-10-03). `drop function` eksplisit dahulu mengelakkan
--    ini berulang bila migration ini dijalankan semula (cth. `db push`
--    pada persekitaran baharu).
-- =============================================================================

drop function if exists public.submit_business_ad(text, text, text, text, text);

create or replace function public.submit_business_ad(
  p_nama_bisnes   text,
  p_url_poster    text,
  p_penerangan    text,
  p_teks_cta      text,
  p_no_whatsapp   text,
  p_url_gambar_2  text default null,
  p_url_gambar_3  text default null
)
returns public.member_business_ads
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_queue   constant integer := 20;
  c_max_per_ahli constant integer := 3;
  me            uuid := public.my_member_id();
  wa            text := regexp_replace(coalesce(p_no_whatsapp, ''), '[^0-9]', '', 'g');
  mine          integer;
  result        public.member_business_ads;
begin
  if auth.uid() is null or me is null then
    raise exception 'Hanya ahli log masuk boleh menghantar iklan.' using errcode = '42501';
  end if;
  if public.account_suspended(auth.uid()) or public.temp_password_pending(auth.uid()) then
    raise exception 'Akaun anda tidak dibenarkan menghantar iklan.' using errcode = '42501';
  end if;

  -- Nombor Malaysia bermula 0 -> 60 (form ahli menyimpan 01x...).
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
  -- Gambar 1 (poster) mesti fail dalam bucket business-ads milik pemanggil sendiri.
  if coalesce(p_url_poster, '') !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Poster tidak sah — muat naik poster melalui aplikasi.' using errcode = '22023';
  end if;
  -- Gambar 2/3 pilihan — jika diberi, mesti milik pemanggil sendiri juga.
  if p_url_gambar_2 is not null and p_url_gambar_2 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 2 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_3 is not null and p_url_gambar_3 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 3 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('member_business_ads_queue'));
  perform public.expire_business_ads();

  if public.business_ads_queue_used() >= c_max_queue then
    raise exception 'Queue iklan penuh (% slot). Sila cuba lagi apabila ada iklan tamat atau selesai disemak.', c_max_queue
      using errcode = 'P0001';
  end if;

  select count(*) into mine from public.member_business_ads
   where member_id = me
     and (status = 'menunggu' or (status = 'diluluskan' and tarikh_tamat >= now()));
  if mine >= c_max_per_ahli then
    raise exception 'Anda sudah ada % iklan menunggu/aktif (had setiap ahli).', c_max_per_ahli
      using errcode = 'P0001';
  end if;

  insert into public.member_business_ads
    (member_id, nama_bisnes, url_poster, penerangan, teks_cta, no_whatsapp, url_gambar_2, url_gambar_3)
  values
    (me, btrim(p_nama_bisnes), p_url_poster, nullif(btrim(p_penerangan), ''),
     nullif(btrim(p_teks_cta), ''), wa, p_url_gambar_2, p_url_gambar_3)
  returning * into result;

  return result;
end;
$$;

revoke all on function public.submit_business_ad(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_business_ad(text, text, text, text, text, text, text) to authenticated;


-- =============================================================================
-- 2. resubmit_business_ad() — +2 parameter pilihan (sama corak + sama sebab
--    `drop function` dahulu seperti submit_business_ad() di atas). UPDATE
--    menetapkan terus kepada nilai diberi (termasuk null) supaya ahli boleh
--    BUANG gambar 2/3 semasa sunting, bukan sentiasa kekal nilai lama.
-- =============================================================================

drop function if exists public.resubmit_business_ad(uuid, text, text, text, text, text);

create or replace function public.resubmit_business_ad(
  p_ad_id        uuid,
  p_nama_bisnes  text,
  p_url_poster   text,
  p_penerangan   text,
  p_teks_cta     text,
  p_no_whatsapp  text,
  p_url_gambar_2 text default null,
  p_url_gambar_3 text default null
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
  if p_url_gambar_2 is not null and p_url_gambar_2 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 2 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_3 is not null and p_url_gambar_3 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 3 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('member_business_ads_queue'));
  perform public.expire_business_ads();

  if public.business_ads_queue_used() >= c_max_queue then
    raise exception 'Queue iklan penuh (% slot). Sila cuba lagi apabila ada iklan tamat atau selesai disemak.', c_max_queue
      using errcode = 'P0001';
  end if;

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
         url_gambar_2 = p_url_gambar_2,
         url_gambar_3 = p_url_gambar_3,
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

revoke all on function public.resubmit_business_ad(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.resubmit_business_ad(uuid, text, text, text, text, text, text, text) to authenticated;


-- =============================================================================
-- 3. delete_business_ad() — pulangkan SEMUA url (bukan hanya poster) supaya
--    klien boleh padam ketiga-tiga fail storage, bukan tinggalkan gambar
--    2/3 sebagai anak yatim. Jenis pulangan berubah (text -> text[]) jadi
--    drop dahulu (create or replace tidak boleh ubah jenis pulangan).
-- =============================================================================

drop function if exists public.delete_business_ad(uuid);

create or replace function public.delete_business_ad(p_ad_id uuid)
returns text[]
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

  return array_remove(array[ad.url_poster, ad.url_gambar_2, ad.url_gambar_3], null);
end;
$$;

revoke all on function public.delete_business_ad(uuid) from public, anon;
grant execute on function public.delete_business_ad(uuid) to authenticated;


-- =============================================================================
-- 4. Bacaan SATU iklan — tambah url_gambar_2/3 untuk galeri skrin detail.
--    Jenis pulangan berubah (lajur baharu) jadi drop dahulu.
-- =============================================================================

drop function if exists public.get_business_ad(uuid);

create or replace function public.get_business_ad(p_ad_id uuid)
returns table (
  id             uuid,
  member_id      uuid,
  nama_pemilik   text,
  nama_bisnes    text,
  url_poster     text,
  url_gambar_2   text,
  url_gambar_3   text,
  penerangan     text,
  teks_cta       text,
  no_whatsapp    text,
  status_paparan text,
  sebab_tolak    text,
  is_mine        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, a.nama_bisnes, a.url_poster, a.url_gambar_2, a.url_gambar_3,
         a.penerangan, a.teks_cta, a.no_whatsapp,
         case when a.status = 'diluluskan' and a.tarikh_tamat < now()
              then 'tamat_tempoh' else a.status end,
         case when a.member_id = public.my_member_id() then a.sebab_tolak end,
         a.member_id = public.my_member_id()
  from public.member_business_ads a
  join public.members m on m.id = a.member_id
  where a.id = p_ad_id
    and auth.uid() is not null
    and not public.account_suspended(auth.uid())
    and (
      a.member_id = public.my_member_id()
      or (a.status = 'diluluskan' and a.tarikh_tamat >= now())
    );
$$;

revoke all on function public.get_business_ad(uuid) from public, anon;
grant execute on function public.get_business_ad(uuid) to authenticated;


-- =============================================================================
-- 5. Bacaan SATU iklan (admin) — sama tambahan.
-- =============================================================================

drop function if exists public.get_business_ad_admin(uuid);

create or replace function public.get_business_ad_admin(p_ad_id uuid)
returns table (
  id             uuid,
  member_id      uuid,
  nama_pemilik   text,
  no_keahlian    text,
  nama_bisnes    text,
  url_poster     text,
  url_gambar_2   text,
  url_gambar_3   text,
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
  select a.id, a.member_id, m.full_name, m.nombor_ahli, a.nama_bisnes, a.url_poster, a.url_gambar_2, a.url_gambar_3,
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

notify pgrst, 'reload schema';
