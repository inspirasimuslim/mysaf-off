-- =============================================================================
-- mysaf-off — Iklan Perniagaan Ahli (poster carousel + Direktori Bisnes Ahli)
-- FASA 1: DB + RLS + RPC sahaja (UI kemudian).
--
-- Jalankan SELEPAS 20260929000098. Hanya table/fungsi/bucket BAHARU — tiada
-- data sedia ada disentuh, jadi tiada snapshot dijana.
--
-- Keputusan reka bentuk (ringkas; butiran dalam laporan Fasa 1):
--   * Kebenaran admin: department 'LAJNAH EKONOMI DAN ASET' (nama sebenar dalam
--     DB, sama pemilik PIPIS) — bukan 'LAJNAH EKONOMI'. Lihat = can_view,
--     review = can_edit; Super Admin dirangkumi has_department_access.
--   * SEMUA tulisan melalui RPC security definer (tiada INSERT/UPDATE/DELETE
--     terus untuk authenticated) — had queue 20 dan status awal 'menunggu'
--     tidak boleh dipintas dengan INSERT terus.
--   * Queue = bilangan baris berstatus 'menunggu' + 'diluluskan' yang belum
--     tamat. Dikuatkuasakan semasa HANTAR (di situ jumlah bertambah); semasa
--     lulus ia disemak semula sebagai pagar keselamatan.
--   * Tamat tempoh dinilai ikut masa (tarikh_tamat < now()) tanpa cron;
--     RPC tulis menanda baris tamat sebagai 'tamat_tempoh' supaya slot
--     dibebaskan dan status di DB tidak basi.
-- =============================================================================


-- =============================================================================
-- 1. TABLE
-- =============================================================================

create table if not exists public.member_business_ads (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete cascade,
  nama_bisnes   text not null check (char_length(btrim(nama_bisnes)) between 2 and 80),
  url_poster    text not null,
  penerangan    text check (penerangan is null or char_length(penerangan) <= 1000),
  teks_cta      text check (teks_cta is null or char_length(teks_cta) <= 40),
  no_whatsapp   text not null check (no_whatsapp ~ '^[0-9]{9,15}$'),
  status        text not null default 'menunggu'
                check (status in ('menunggu', 'diluluskan', 'ditolak', 'tamat_tempoh')),
  sebab_tolak   text check (sebab_tolak is null or char_length(sebab_tolak) <= 500),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  durasi_hari   integer check (durasi_hari is null or durasi_hari between 1 and 365),
  tarikh_mula   timestamptz,
  tarikh_tamat  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint member_business_ads_lulus_lengkap check (
    status not in ('diluluskan', 'tamat_tempoh')
    or (durasi_hari is not null and tarikh_mula is not null and tarikh_tamat is not null)
  )
);

comment on column public.member_business_ads.tarikh_mula is
  'Sama dengan reviewed_at semasa diluluskan. Susunan carousel = tarikh_mula menaik (paling lama dilulus dahulu), kemudian id — tiada kolum display_order berasingan.';

create index if not exists member_business_ads_member_id_idx on public.member_business_ads (member_id);
create index if not exists member_business_ads_status_idx on public.member_business_ads (status, tarikh_tamat);

drop trigger if exists member_business_ads_set_updated_at on public.member_business_ads;
create trigger member_business_ads_set_updated_at
  before update on public.member_business_ads
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. KEBENARAN
-- =============================================================================

create or replace function public.can_view_business_ads_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH EKONOMI DAN ASET', false);
$$;

create or replace function public.can_review_business_ads()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH EKONOMI DAN ASET', true);
$$;

revoke all on function public.can_view_business_ads_admin() from public, anon;
revoke all on function public.can_review_business_ads() from public, anon;
grant execute on function public.can_view_business_ads_admin() to authenticated;
grant execute on function public.can_review_business_ads() to authenticated;


-- =============================================================================
-- 3. RLS (bacaan sahaja — tulisan melalui RPC)
--
-- Baris kelihatan kepada: pemilik (semua status), mana-mana ahli log masuk
-- untuk baris diluluskan yang BELUM tamat, dan admin Lajnah Ekonomi (lihat).
-- Ahli yang disekat tidak melihat apa-apa (my_member_id() tidak menapis
-- sekatan, jadi disemak eksplisit melalui account_suspended()).
-- =============================================================================

