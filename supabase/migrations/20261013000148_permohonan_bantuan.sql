-- =============================================================================
-- mysaf-off — Permohonan Bantuan Zakat (one-off) — 2026-10-13
--
-- Ahli memohon bantuan zakat melalui salah satu daripada DUA borang (Belajar, atau
-- Bekerja/Berkahwin); admin jabatan TABUNG ZAKAT menyemak dan meluluskan / menolak.
-- Tiada pembayaran atau bantuan berkala dalam fasa ini. Permohonan boleh dibuat
-- lebih daripada sekali (bulan-bulan berikutnya) — tiada had dikuatkuasakan, hanya
-- ditanda "kemungkinan pertindihan" kepada admin jika ada permohonan lain pada bulan sama.
-- Migration ini HANYA menambah (department, table, fungsi, polisi) dan menulis semula
-- `admin_notifications()` (blok baharu). Tiada data/kolum sedia ada disentuh, jadi
-- tiada snapshot `backup_*` diperlukan.
--
-- REKA BENTUK KESELAMATAN
--   * Semua TULISAN melalui RPC `security definer`. `authenticated` hanya diberi SELECT
--     pada table — jadi status, jumlah diluluskan dan identiti pelulus TIDAK boleh
--     ditetapkan melalui permintaan terus (PostgREST), dan peralihan status
--     dikuatkuasakan di pelayan.
--   * Medan yang HANYA admin boleh lihat (nota dalaman, alasan kelulusan/penolakan
--     dalaman, perbezaan pindaan) berada dalam table berasingan, bukan lajur yang
--     disembunyikan. Ahli tiada dasar SELECT pada table itu.
--   * AKSES ADMIN = department KHUSUS 'TABUNG ZAKAT' (dicipta di sini), BUKAN
--     'LAJNAH KEBAJIKAN' yang mengurus data ahli / kesihatan. Admin LAJNAH KEBAJIKAN
--     sedia ada TIDAK mendapat akses kecuali ditugaskan juga ke TABUNG ZAKAT.
--     Super Admin dirangkumi oleh `has_department_access`. Admin JABATAN DATA tiada akses.
--   * Maklumat akaun bank pemohon berada pada baris permohonan: hanya pemilik dan
--     admin TABUNG ZAKAT boleh membacanya (RLS). Ia TIDAK pernah masuk notifikasi.
--   * Pentadbir yang juga pemohon TIDAK boleh melihat butiran admin, menyemak atau
--     memutuskan permohonan sendiri (RLS + RPC). Tiada jalan pintas.
--   * Persaingan: lajur `versi`. Setiap tindakan admin menghantar `versi` yang dilihatnya;
--     jika sudah berubah, tindakan ditolak dan admin diminta memuat semula.
--   * Klik berganda: `id` dijana oleh klien (draf tidak berganda); `bantuan_submit`
--     idempoten (hantar kali kedua memulangkan rekod sedia ada). Nombor rujukan dijana
--     dengan kaunter berkunci baris (selamat untuk pengguna serentak).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Department khusus + kebenaran
-- -----------------------------------------------------------------------------

insert into public.departments (name, is_active)
values ('TABUNG ZAKAT', true)
on conflict (name) do nothing;

create or replace function public.can_view_bantuan_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_department_access('TABUNG ZAKAT', false, uid); $$;

