-- =============================================================================
-- mysaf-off — Admin Lajnah Ekonomi boleh MENYUNTING iklan bisnes (2026-10-10)
--
-- Permintaan: iklan yang sudah dipaparkan perlu boleh ditukar posternya atau
-- maklumatnya oleh admin. Sebelum ini hanya pemilik boleh sunting, dan hanya
-- selepas ditolak (`resubmit_business_ad`) — iklan diluluskan tidak boleh disentuh.
--
-- RPC BAHARU `update_business_ad_admin()`, bukan pelonggaran `resubmit_business_ad()`
-- (yang sengaja menetapkan semula status kepada 'menunggu'):
--   * Boleh digunakan pada MANA-MANA status. Status, `reviewed_*`, `durasi_hari`,
--     `tarikh_mula` dan `tarikh_tamat` TIDAK disentuh — menyunting iklan aktif
--     tidak menggugurkannya daripada carousel, tidak memanjangkan tempohnya dan
--     tidak mengubah giliran paparan. Ubah tempoh = bukan skop fungsi ini.
--   * Pemilik (`member_id`) tidak boleh ditukar.
--   * Gambar yang dibenarkan: (a) URL yang SEDIA ADA pada baris itu (tidak
--     diubah — mungkin dimuat naik pemilik, jadi awalannya ID pemilik), atau
--     (b) muat naik BAHARU admin sendiri (awalan `my_member_id()` pemanggil,
--     sama peraturan `submit_business_ad_admin()` — storage RLS menuntutnya).
--     Menerima mana-mana URL lain akan membenarkan admin menunjuk iklan ke
--     fail milik orang lain.
--   * Validasi medan sama seperti `submit_business_ad_admin()` (migration 108).
-- =============================================================================

create or replace function public.update_business_ad_admin(
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
  me     uuid := public.my_member_id();
  wa     text := regexp_replace(coalesce(p_no_whatsapp, ''), '[^0-9]', '', 'g');
  ad     public.member_business_ads;
  v_re   text;
  result public.member_business_ads;
begin
  if not public.can_review_business_ads() then
    raise exception 'Anda tidak dibenarkan menyunting iklan.' using errcode = '42501';
  end if;
  if me is null then
    raise exception 'Akaun admin anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;

  select * into ad from public.member_business_ads where id = p_ad_id for update;
  if not found then
    raise exception 'Iklan tidak dijumpai.' using errcode = 'P0002';
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

  v_re := '/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$';

  if coalesce(p_url_poster, '') <> ad.url_poster and coalesce(p_url_poster, '') !~ v_re then
    raise exception 'Poster tidak sah — muat naik poster melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_2 is not null and p_url_gambar_2 is distinct from ad.url_gambar_2 and p_url_gambar_2 !~ v_re then
    raise exception 'Gambar 2 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_3 is not null and p_url_gambar_3 is distinct from ad.url_gambar_3 and p_url_gambar_3 !~ v_re then
    raise exception 'Gambar 3 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;

  update public.member_business_ads
     set nama_bisnes  = btrim(p_nama_bisnes),
         url_poster   = p_url_poster,
         penerangan   = nullif(btrim(p_penerangan), ''),
         teks_cta     = nullif(btrim(p_teks_cta), ''),
         no_whatsapp  = wa,
         url_gambar_2 = p_url_gambar_2,
         url_gambar_3 = p_url_gambar_3
   where id = p_ad_id
   returning * into result;

  return result;
end;
$$;

revoke all on function public.update_business_ad_admin(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_business_ad_admin(uuid, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