alter table public.member_business_ads enable row level security;

revoke all on table public.member_business_ads from public, anon, authenticated;
grant select on table public.member_business_ads to authenticated;

drop policy if exists member_business_ads_select on public.member_business_ads;
create policy member_business_ads_select on public.member_business_ads
  for select to authenticated
  using (
    not public.my_account_suspended()
    and (
      member_id = public.my_member_id()
      or (status = 'diluluskan' and tarikh_tamat >= now())
      or public.can_view_business_ads_admin()
    )
  );


-- =============================================================================
-- 4. STORAGE — bucket 'business-ads' (corak sama event-posters/announcement-posters)
--
-- Bucket awam (poster dibenam terus dalam carousel); yang dilindungi ialah
-- TULISAN. Nama fail '<member_id>_<epoch ms>.jpg' supaya pemilikan disahkan
-- daripada nama (corak avatars) — ahli hanya boleh menulis/memadam fail
-- namanya sendiri. Sambungan dikunci .jpg (klien sedia ada memampat ke JPEG).
-- storage_name_ok() ditulis semula PENUH (salinan tepat 20260913000025 +
-- cabang baharu) kerana ia satu fungsi bersama.
-- =============================================================================

create or replace function public.storage_name_ok(p_bucket text, p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case p_bucket
      when 'avatars' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
      when 'event-posters' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      when 'announcement-posters' then
        p_name ~ '^poster-[0-9]{10,16}\.jpg$'
      when 'payment-qr' then
        p_name ~ '^qr-[0-9]{10,16}\.jpg$'
      when 'business-ads' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9]{10,16}\.jpg$'
      else false
    end,
    false
  );
$$;

revoke all on function public.storage_name_ok(text, text) from public, anon;
grant execute on function public.storage_name_ok(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-ads', 'business-ads', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists business_ads_read on storage.objects;
create policy business_ads_read on storage.objects
  for select to authenticated
  using (bucket_id = 'business-ads');

drop policy if exists business_ads_insert on storage.objects;
create policy business_ads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-ads'
    and public.storage_name_ok(bucket_id, name)
    and public.uuid_or_null(split_part(name, '_', 1)) = public.my_member_id()
    and not public.my_account_suspended()
  );

drop policy if exists business_ads_update on storage.objects;
create policy business_ads_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-ads'
    and public.uuid_or_null(split_part(name, '_', 1)) = public.my_member_id()
  )
  with check (
    bucket_id = 'business-ads'
    and public.storage_name_ok(bucket_id, name)
    and public.uuid_or_null(split_part(name, '_', 1)) = public.my_member_id()
  );

drop policy if exists business_ads_delete on storage.objects;
create policy business_ads_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-ads'
    and (
      public.uuid_or_null(split_part(name, '_', 1)) = public.my_member_id()
      or public.can_review_business_ads()
    )
  );


-- =============================================================================
-- 5. FUNGSI DALAMAN
-- =============================================================================

-- Tandakan iklan diluluskan yang sudah tamat sebagai 'tamat_tempoh'
-- (membebaskan slot queue). Tidak di-grant kepada authenticated.
create or replace function public.expire_business_ads()
returns void
language sql
security definer
set search_path = public
as $$
  update public.member_business_ads
     set status = 'tamat_tempoh'
   where status = 'diluluskan' and tarikh_tamat < now();
$$;

revoke all on function public.expire_business_ads() from public, anon, authenticated;

-- Slot queue terpakai = menunggu + diluluskan-aktif (dipanggil selepas expire).
create or replace function public.business_ads_queue_used()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.member_business_ads
   where status = 'menunggu' or (status = 'diluluskan' and tarikh_tamat >= now());
$$;

revoke all on function public.business_ads_queue_used() from public, anon;
grant execute on function public.business_ads_queue_used() to authenticated;


-- =============================================================================
-- 6. RPC submit_business_ad
--
-- Had: 20 slot keseluruhan; 3 slot serentak setiap ahli (menunggu +
-- diluluskan-aktif) supaya seorang ahli tidak menghabiskan queue.
-- Advisory lock menyerikan penghantaran/kelulusan supaya dua penghantaran
-- serentak tidak sama-sama lulus semakan 19 -> 20.
-- =============================================================================