create or replace function public.can_decide_bantuan(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_department_access('TABUNG ZAKAT', true, uid); $$;

revoke all on function public.can_view_bantuan_admin(uuid) from public, anon;
revoke all on function public.can_decide_bantuan(uuid) from public, anon;
grant execute on function public.can_view_bantuan_admin(uuid) to authenticated;
grant execute on function public.can_decide_bantuan(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Table
-- -----------------------------------------------------------------------------

create table if not exists public.bantuan_counters (
  tahun    integer primary key,
  terakhir integer not null default 0
);
alter table public.bantuan_counters enable row level security;
revoke all on table public.bantuan_counters from public, anon, authenticated;

create table if not exists public.bantuan_applications (
  id                   uuid primary key,                       -- dijana klien (idempotensi draf)
  no_rujukan           text unique,                            -- diberi sekali, semasa hantar pertama
  member_id            uuid not null references public.members (id) on delete cascade,
  status               text not null default 'draft'
                         check (status in ('draft','submitted','under_review','needs_information','approved','rejected')),
  versi                integer not null default 1,
  kategori             text not null check (kategori in ('belajar','bekerja')),

  -- Maklumat pemohon (salinan pada waktu permohonan, bukan rujukan ke profil).
  nama_pemohon         text,
  telefon              text,
  generasi             text,
  status_diri          text check (status_diri is null or status_diri in ('bujang','berkahwin','lain_lain')),
  status_diri_lain     text,
  tempat_menetap       text,
  tahap_pendidikan     text check (tahap_pendidikan is null or tahap_pendidikan in
                         ('stpm','stam','matrikulasi','asasi','diploma','sarjana_muda','sarjana','phd','lain_lain')),
  tahap_pendidikan_lain text,

  -- Borang Belajar.
  tinggal_di           text check (tinggal_di is null or tinggal_di in ('kolej','rumah_sewa','keluarga','lain_lain')),
  tinggal_di_lain      text,
  tahun_pengajian      text,
  pembiayaan           text[] check (pembiayaan is null or pembiayaan <@
                         array['biasiswa','pinjaman','ibu_bapa','kerja_separuh_masa','lain_lain']::text[]),
  pembiayaan_lain      text,

  -- Pekerjaan / pendapatan. NULL = belum diisi (BUKAN sifar).
  pekerjaan            text,
  pendapatan_pemohon   numeric(12,2) check (pendapatan_pemohon is null or (pendapatan_pemohon >= 0 and pendapatan_pemohon <= 10000000)),
  pendapatan_keluarga  numeric(12,2) check (pendapatan_keluarga is null or (pendapatan_keluarga >= 0 and pendapatan_keluarga <= 10000000)),

  -- Keluarga.
  pekerjaan_ibu        text,
  pekerjaan_bapa       text,
  bil_tanggungan       integer check (bil_tanggungan is null or (bil_tanggungan >= 0 and bil_tanggungan <= 50)),
  anak_ke              integer check (anak_ke is null or (anak_ke >= 1 and anak_ke <= 50)),
  bil_adik_beradik     integer check (bil_adik_beradik is null or (bil_adik_beradik >= 1 and bil_adik_beradik <= 50)),
  bil_anak             integer check (bil_anak is null or (bil_anak >= 0 and bil_anak <= 50)),

  -- Keperluan.
  sebab_keperluan      text[] check (sebab_keperluan is null or sebab_keperluan <@
                         array['sara_hidup','perubatan','pendidikan','tempat_tinggal','lain_lain']::text[]),
  sebab_lain           text,
  penerangan           text,
  pernah_terima        boolean,

  -- Akaun bank (SULIT — pemilik + admin TABUNG ZAKAT sahaja).
  bank_nama_pemegang   text,
  bank_nama            text,
  bank_no_akaun        text check (bank_no_akaun is null or bank_no_akaun ~ '^[0-9]{6,20}$'),

  -- Pengakuan
  pengakuan_setuju     boolean not null default false,
  pengakuan_at         timestamptz,

  -- Penghantaran
  pertama_dihantar_at  timestamptz,
  dihantar_at          timestamptz,                            -- penghantaran TERAKHIR (juga semula)
  snapshot_hantar      jsonb,                                  -- medan borang pada penghantaran terakhir (untuk perbezaan pindaan)

  -- Keputusan (dipapar kepada ahli). Alasan DALAMAN berada dalam bantuan_admin_notes.
  jumlah_diluluskan    numeric(12,2) check (jumlah_diluluskan is null or (jumlah_diluluskan > 0 and jumlah_diluluskan <= 1000000)),
  mesej_keputusan      text,
  sebab_tolak_kategori text check (sebab_tolak_kategori is null or sebab_tolak_kategori in
                         ('luar_skop','tidak_dapat_disahkan','telah_ditampung','lain_lain')),
  sebab_tolak_penjelasan text,
  diputuskan_oleh      uuid,
  diputuskan_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Had panjang teks supaya satu permintaan tidak boleh menyimpan data berlebihan.
  constraint bantuan_teks_pendek check (
    char_length(coalesce(nama_pemohon, '')) <= 200 and char_length(coalesce(telefon, '')) <= 30
    and char_length(coalesce(generasi, '')) <= 50 and char_length(coalesce(status_diri_lain, '')) <= 200
    and char_length(coalesce(tempat_menetap, '')) <= 200 and char_length(coalesce(tahap_pendidikan_lain, '')) <= 200
    and char_length(coalesce(tinggal_di_lain, '')) <= 200 and char_length(coalesce(tahun_pengajian, '')) <= 100
    and char_length(coalesce(pembiayaan_lain, '')) <= 200 and char_length(coalesce(pekerjaan, '')) <= 200
    and char_length(coalesce(pekerjaan_ibu, '')) <= 200 and char_length(coalesce(pekerjaan_bapa, '')) <= 200
    and char_length(coalesce(sebab_lain, '')) <= 200 and char_length(coalesce(bank_nama_pemegang, '')) <= 200
    and char_length(coalesce(bank_nama, '')) <= 200
  ),
  constraint bantuan_penerangan_pendek check (char_length(coalesce(penerangan, '')) <= 3000)
);

create index if not exists bantuan_applications_member_idx on public.bantuan_applications (member_id);
create index if not exists bantuan_applications_status_idx on public.bantuan_applications (status, dihantar_at);

drop trigger if exists bantuan_applications_set_updated_at on public.bantuan_applications;
create trigger bantuan_applications_set_updated_at
  before update on public.bantuan_applications
  for each row execute function public.set_updated_at();

create table if not exists public.bantuan_info_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.bantuan_applications (id) on delete cascade,
  mesej          text not null,
  diminta_oleh   uuid,
  created_at     timestamptz not null default now(),
  respons        text,                                         -- draf sementara sehingga dihantar semula
  responded_at   timestamptz
);
create index if not exists bantuan_info_requests_app_idx on public.bantuan_info_requests (application_id, created_at);

-- Sejarah tindakan. `terlihat_ahli` menentukan sama ada ahli boleh melihat baris itu.
create table if not exists public.bantuan_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.bantuan_applications (id) on delete cascade,
  actor_user_id  uuid,
  actor_nama     text,
  tindakan       text not null,
  status_dari    text,
  status_ke      text,
  alasan         text,                                         -- hanya teks yang sesuai dilihat penerima baris
  perubahan      jsonb,                                        -- hanya baris admin
  terlihat_ahli  boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists bantuan_history_app_idx on public.bantuan_history (application_id, created_at);

-- Nota dalaman / alasan dalaman — admin sahaja.
create table if not exists public.bantuan_admin_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.bantuan_applications (id) on delete cascade,
  penulis        uuid,
  penulis_nama   text,
  jenis          text not null default 'nota' check (jenis in ('nota','alasan_kelulusan','alasan_penolakan')),
  isi            text not null,
  created_at     timestamptz not null default now()
);
create index if not exists bantuan_admin_notes_app_idx on public.bantuan_admin_notes (application_id, created_at);

-- -----------------------------------------------------------------------------
-- 3. Pembantu akses (security definer — elak rekursi RLS)
-- -----------------------------------------------------------------------------

create or replace function public.bantuan_owner_of(p_app uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.bantuan_applications a
    where a.id = p_app and a.member_id = public.my_member_id() and public.my_member_id() is not null
  );
$$;

