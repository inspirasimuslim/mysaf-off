-- =============================================================================
-- mysaf-off — Admin boleh hantar iklan bisnes BAGI PIHAK ahli lain
--
-- Permintaan 2026-10-03: admin Lajnah Ekonomi (can_review_business_ads())
-- kadangkala membantu ahli yang tidak mahir aplikasi memuat naik iklan
-- mereka. RPC BAHARU `submit_business_ad_admin()` — BUKAN laluan tambahan
-- untuk `submit_business_ad()` sedia ada, sebab keperluan berbeza:
--
--   * Pemilik dipilih oleh admin (`p_member_id`), bukan `my_member_id()`
--     pemanggil. Fail gambar yang dimuat naik tetap disahkan terhadap
--     `my_member_id()` PEMANGGIL (admin), bukan `p_member_id` — storage RLS
--     (`business_ads_insert`) hanya membenarkan ahli menulis fail bernama
--     awalan ID DIRINYA SENDIRI, jadi fail yang dimuat naik admin melalui
--     `uploadBusinessImage(adminMemberId, uri)` memang bernama awalan ID
--     admin, bukan ID ahli yang dipilih.
--   * TIADA had queue (20) atau had 3/ahli — diminta eksplisit "unlimited"
--     untuk laluan admin ini (had sedia ada kekal tidak berubah untuk
--     penghantaran ahli sendiri melalui `submit_business_ad()`).
--   * Terus berstatus 'diluluskan' (bukan 'menunggu') — admin yang menghantar
--     ADALAH admin yang mengulas, jadi tiada gunanya ia menunggu semakan
--     admin lain dalam tab "Menunggu"; durasi paparan (`p_durasi_hari`)
--     diambil terus daripada admin semasa penghantaran (sama medan seperti
--     `review_business_ad()` lulus), bukan dua langkah berasingan.
-- =============================================================================

create or replace function public.submit_business_ad_admin(
  p_member_id    uuid,
  p_nama_bisnes  text,
  p_url_poster   text,
  p_penerangan   text,
  p_teks_cta     text,
  p_no_whatsapp  text,
  p_durasi_hari  integer,
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
  result public.member_business_ads;
begin
  if not public.can_review_business_ads() then
    raise exception 'Anda tidak dibenarkan menghantar iklan bagi pihak ahli lain.' using errcode = '42501';
  end if;
  if me is null then
    raise exception 'Akaun admin anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  if p_member_id is null or not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Ahli pemilik tidak dijumpai.' using errcode = 'P0002';
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
  if p_durasi_hari is null or p_durasi_hari not between 1 and 365 then
    raise exception 'Durasi mesti nombor bulat 1 hingga 365 hari.' using errcode = '22023';
  end if;
  -- Gambar disahkan terhadap ID ADMIN (pemanggil/pemuat naik sebenar), BUKAN
  -- p_member_id (ahli yang dipilih) — lihat nota reka bentuk di atas fail ini.
  if coalesce(p_url_poster, '') !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Poster tidak sah — muat naik poster melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_2 is not null and p_url_gambar_2 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 2 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;
  if p_url_gambar_3 is not null and p_url_gambar_3 !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Gambar 3 tidak sah — muat naik melalui aplikasi.' using errcode = '22023';
  end if;

  insert into public.member_business_ads
    (member_id, nama_bisnes, url_poster, penerangan, teks_cta, no_whatsapp,
     url_gambar_2, url_gambar_3, status, reviewed_by, reviewed_at,
     durasi_hari, tarikh_mula, tarikh_tamat)
  values
    (p_member_id, btrim(p_nama_bisnes), p_url_poster, nullif(btrim(p_penerangan), ''),
     nullif(btrim(p_teks_cta), ''), wa, p_url_gambar_2, p_url_gambar_3,
     'diluluskan', auth.uid(), now(),
     p_durasi_hari, now(), now() + make_interval(days => p_durasi_hari))
  returning * into result;

  return result;
end;
$$;

revoke all on function public.submit_business_ad_admin(uuid, text, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.submit_business_ad_admin(uuid, text, text, text, text, text, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