create or replace function public.submit_business_ad(
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
  -- Poster mesti fail dalam bucket business-ads milik pemanggil sendiri.
  if coalesce(p_url_poster, '') !~ ('/storage/v1/object/public/business-ads/' || me::text || '_[0-9]{10,16}\.jpg(\?.*)?$') then
    raise exception 'Poster tidak sah — muat naik poster melalui aplikasi.' using errcode = '22023';
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
    (member_id, nama_bisnes, url_poster, penerangan, teks_cta, no_whatsapp)
  values
    (me, btrim(p_nama_bisnes), p_url_poster, nullif(btrim(p_penerangan), ''),
     nullif(btrim(p_teks_cta), ''), wa)
  returning * into result;

  return result;
end;
$$;

revoke all on function public.submit_business_ad(text, text, text, text, text) from public, anon;
grant execute on function public.submit_business_ad(text, text, text, text, text) to authenticated;


-- =============================================================================
-- 7. RPC review_business_ad — admin Lajnah Ekonomi (edit) / Super Admin
-- =============================================================================

create or replace function public.review_business_ad(
  p_ad_id       uuid,
  p_keputusan   text,
  p_durasi_hari integer default null,
  p_sebab_tolak text default null
)
returns public.member_business_ads
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_queue constant integer := 20;
  ad          public.member_business_ads;
begin
  if not public.can_review_business_ads() then
    raise exception 'Anda tidak dibenarkan menyemak iklan.' using errcode = '42501';
  end if;
  if p_keputusan not in ('diluluskan', 'ditolak') then
    raise exception 'Keputusan mesti "diluluskan" atau "ditolak".' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('member_business_ads_queue'));
  perform public.expire_business_ads();

  select * into ad from public.member_business_ads where id = p_ad_id for update;
  if not found then
    raise exception 'Iklan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if ad.status <> 'menunggu' then
    raise exception 'Iklan ini sudah disemak (status: %).', ad.status using errcode = 'P0001';
  end if;

  if p_keputusan = 'diluluskan' then
    if p_durasi_hari is null or p_durasi_hari not between 1 and 365 then
      raise exception 'Durasi mesti 1 hingga 365 hari.' using errcode = '22023';
    end if;
    -- Pagar keselamatan: entri menunggu sudah dikira dalam queue, jadi lulus
    -- tidak menambah jumlah; ini hanya gagal jika data terpesong daripada had.
    if public.business_ads_queue_used() > c_max_queue then
      raise exception 'Queue iklan penuh (% slot) — tidak boleh meluluskan.', c_max_queue
        using errcode = 'P0001';
    end if;
    update public.member_business_ads
       set status = 'diluluskan',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           durasi_hari = p_durasi_hari,
           tarikh_mula = now(),
           tarikh_tamat = now() + make_interval(days => p_durasi_hari),
           sebab_tolak = null
     where id = p_ad_id
     returning * into ad;
  else
    update public.member_business_ads
       set status = 'ditolak',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           sebab_tolak = nullif(btrim(p_sebab_tolak), '')
     where id = p_ad_id
     returning * into ad;
  end if;

  return ad;
end;
$$;

revoke all on function public.review_business_ad(uuid, text, integer, text) from public, anon;
grant execute on function public.review_business_ad(uuid, text, integer, text) to authenticated;


-- =============================================================================
-- 8. RPC bacaan
--
-- Semua security definer supaya boleh menyertakan nama pemilik (RLS `members`
-- tidak terbuka kepada semua ahli) — hanya nama pemilik + no_whatsapp iklan
-- (yang memang tujuan dipaparkan) yang didedahkan.
-- =============================================================================