create or replace function public.bantuan_admin_can_see(p_app uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_view_bantuan_admin()
     and exists (
       select 1 from public.bantuan_applications a
       where a.id = p_app
         and a.status <> 'draft'
         and a.member_id is distinct from public.my_member_id()
     );
$$;

revoke all on function public.bantuan_owner_of(uuid) from public, anon;
revoke all on function public.bantuan_admin_can_see(uuid) from public, anon;
grant execute on function public.bantuan_owner_of(uuid) to authenticated;
grant execute on function public.bantuan_admin_can_see(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS — SELECT sahaja; tiada INSERT/UPDATE/DELETE langsung
-- -----------------------------------------------------------------------------

alter table public.bantuan_applications  enable row level security;
alter table public.bantuan_info_requests enable row level security;
alter table public.bantuan_history       enable row level security;
alter table public.bantuan_admin_notes   enable row level security;

revoke all on table public.bantuan_applications, public.bantuan_info_requests,
  public.bantuan_history, public.bantuan_admin_notes from public, anon, authenticated;
grant select on table public.bantuan_applications, public.bantuan_info_requests,
  public.bantuan_history, public.bantuan_admin_notes to authenticated;

drop policy if exists bantuan_applications_select on public.bantuan_applications;
create policy bantuan_applications_select on public.bantuan_applications
  for select to authenticated
  using (
    (member_id = public.my_member_id() and public.my_member_id() is not null)
    or (status <> 'draft' and member_id is distinct from public.my_member_id() and public.can_view_bantuan_admin())
  );

drop policy if exists bantuan_info_requests_select on public.bantuan_info_requests;
create policy bantuan_info_requests_select on public.bantuan_info_requests
  for select to authenticated
  using (public.bantuan_owner_of(application_id) or public.bantuan_admin_can_see(application_id));

drop policy if exists bantuan_history_select on public.bantuan_history;
create policy bantuan_history_select on public.bantuan_history
  for select to authenticated
  using (
    (terlihat_ahli and public.bantuan_owner_of(application_id))
    or public.bantuan_admin_can_see(application_id)
  );

drop policy if exists bantuan_admin_notes_select on public.bantuan_admin_notes;
create policy bantuan_admin_notes_select on public.bantuan_admin_notes
  for select to authenticated
  using (public.bantuan_admin_can_see(application_id));

-- -----------------------------------------------------------------------------
-- 5. Fungsi dalaman (TIDAK diberi kepada authenticated)
-- -----------------------------------------------------------------------------

create or replace function public.bantuan_log(
  p_app uuid, p_tindakan text, p_dari text, p_ke text, p_alasan text,
  p_terlihat boolean, p_perubahan jsonb default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_nama text;
begin
  select m.full_name into v_nama from public.members m where m.id = public.my_member_id();
  insert into public.bantuan_history
    (application_id, actor_user_id, actor_nama, tindakan, status_dari, status_ke, alasan, terlihat_ahli, perubahan)
  values
    (p_app, auth.uid(), v_nama, p_tindakan, p_dari, p_ke, p_alasan, p_terlihat, p_perubahan);
end;
$$;
revoke all on function public.bantuan_log(uuid, text, text, text, text, boolean, jsonb) from public, anon, authenticated;

create or replace function public.bantuan_diff(p_lama jsonb, p_baru jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('dari', p_lama -> k, 'kepada', p_baru -> k)), '{}'::jsonb)
  from (
    select key as k from jsonb_each(coalesce(p_baru, '{}'::jsonb))
    union
    select key from jsonb_each(coalesce(p_lama, '{}'::jsonb))
  ) keys
  where (p_lama -> k) is distinct from (p_baru -> k);
$$;
revoke all on function public.bantuan_diff(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.bantuan_snapshot(p_app public.bantuan_applications)
returns jsonb
language sql immutable
as $$
  select to_jsonb(p_app) - array[
    'id','no_rujukan','member_id','status','versi','created_at','updated_at','snapshot_hantar',
    'jumlah_diluluskan','mesej_keputusan','sebab_tolak_kategori','sebab_tolak_penjelasan',
    'diputuskan_oleh','diputuskan_at','dihantar_at','pertama_dihantar_at','pengakuan_at'
  ];
$$;
revoke all on function public.bantuan_snapshot(public.bantuan_applications) from public, anon, authenticated;


-- Semakan lengkap sebelum hantar. Mesej dalam Bahasa Melayu untuk dipapar terus.
create or replace function public.bantuan_validate(a public.bantuan_applications)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Kedua-dua borang
  if char_length(coalesce(btrim(a.nama_pemohon), '')) < 2 then
    raise exception 'Sila isi nama penuh.' using errcode = '22023';
  end if;
  if coalesce(btrim(a.telefon), '') !~ '^[0-9+ -]{8,20}$' then
    raise exception 'Sila isi nombor telefon yang sah.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.generasi), '')) < 1 then
    raise exception 'Sila pilih generasi.' using errcode = '22023';
  end if;
  if a.status_diri is null then
    raise exception 'Sila pilih status.' using errcode = '22023';
  end if;
  if a.status_diri = 'lain_lain' and char_length(coalesce(btrim(a.status_diri_lain), '')) < 2 then
    raise exception 'Sila nyatakan status anda.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.tempat_menetap), '')) < 3 then
    raise exception 'Sila isi tempat menetap terkini.' using errcode = '22023';
  end if;
  if a.tahap_pendidikan = 'lain_lain' and char_length(coalesce(btrim(a.tahap_pendidikan_lain), '')) < 2 then
    raise exception 'Sila nyatakan tahap pendidikan.' using errcode = '22023';
  end if;
  if a.pendapatan_keluarga is null then
    raise exception 'Sila isi jumlah pendapatan keluarga (boleh RM0).' using errcode = '22023';
  end if;
  if a.bil_tanggungan is null then
    raise exception 'Sila isi bilangan tanggungan keluarga.' using errcode = '22023';
  end if;
  if coalesce(array_length(a.sebab_keperluan, 1), 0) = 0 then
    raise exception 'Sila pilih sekurang-kurangnya satu sebab keperluan.' using errcode = '22023';
  end if;
  if 'lain_lain' = any (a.sebab_keperluan) and char_length(coalesce(btrim(a.sebab_lain), '')) < 2 then
    raise exception 'Sila nyatakan sebab keperluan lain.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.penerangan), '')) < 20 then
    raise exception 'Sila terangkan tujuan keperluan dengan lebih lanjut (sekurang-kurangnya 20 aksara).' using errcode = '22023';
  end if;
  if a.pernah_terima is null then
    raise exception 'Sila nyatakan sama ada anda pernah menerima bantuan zakat sebelum ini.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.bank_nama_pemegang), '')) < 2 then
    raise exception 'Sila isi nama pemegang akaun.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.bank_nama), '')) < 2 then
    raise exception 'Sila isi nama bank.' using errcode = '22023';
  end if;
  if a.bank_no_akaun is null then
    raise exception 'Sila isi nombor akaun bank yang sah (6 hingga 20 digit).' using errcode = '22023';
  end if;

  if a.kategori = 'belajar' then
    if a.tahap_pendidikan is null then
      raise exception 'Sila pilih tahap pendidikan.' using errcode = '22023';
    end if;
    if a.tinggal_di is null then
      raise exception 'Sila pilih tempat tinggal semasa belajar.' using errcode = '22023';
    end if;
    if a.tinggal_di = 'lain_lain' and char_length(coalesce(btrim(a.tinggal_di_lain), '')) < 2 then
      raise exception 'Sila nyatakan tempat tinggal anda.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.tahun_pengajian), '')) < 1 then
      raise exception 'Sila isi tahun pengajian.' using errcode = '22023';
    end if;
    if coalesce(array_length(a.pembiayaan, 1), 0) = 0 then
      raise exception 'Sila pilih sekurang-kurangnya satu sumber pembiayaan pelajaran.' using errcode = '22023';
    end if;
    if 'lain_lain' = any (a.pembiayaan) and char_length(coalesce(btrim(a.pembiayaan_lain), '')) < 2 then
      raise exception 'Sila nyatakan sumber pembiayaan lain.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.pekerjaan_ibu), '')) < 2 or char_length(coalesce(btrim(a.pekerjaan_bapa), '')) < 2 then
      raise exception 'Sila isi pekerjaan ibu dan bapa.' using errcode = '22023';
    end if;
    if a.anak_ke is null or a.bil_adik_beradik is null then
      raise exception 'Sila isi kedudukan anak dan bilangan adik beradik.' using errcode = '22023';
    end if;
    if a.anak_ke > a.bil_adik_beradik then
      raise exception 'Kedudukan anak tidak boleh melebihi bilangan adik beradik.' using errcode = '22023';
    end if;
  else
    if char_length(coalesce(btrim(a.pekerjaan), '')) < 2 then
      raise exception 'Sila isi pekerjaan anda.' using errcode = '22023';
    end if;
    if a.pendapatan_pemohon is null then
      raise exception 'Sila isi jumlah pendapatan bulanan anda (boleh RM0).' using errcode = '22023';
    end if;
    if a.status_diri = 'berkahwin' then
      if a.bil_anak is null then
        raise exception 'Sila isi bilangan anak (boleh 0).' using errcode = '22023';
      end if;
    elsif a.status_diri = 'bujang' then
      if char_length(coalesce(btrim(a.pekerjaan_ibu), '')) < 2 or char_length(coalesce(btrim(a.pekerjaan_bapa), '')) < 2 then
        raise exception 'Sila isi pekerjaan ibu dan bapa.' using errcode = '22023';
      end if;
      if a.bil_adik_beradik is null then
        raise exception 'Sila isi bilangan adik beradik.' using errcode = '22023';
      end if;
    end if;
  end if;

  if not a.pengakuan_setuju then
    raise exception 'Sila tandakan pengakuan sebelum menghantar.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.bantuan_validate(public.bantuan_applications) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC ahli
-- -----------------------------------------------------------------------------

create or replace function public.bantuan_save_draft(p_id uuid, p_data jsonb)
returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  me  uuid := public.my_member_id();
  app public.bantuan_applications;
begin
  if me is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  if public.my_account_suspended() then
    raise exception 'Akaun anda digantung.' using errcode = '42501';
  end if;
  if p_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Data permohonan tidak sah.' using errcode = '22023';
  end if;

  select * into app from public.bantuan_applications where id = p_id for update;
  if not found then
    if coalesce(p_data->>'kategori', '') not in ('belajar', 'bekerja') then
      raise exception 'Sila pilih jenis permohonan.' using errcode = '22023';
    end if;
    insert into public.bantuan_applications (id, member_id, kategori)
    values (p_id, me, p_data->>'kategori')
    on conflict (id) do nothing;
    select * into app from public.bantuan_applications where id = p_id for update;
  end if;

  if app.member_id <> me then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.status not in ('draft', 'needs_information') then
    raise exception 'Permohonan tidak boleh diubah pada status ini.' using errcode = '55000';
  end if;

  update public.bantuan_applications a
     set
           nama_pemohon = case when p_data ? 'nama_pemohon' then nullif(btrim(p_data->>'nama_pemohon'), '') else a.nama_pemohon end,
           telefon = case when p_data ? 'telefon' then nullif(btrim(p_data->>'telefon'), '') else a.telefon end,
           generasi = case when p_data ? 'generasi' then nullif(btrim(p_data->>'generasi'), '') else a.generasi end,
           status_diri = case when p_data ? 'status_diri' then nullif(btrim(p_data->>'status_diri'), '') else a.status_diri end,
           status_diri_lain = case when p_data ? 'status_diri_lain' then nullif(btrim(p_data->>'status_diri_lain'), '') else a.status_diri_lain end,
           tempat_menetap = case when p_data ? 'tempat_menetap' then nullif(btrim(p_data->>'tempat_menetap'), '') else a.tempat_menetap end,
           tahap_pendidikan = case when p_data ? 'tahap_pendidikan' then nullif(btrim(p_data->>'tahap_pendidikan'), '') else a.tahap_pendidikan end,
           tahap_pendidikan_lain = case when p_data ? 'tahap_pendidikan_lain' then nullif(btrim(p_data->>'tahap_pendidikan_lain'), '') else a.tahap_pendidikan_lain end,
           tinggal_di = case when p_data ? 'tinggal_di' then nullif(btrim(p_data->>'tinggal_di'), '') else a.tinggal_di end,
           tinggal_di_lain = case when p_data ? 'tinggal_di_lain' then nullif(btrim(p_data->>'tinggal_di_lain'), '') else a.tinggal_di_lain end,
           tahun_pengajian = case when p_data ? 'tahun_pengajian' then nullif(btrim(p_data->>'tahun_pengajian'), '') else a.tahun_pengajian end,
           pembiayaan_lain = case when p_data ? 'pembiayaan_lain' then nullif(btrim(p_data->>'pembiayaan_lain'), '') else a.pembiayaan_lain end,
           pekerjaan = case when p_data ? 'pekerjaan' then nullif(btrim(p_data->>'pekerjaan'), '') else a.pekerjaan end,
           pekerjaan_ibu = case when p_data ? 'pekerjaan_ibu' then nullif(btrim(p_data->>'pekerjaan_ibu'), '') else a.pekerjaan_ibu end,
           pekerjaan_bapa = case when p_data ? 'pekerjaan_bapa' then nullif(btrim(p_data->>'pekerjaan_bapa'), '') else a.pekerjaan_bapa end,
           sebab_lain = case when p_data ? 'sebab_lain' then nullif(btrim(p_data->>'sebab_lain'), '') else a.sebab_lain end,
           penerangan = case when p_data ? 'penerangan' then nullif(btrim(p_data->>'penerangan'), '') else a.penerangan end,
           bank_nama_pemegang = case when p_data ? 'bank_nama_pemegang' then nullif(btrim(p_data->>'bank_nama_pemegang'), '') else a.bank_nama_pemegang end,
           bank_nama = case when p_data ? 'bank_nama' then nullif(btrim(p_data->>'bank_nama'), '') else a.bank_nama end,
           pendapatan_pemohon = case when p_data ? 'pendapatan_pemohon' then nullif(btrim(p_data->>'pendapatan_pemohon'), '')::numeric(12,2) else a.pendapatan_pemohon end,
           pendapatan_keluarga = case when p_data ? 'pendapatan_keluarga' then nullif(btrim(p_data->>'pendapatan_keluarga'), '')::numeric(12,2) else a.pendapatan_keluarga end,
           bil_tanggungan = case when p_data ? 'bil_tanggungan' then nullif(btrim(p_data->>'bil_tanggungan'), '')::integer else a.bil_tanggungan end,
           anak_ke = case when p_data ? 'anak_ke' then nullif(btrim(p_data->>'anak_ke'), '')::integer else a.anak_ke end,
           bil_adik_beradik = case when p_data ? 'bil_adik_beradik' then nullif(btrim(p_data->>'bil_adik_beradik'), '')::integer else a.bil_adik_beradik end,
           bil_anak = case when p_data ? 'bil_anak' then nullif(btrim(p_data->>'bil_anak'), '')::integer else a.bil_anak end,
           pernah_terima = case when p_data ? 'pernah_terima' then nullif(btrim(p_data->>'pernah_terima'), '')::boolean else a.pernah_terima end,
           pengakuan_setuju = case when p_data ? 'pengakuan_setuju' then nullif(btrim(p_data->>'pengakuan_setuju'), '')::boolean else a.pengakuan_setuju end,
           pembiayaan = case when p_data ? 'pembiayaan' then (case when jsonb_typeof(p_data->'pembiayaan') = 'array' then array(select jsonb_array_elements_text(p_data->'pembiayaan')) else null end) else a.pembiayaan end,
           sebab_keperluan = case when p_data ? 'sebab_keperluan' then (case when jsonb_typeof(p_data->'sebab_keperluan') = 'array' then array(select jsonb_array_elements_text(p_data->'sebab_keperluan')) else null end) else a.sebab_keperluan end,
           bank_no_akaun = case when p_data ? 'bank_no_akaun' then nullif(regexp_replace(coalesce(p_data->>'bank_no_akaun', ''), '[^0-9]', '', 'g'), '') else a.bank_no_akaun end,
           kategori = case
             when a.status = 'draft' and coalesce(p_data->>'kategori', '') in ('belajar', 'bekerja')
               then p_data->>'kategori'
             else a.kategori end,
           versi = a.versi + 1
   where a.id = p_id
   returning a.* into app;

  return app;
end;
$$;

create or replace function public.bantuan_save_response(p_id uuid, p_respons text)
returns public.bantuan_info_requests
language plpgsql security definer set search_path = public
as $$
declare
  me  uuid := public.my_member_id();
  app public.bantuan_applications;
  req public.bantuan_info_requests;
begin
  if me is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  select * into app from public.bantuan_applications where id = p_id for update;
  if not found or app.member_id <> me then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.status <> 'needs_information' then
    raise exception 'Tiada permintaan maklumat tambahan yang menunggu respons.' using errcode = '55000';
  end if;
  if char_length(coalesce(p_respons, '')) > 3000 then
    raise exception 'Respons terlalu panjang (maksimum 3000 aksara).' using errcode = '22023';
  end if;

  update public.bantuan_info_requests r
     set respons = nullif(btrim(p_respons), '')
   where r.id = (
     select x.id from public.bantuan_info_requests x
      where x.application_id = p_id and x.responded_at is null
      order by x.created_at desc limit 1
   )
   returning r.* into req;
  if not found then
    raise exception 'Tiada permintaan maklumat tambahan yang menunggu respons.' using errcode = '55000';
  end if;
  return req;
end;
$$;

create or replace function public.bantuan_submit(p_id uuid, p_respons text default null)
returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  me       uuid := public.my_member_id();
  app      public.bantuan_applications;
  v_req    public.bantuan_info_requests;
  v_resp   text;
  v_semula boolean;
  v_snap   jsonb;
  v_lama   jsonb;
  v_diff   jsonb;
  v_tahun  integer := extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::integer;
  v_no     integer;
begin
  if me is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  if public.my_account_suspended() then
    raise exception 'Akaun anda digantung.' using errcode = '42501';
  end if;

  select * into app from public.bantuan_applications where id = p_id for update;
  if not found or app.member_id <> me then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;

  -- Klik berganda: permohonan sudah dihantar — pulangkan tanpa menghasilkan apa-apa yang baharu.
  if app.status = 'submitted' then
    return app;
  end if;
  if app.status not in ('draft', 'needs_information') then
    raise exception 'Permohonan tidak boleh dihantar pada status ini.' using errcode = '55000';
  end if;

  v_semula := app.status = 'needs_information';

  -- Pengakuan dibuat semula pada setiap penghantaran.
  perform public.bantuan_validate(app);

  if v_semula then
    select * into v_req from public.bantuan_info_requests r
     where r.application_id = p_id and r.responded_at is null
     order by r.created_at desc limit 1 for update;
    if not found then
      raise exception 'Tiada permintaan maklumat tambahan yang menunggu respons.' using errcode = '55000';
    end if;
    v_resp := btrim(coalesce(p_respons, v_req.respons, ''));
    if char_length(v_resp) < 5 then
      raise exception 'Sila tulis respons kepada permintaan maklumat tambahan.' using errcode = '22023';
    end if;
    if char_length(v_resp) > 3000 then
      raise exception 'Respons terlalu panjang (maksimum 3000 aksara).' using errcode = '22023';
    end if;
    update public.bantuan_info_requests set respons = v_resp, responded_at = now() where id = v_req.id;
  end if;

  v_snap := public.bantuan_snapshot(app);
  v_lama := app.snapshot_hantar;

  if app.no_rujukan is null then
    insert into public.bantuan_counters as c (tahun, terakhir) values (v_tahun, 1)
    on conflict (tahun) do update set terakhir = c.terakhir + 1
    returning c.terakhir into v_no;
    app.no_rujukan := 'BNT-' || v_tahun::text || '-' || lpad(v_no::text, 6, '0');
  end if;

  update public.bantuan_applications a
     set status = 'submitted',
         no_rujukan = app.no_rujukan,
         pertama_dihantar_at = coalesce(a.pertama_dihantar_at, now()),
         dihantar_at = now(),
         pengakuan_at = now(),
         snapshot_hantar = v_snap,
         versi = a.versi + 1
   where a.id = p_id
   returning a.* into app;

  if v_semula then
    perform public.bantuan_log(p_id, 'dihantar_semula', 'needs_information', 'submitted', null, true);
    -- Rekod perubahan antara penghantaran terdahulu dan ini (admin sahaja).
    v_diff := public.bantuan_diff(v_lama, v_snap);
    if v_diff <> '{}'::jsonb then
      perform public.bantuan_log(p_id, 'pindaan', 'needs_information', 'submitted', null, false, v_diff);
    end if;
  else
    perform public.bantuan_log(p_id, 'dihantar', 'draft', 'submitted', null, true);
  end if;

  return app;
end;
$$;

revoke all on function public.bantuan_save_draft(uuid, jsonb) from public, anon;
revoke all on function public.bantuan_save_response(uuid, text) from public, anon;
revoke all on function public.bantuan_submit(uuid, text) from public, anon;
grant execute on function public.bantuan_save_draft(uuid, jsonb) to authenticated;
grant execute on function public.bantuan_save_response(uuid, text) to authenticated;
grant execute on function public.bantuan_submit(uuid, text) to authenticated;

-- Bilangan permohonan yang memerlukan tindakan ahli (lencana menu).
create or replace function public.bantuan_perlu_tindakan()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.bantuan_applications a
   where a.member_id = public.my_member_id() and a.status = 'needs_information';
$$;
revoke all on function public.bantuan_perlu_tindakan() from public, anon;
grant execute on function public.bantuan_perlu_tindakan() to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC admin
-- -----------------------------------------------------------------------------

-- Kunci + semakan dikongsi semua tindakan admin yang mengubah status.
create or replace function public.bantuan_lock_admin(p_id uuid, p_versi integer, p_allowed text[])
returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  me  uuid := public.my_member_id();
  app public.bantuan_applications;
begin
  if not public.can_decide_bantuan() then
    raise exception 'Anda tidak dibenarkan membuat tindakan ini.' using errcode = '42501';
  end if;
  if me is null then
    raise exception 'Akaun admin anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;

  select * into app from public.bantuan_applications where id = p_id for update;
  if not found or app.status = 'draft' then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.member_id = me then
    raise exception 'Anda tidak boleh menyemak atau membuat keputusan terhadap permohonan sendiri. Semakan ini memerlukan pentadbir lain yang diberi kuasa.'
      using errcode = '42501';
  end if;
  if app.versi is distinct from p_versi then
    raise exception 'Permohonan telah dikemas kini. Sila muat semula halaman untuk melihat keadaan terkini.'
      using errcode = '40001';
  end if;
  if not (app.status = any (p_allowed)) then
    raise exception 'Tindakan ini tidak dibenarkan pada status semasa permohonan.' using errcode = '55000';
  end if;
  return app;
end;
$$;
revoke all on function public.bantuan_lock_admin(uuid, integer, text[]) from public, anon, authenticated;

create or replace function public.bantuan_mulakan_semakan(p_id uuid, p_versi integer)
returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  app public.bantuan_applications;
begin
  app := public.bantuan_lock_admin(p_id, p_versi, array['submitted']);
  update public.bantuan_applications a
     set status = 'under_review', versi = a.versi + 1
   where a.id = p_id returning a.* into app;
  perform public.bantuan_log(p_id, 'mula_semakan', 'submitted', 'under_review', null, true);
  return app;
end;
$$;

create or replace function public.bantuan_minta_maklumat(p_id uuid, p_versi integer, p_mesej text)
returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  app public.bantuan_applications;
  v_mesej text := btrim(coalesce(p_mesej, ''));
begin
  if char_length(v_mesej) < 10 then
    raise exception 'Sila terangkan maklumat yang diperlukan (sekurang-kurangnya 10 aksara).' using errcode = '22023';
  end if;
  if char_length(v_mesej) > 2000 then
    raise exception 'Mesej terlalu panjang (maksimum 2000 aksara).' using errcode = '22023';
  end if;
  app := public.bantuan_lock_admin(p_id, p_versi, array['under_review']);
  insert into public.bantuan_info_requests (application_id, mesej, diminta_oleh)
  values (p_id, v_mesej, auth.uid());
  update public.bantuan_applications a
     set status = 'needs_information', versi = a.versi + 1
   where a.id = p_id returning a.* into app;
  perform public.bantuan_log(p_id, 'minta_maklumat', 'under_review', 'needs_information', null, true);
  return app;
end;
$$;

create or replace function public.bantuan_luluskan(
  p_id uuid, p_versi integer, p_jumlah numeric, p_alasan_dalaman text, p_mesej text
) returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  app      public.bantuan_applications;
  v_alasan text := btrim(coalesce(p_alasan_dalaman, ''));
  v_mesej  text := btrim(coalesce(p_mesej, ''));
  v_nama   text;
begin
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah diluluskan mesti lebih daripada RM0.' using errcode = '22023';
  end if;
  if char_length(v_alasan) < 5 then
    raise exception 'Sila isi alasan kelulusan dalaman.' using errcode = '22023';
  end if;
  if char_length(v_mesej) < 5 then
    raise exception 'Sila tulis mesej ringkas kepada pemohon.' using errcode = '22023';
  end if;
  if char_length(v_mesej) > 2000 or char_length(v_alasan) > 3000 then
    raise exception 'Teks terlalu panjang.' using errcode = '22023';
  end if;
  if p_jumlah > 1000000 then
    raise exception 'Jumlah diluluskan terlalu besar.' using errcode = '22023';
  end if;
  app := public.bantuan_lock_admin(p_id, p_versi, array['under_review']);

  update public.bantuan_applications a
     set status = 'approved',
         jumlah_diluluskan = round(p_jumlah, 2),
         mesej_keputusan = v_mesej,
         diputuskan_oleh = auth.uid(),
         diputuskan_at = now(),
         versi = a.versi + 1
   where a.id = p_id returning a.* into app;

  select m.full_name into v_nama from public.members m where m.id = public.my_member_id();
  insert into public.bantuan_admin_notes (application_id, penulis, penulis_nama, jenis, isi)
  values (p_id, auth.uid(), v_nama, 'alasan_kelulusan', v_alasan);
  perform public.bantuan_log(p_id, 'diluluskan', 'under_review', 'approved', null, true);
  return app;
end;
$$;

create or replace function public.bantuan_tolak(
  p_id uuid, p_versi integer, p_kategori text, p_penjelasan text, p_alasan_dalaman text default null
) returns public.bantuan_applications
language plpgsql security definer set search_path = public
as $$
declare
  app         public.bantuan_applications;
  v_penjelasan text := btrim(coalesce(p_penjelasan, ''));
  v_alasan    text := btrim(coalesce(p_alasan_dalaman, ''));
  v_nama      text;
begin
  if coalesce(p_kategori, '') not in ('luar_skop', 'tidak_dapat_disahkan', 'telah_ditampung', 'lain_lain') then
    raise exception 'Sila pilih kategori sebab.' using errcode = '22023';
  end if;
  if char_length(v_penjelasan) < 10 then
    raise exception 'Sila beri penjelasan yang sopan dan boleh difahami pemohon (sekurang-kurangnya 10 aksara).' using errcode = '22023';
  end if;
  if char_length(v_penjelasan) > 2000 or char_length(v_alasan) > 3000 then
    raise exception 'Teks terlalu panjang.' using errcode = '22023';
  end if;
  app := public.bantuan_lock_admin(p_id, p_versi, array['under_review']);

  update public.bantuan_applications a
     set status = 'rejected',
         sebab_tolak_kategori = p_kategori,
         sebab_tolak_penjelasan = v_penjelasan,
         diputuskan_oleh = auth.uid(),
         diputuskan_at = now(),
         versi = a.versi + 1
   where a.id = p_id returning a.* into app;

  if v_alasan <> '' then
    select m.full_name into v_nama from public.members m where m.id = public.my_member_id();
    insert into public.bantuan_admin_notes (application_id, penulis, penulis_nama, jenis, isi)
    values (p_id, auth.uid(), v_nama, 'alasan_penolakan', v_alasan);
  end if;
  perform public.bantuan_log(p_id, 'ditolak', 'under_review', 'rejected', null, true);
  return app;
end;
$$;

-- Nota dalaman: tidak menukar status, jadi tidak menaikkan `versi` dan tidak bertembung dengan keputusan.
create or replace function public.bantuan_tambah_nota(p_id uuid, p_nota text)
returns public.bantuan_admin_notes
language plpgsql security definer set search_path = public
as $$
declare
  me     uuid := public.my_member_id();
  app    public.bantuan_applications;
  v_nota text := btrim(coalesce(p_nota, ''));
  v_nama text;
  n      public.bantuan_admin_notes;
begin
  if not public.can_decide_bantuan() then
    raise exception 'Anda tidak dibenarkan membuat tindakan ini.' using errcode = '42501';
  end if;
  if me is null then
    raise exception 'Akaun admin anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  if char_length(v_nota) < 2 or char_length(v_nota) > 3000 then
    raise exception 'Nota mesti antara 2 hingga 3000 aksara.' using errcode = '22023';
  end if;
  select * into app from public.bantuan_applications where id = p_id;
  if not found or app.status = 'draft' then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.member_id = me then
    raise exception 'Anda tidak boleh menyemak permohonan sendiri.' using errcode = '42501';
  end if;
  select m.full_name into v_nama from public.members m where m.id = me;
  insert into public.bantuan_admin_notes (application_id, penulis, penulis_nama, jenis, isi)
  values (p_id, auth.uid(), v_nama, 'nota', v_nota)
  returning * into n;
  perform public.bantuan_log(p_id, 'nota', app.status, app.status, null, false);
  return n;
end;
$$;

revoke all on function public.bantuan_mulakan_semakan(uuid, integer) from public, anon;
revoke all on function public.bantuan_minta_maklumat(uuid, integer, text) from public, anon;
revoke all on function public.bantuan_luluskan(uuid, integer, numeric, text, text) from public, anon;
revoke all on function public.bantuan_tolak(uuid, integer, text, text, text) from public, anon;
revoke all on function public.bantuan_tambah_nota(uuid, text) from public, anon;
grant execute on function public.bantuan_mulakan_semakan(uuid, integer) to authenticated;
grant execute on function public.bantuan_minta_maklumat(uuid, integer, text) to authenticated;
grant execute on function public.bantuan_luluskan(uuid, integer, numeric, text, text) to authenticated;
grant execute on function public.bantuan_tolak(uuid, integer, text, text, text) to authenticated;
grant execute on function public.bantuan_tambah_nota(uuid, text) to authenticated;


-- Senarai admin: carian, penapis, penanda hantar semula + kemungkinan pertindihan
-- (permohonan lain pemohon yang sama pada bulan kalendar yang sama — hanya penanda).
create or replace function public.bantuan_admin_list(
  p_cari     text default null,
  p_kategori text default null,
  p_status   text default null,
  p_dari     date default null,
  p_hingga   date default null,
  p_had      integer default 200
) returns table (
  id uuid, no_rujukan text, nama_pemohon text, generasi text,
  kategori text, status text,
  pendapatan_keluarga numeric, jumlah_diluluskan numeric,
  dihantar_at timestamptz, dihantar_semula boolean, pertindihan boolean, versi integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := public.my_member_id();
begin
  if not public.can_view_bantuan_admin() then
    raise exception 'Anda tidak dibenarkan melihat permohonan bantuan.' using errcode = '42501';
  end if;
  return query
  select a.id, a.no_rujukan, a.nama_pemohon, a.generasi, a.kategori, a.status,
         a.pendapatan_keluarga, a.jumlah_diluluskan, a.dihantar_at,
         exists (select 1 from public.bantuan_history h where h.application_id = a.id and h.tindakan = 'dihantar_semula'),
         exists (
           select 1 from public.bantuan_applications b
            where b.member_id = a.member_id and b.id <> a.id
              and b.status in ('submitted', 'under_review', 'needs_information', 'approved')
              and date_trunc('month', b.pertama_dihantar_at at time zone 'Asia/Kuala_Lumpur')
                  = date_trunc('month', a.pertama_dihantar_at at time zone 'Asia/Kuala_Lumpur')
         ),
         a.versi
    from public.bantuan_applications a
   where a.status <> 'draft'
     and a.member_id is distinct from me
     and (p_kategori is null or a.kategori = p_kategori)
     and (p_status is null or a.status = p_status)
     and (p_dari is null or (a.dihantar_at at time zone 'Asia/Kuala_Lumpur')::date >= p_dari)
     and (p_hingga is null or (a.dihantar_at at time zone 'Asia/Kuala_Lumpur')::date <= p_hingga)
     and (p_cari is null or btrim(p_cari) = ''
          or a.nama_pemohon ilike '%' || btrim(p_cari) || '%'
          or a.no_rujukan ilike '%' || btrim(p_cari) || '%')
   order by (case when a.status in ('submitted', 'under_review', 'needs_information') then 0 else 1 end),
            a.dihantar_at asc nulls last
   limit least(greatest(coalesce(p_had, 200), 1), 500);
end;
$$;

create or replace function public.bantuan_admin_ringkasan()
returns table (kunci text, jumlah integer)
language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := public.my_member_id();
begin
  if not public.can_view_bantuan_admin() then
    raise exception 'Anda tidak dibenarkan melihat permohonan bantuan.' using errcode = '42501';
  end if;
  return query
  select s.status, count(a.id)::integer
    from unnest(array['submitted','under_review','needs_information','approved','rejected']) as s(status)
    left join public.bantuan_applications a
      on a.status = s.status and a.member_id is distinct from me
   group by s.status;
end;
$$;

-- Permohonan terdahulu pemohon yang sama (untuk semakan sahaja). `jumlah_diluluskan`
-- BUKAN jumlah yang telah dibayar — pembayaran di luar skop modul ini.
create or replace function public.bantuan_admin_sebelum(p_id uuid)
returns table (
  id uuid, no_rujukan text, kategori text, sebab_keperluan text[], status text,
  jumlah_diluluskan numeric, dihantar_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid;
begin
  if not public.bantuan_admin_can_see(p_id) then
    raise exception 'Anda tidak dibenarkan melihat permohonan ini.' using errcode = '42501';
  end if;
  select a.member_id into v_member from public.bantuan_applications a where a.id = p_id;
  return query
  select b.id, b.no_rujukan, b.kategori, b.sebab_keperluan, b.status, b.jumlah_diluluskan, b.dihantar_at
    from public.bantuan_applications b
   where b.member_id = v_member and b.id <> p_id and b.status <> 'draft'
   order by b.dihantar_at desc nulls last;
end;
$$;

revoke all on function public.bantuan_admin_list(text, text, text, date, date, integer) from public, anon;
revoke all on function public.bantuan_admin_ringkasan() from public, anon;
revoke all on function public.bantuan_admin_sebelum(uuid) from public, anon;
grant execute on function public.bantuan_admin_list(text, text, text, date, date, integer) to authenticated;
grant execute on function public.bantuan_admin_ringkasan() to authenticated;
grant execute on function public.bantuan_admin_sebelum(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Notifikasi admin — tambah blok baharu pada `admin_notifications()`
--     (salinan 20261010000145 + blok 3). Kandungan SENGAJA hanya bilangan:
--     tiada nama, jumlah atau butiran kewangan/perubatan dalam notifikasi.
-- -----------------------------------------------------------------------------

create or replace function public.admin_notifications()
returns table (
  kind    text,
  title   text,
  preview text,
  jumlah  integer,
  terbaru timestamptz,
  route   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jumlah  integer;
  v_nama    text;
  v_bisnes  text;
  v_terbaru timestamptz;
begin
  -- 1. Iklan perniagaan menunggu semakan — LAJNAH EKONOMI DAN ASET (+ Super Admin).
  if public.can_view_business_ads_admin() then
    select count(*) into v_jumlah
    from public.member_business_ads a
    where a.status = 'menunggu';

    if v_jumlah > 0 then
      select m.full_name, a.nama_bisnes, a.submitted_at
        into v_nama, v_bisnes, v_terbaru
      from public.member_business_ads a
      join public.members m on m.id = a.member_id
      where a.status = 'menunggu'
      order by a.submitted_at desc, a.id
      limit 1;

      kind := 'iklan_menunggu';
      title := 'Iklan bisnes menunggu semakan';
      preview := v_nama || ' menghantar iklan "' || v_bisnes || '"'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/semakan-iklan';
      return next;
    end if;
  end if;

  -- 2. Permintaan padam akaun — Super Admin sahaja (sama dengan list_account_deletion_requests()).
  if public.is_super_admin() then
    select count(*), max(r.created_at) into v_jumlah, v_terbaru
    from public.account_deletion_requests r
    where r.status = 'pending';

    if v_jumlah > 0 then
      select m.full_name into v_nama
      from public.account_deletion_requests r
      join public.members m on m.id = r.member_id
      where r.status = 'pending'
      order by r.created_at desc
      limit 1;

      kind := 'padam_akaun';
      title := 'Permintaan padam akaun';
      preview := v_nama || ' memohon padam akaun'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/permintaan-padam-akaun';
      return next;
    end if;
  end if;

  -- 3. Permohonan bantuan menunggu semakan — TABUNG ZAKAT (+ Super Admin).
  --    Permohonan sendiri dikecualikan (admin tidak boleh menyemaknya).
  if public.can_view_bantuan_admin() then
    select count(*), max(a.dihantar_at) into v_jumlah, v_terbaru
    from public.bantuan_applications a
    where a.status = 'submitted'
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'bantuan_menunggu';
      title := 'Permohonan bantuan menunggu semakan';
      preview := v_jumlah || ' permohonan bantuan menunggu semakan.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/bantuan';
      return next;
    end if;
  end if;

  return;
end;
$$;

revoke all on function public.admin_notifications() from public, anon;
grant execute on function public.admin_notifications() to authenticated;

notify pgrst, 'reload schema';