-- Carousel homepage: diluluskan + dalam tempoh, paling lama dilulus dahulu.
create or replace function public.list_active_business_ads()
returns table (
  id           uuid,
  member_id    uuid,
  nama_pemilik text,
  nama_bisnes  text,
  url_poster   text,
  penerangan   text,
  teks_cta     text,
  no_whatsapp  text,
  tarikh_mula  timestamptz,
  tarikh_tamat timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, a.nama_bisnes, a.url_poster, a.penerangan,
         a.teks_cta, a.no_whatsapp, a.tarikh_mula, a.tarikh_tamat
  from public.member_business_ads a
  join public.members m on m.id = a.member_id
  where auth.uid() is not null
    and not public.account_suspended(auth.uid())
    and a.status = 'diluluskan' and a.tarikh_tamat >= now()
  order by a.tarikh_mula asc, a.id asc;
$$;

-- Direktori Bisnes: diluluskan-aktif (semua ahli) + SEMUA entri milik pemanggil
-- (menunggu/ditolak/tamat). Identiti pemanggil diambil daripada sesi
-- (my_member_id()), BUKAN parameter — parameter klien boleh dipalsukan untuk
-- mengintip entri pending orang lain.
-- `status_paparan` = status efektif (diluluskan yang telah lepas tarikh_tamat
-- dipaparkan 'tamat_tempoh' walaupun baris belum ditanda).
create or replace function public.list_business_directory()
returns table (
  id             uuid,
  member_id      uuid,
  nama_pemilik   text,
  nama_bisnes    text,
  url_poster     text,
  penerangan     text,
  teks_cta       text,
  no_whatsapp    text,
  status_paparan text,
  sebab_tolak    text,
  is_mine        boolean,
  submitted_at   timestamptz,
  tarikh_mula    timestamptz,
  tarikh_tamat   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, a.nama_bisnes, a.url_poster, a.penerangan,
         a.teks_cta, a.no_whatsapp,
         case when a.status = 'diluluskan' and a.tarikh_tamat < now()
              then 'tamat_tempoh' else a.status end,
         case when a.member_id = public.my_member_id() then a.sebab_tolak end,
         a.member_id = public.my_member_id(),
         a.submitted_at, a.tarikh_mula, a.tarikh_tamat
  from public.member_business_ads a
  join public.members m on m.id = a.member_id
  where auth.uid() is not null
    and not public.account_suspended(auth.uid())
    and (
      a.member_id = public.my_member_id()
      or (a.status = 'diluluskan' and a.tarikh_tamat >= now())
    )
  order by (a.member_id = public.my_member_id() and a.status <> 'diluluskan') desc,
           coalesce(a.tarikh_mula, a.submitted_at) desc, a.id;
$$;

-- Halaman detail (klik poster). Peraturan kelihatan sama seperti direktori.
create or replace function public.get_business_ad(p_ad_id uuid)
returns table (
  id             uuid,
  member_id      uuid,
  nama_pemilik   text,
  nama_bisnes    text,
  url_poster     text,
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
  select a.id, a.member_id, m.full_name, a.nama_bisnes, a.url_poster, a.penerangan,
         a.teks_cta, a.no_whatsapp,
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

-- Queue semakan admin: menunggu sahaja, paling lama dihantar dahulu.
create or replace function public.list_pending_business_ads()
returns table (
  id           uuid,
  member_id    uuid,
  nama_pemilik text,
  no_keahlian  text,
  nama_bisnes  text,
  url_poster   text,
  penerangan   text,
  teks_cta     text,
  no_whatsapp  text,
  submitted_at timestamptz,
  queue_used   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, m.nombor_ahli, a.nama_bisnes, a.url_poster,
         a.penerangan, a.teks_cta, a.no_whatsapp, a.submitted_at,
         public.business_ads_queue_used()
  from public.member_business_ads a
  join public.members m on m.id = a.member_id
  where public.can_view_business_ads_admin()
    and a.status = 'menunggu'
  order by a.submitted_at asc, a.id;
$$;

revoke all on function public.list_active_business_ads() from public, anon;
revoke all on function public.list_business_directory() from public, anon;
revoke all on function public.get_business_ad(uuid) from public, anon;
revoke all on function public.list_pending_business_ads() from public, anon;
grant execute on function public.list_active_business_ads() to authenticated;
grant execute on function public.list_business_directory() to authenticated;
grant execute on function public.get_business_ad(uuid) to authenticated;
grant execute on function public.list_pending_business_ads() to authenticated;

notify pgrst, 'reload schema';
