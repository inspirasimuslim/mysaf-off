-- =============================================================================
-- mysaf-off — Permohonan Bantuan (one-off) — 2026-10-13
--
-- Ahli memohon bantuan sekali beri; admin LAJNAH KEBAJIKAN menyemak dan
-- meluluskan / menolak. Tiada pembayaran, kutipan atau bantuan berkala dalam fasa ini.
-- Migration ini HANYA menambah (table, fungsi, bucket, polisi) dan menulis semula
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
--   * Akses admin = `has_department_access('LAJNAH KEBAJIKAN', ...)` (sama mekanisme
--     tab Kesihatan). Super Admin dirangkumi. Admin JABATAN DATA TIDAK mendapat akses.
--   * Pentadbir yang juga pemohon TIDAK boleh melihat butiran admin, menyemak atau
--     memutuskan permohonan sendiri (RLS + RPC). Tiada jalan pintas.
--   * Dokumen dalam bucket PERSENDIRIAN `bantuan-docs` (PDF/JPG/PNG, 5 MB, had dikuatkuasakan
--     oleh Storage). Bacaan hanya pemilik / admin yang dibenarkan, melalui URL bertandatangan.
--   * Persaingan: lajur `versi`. Setiap tindakan admin menghantar `versi` yang dilihatnya;
--     jika sudah berubah, tindakan ditolak dan admin diminta memuat semula.
--   * Klik berganda: `id` dijana oleh klien (draf tidak berganda); `bantuan_submit`
--     idempoten (hantar kali kedua memulangkan rekod sedia ada). Nombor rujukan dijana
--     dengan kaunter berkunci baris (selamat untuk pengguna serentak).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kebenaran
-- -----------------------------------------------------------------------------

create or replace function public.can_view_bantuan_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_department_access('LAJNAH KEBAJIKAN', false, uid); $$;

create or replace function public.can_decide_bantuan(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_department_access('LAJNAH KEBAJIKAN', true, uid); $$;

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
  kategori             text not null check (kategori in ('keluarga','pelajar')),
  tujuan               text,
  tujuan_lain          text,
  -- Salinan maklumat hubungan pada waktu permohonan (bukan rujukan ke profil).
  nama_pemohon         text,
  nombor_ahli_salin    text,
  telefon              text,
  alamat               text,
  keadaan              text,
  jumlah_dimohon       numeric(12,2) check (jumlah_dimohon is null or (jumlah_dimohon > 0 and jumlah_dimohon <= 1000000)),
  tahap_keperluan      text check (tahap_keperluan is null or tahap_keperluan in ('biasa','mendesak')),
  sebab_mendesak       text,
  tarikh_diperlukan    date,
  -- Kewangan ringkas. NULL = belum diberi (BUKAN sifar).
  status_pekerjaan     text check (status_pekerjaan is null or status_pekerjaan in
                         ('bekerja','bekerja_sendiri','tidak_bekerja','suri_rumah','pesara','pelajar','lain_lain')),
  pendapatan_jenis     text check (pendapatan_jenis is null or pendapatan_jenis in ('tetap','tidak_tetap','tidak_pasti')),
  pendapatan_isi_rumah numeric(12,2) check (pendapatan_isi_rumah is null or pendapatan_isi_rumah >= 0),
  pendapatan_catatan   text,
  bil_tanggungan       integer check (bil_tanggungan is null or (bil_tanggungan >= 0 and bil_tanggungan <= 50)),
  ringkasan_perbelanjaan text,
  bantuan_lain_ada     boolean,
  bantuan_lain_sumber  text,
  bantuan_lain_amaun   numeric(12,2) check (bantuan_lain_amaun is null or bantuan_lain_amaun >= 0),
  bantuan_lain_kekerapan text,
  -- Pelajar sahaja.
  pelajar_hubungan_pemohon text check (pelajar_hubungan_pemohon is null or pelajar_hubungan_pemohon in ('sendiri','penjaga')),
  pelajar_nama         text,
  pelajar_hubungan_ahli text,
  pelajar_institusi    text,
  pelajar_program      text,
  pelajar_tahun_semester text,
  pelajar_status_pengajian text check (pelajar_status_pengajian is null or pelajar_status_pengajian in
                         ('sedang_belajar','akan_mendaftar','tangguh','tamat')),
  pelajar_bantuan_sedia_ada text,
  -- Dokumen
  dokumen_tiada        boolean not null default false,
  dokumen_tiada_sebab  text,
  -- Pengakuan
  pengakuan_benar      boolean not null default false,
  pengakuan_proses     boolean not null default false,
  pengakuan_satu_kali  boolean not null default false,
  pengakuan_at         timestamptz,
  -- Penghantaran
  pertama_dihantar_at  timestamptz,
  dihantar_at          timestamptz,                            -- penghantaran TERAKHIR (juga semula)
  snapshot_hantar      jsonb,                                  -- medan borang pada penghantaran terakhir (untuk perbezaan pindaan)
  -- Keputusan (dipapar kepada ahli). Alasan DALAMAN berada dalam bantuan_admin_notes.
  jumlah_diluluskan    numeric(12,2) check (jumlah_diluluskan is null or jumlah_diluluskan > 0),
  mesej_keputusan      text,
  sebab_tolak_kategori text check (sebab_tolak_kategori is null or sebab_tolak_kategori in
                         ('luar_skop','tidak_dapat_disahkan','telah_ditampung','lain_lain')),
  sebab_tolak_penjelasan text,
  diputuskan_oleh      uuid,
  diputuskan_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bantuan_tujuan_sah check (
    tujuan is null
    or (kategori = 'keluarga' and tujuan in
          ('keperluan_harian','sewa_tempat_tinggal','rawatan_perubatan','kehilangan_pendapatan','kecemasan','lain_lain'))
    or (kategori = 'pelajar' and tujuan in
          ('yuran_pengajian','buku_peralatan','pengangkutan','penginapan_hidup','lain_lain'))
  ),
  constraint bantuan_diluluskan_tidak_lebih check (
    jumlah_diluluskan is null or jumlah_dimohon is null or jumlah_diluluskan <= jumlah_dimohon
  )
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

create table if not exists public.bantuan_documents (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.bantuan_applications (id) on delete cascade,
  info_request_id uuid references public.bantuan_info_requests (id) on delete set null,
  storage_path    text not null unique,
  nama_fail       text not null,
  mime            text not null check (mime in ('application/pdf','image/jpeg','image/png')),
  saiz_bait       bigint not null check (saiz_bait > 0 and saiz_bait <= 5242880),
  jenis           text not null default 'lain' check (jenis in ('pendapatan','bil','pengajian','lain')),
  created_at      timestamptz not null default now()
);
create index if not exists bantuan_documents_app_idx on public.bantuan_documents (application_id);

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
alter table public.bantuan_documents     enable row level security;
alter table public.bantuan_history       enable row level security;
alter table public.bantuan_admin_notes   enable row level security;

revoke all on table public.bantuan_applications, public.bantuan_info_requests, public.bantuan_documents,
  public.bantuan_history, public.bantuan_admin_notes from public, anon, authenticated;
grant select on table public.bantuan_applications, public.bantuan_info_requests, public.bantuan_documents,
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

drop policy if exists bantuan_documents_select on public.bantuan_documents;
create policy bantuan_documents_select on public.bantuan_documents
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
declare
  v_docs integer;
begin
  if char_length(coalesce(btrim(a.nama_pemohon), '')) < 2 then
    raise exception 'Sila isi nama pemohon.' using errcode = '22023';
  end if;
  if coalesce(btrim(a.telefon), '') !~ '^[0-9+ -]{8,20}$' then
    raise exception 'Sila isi nombor telefon yang sah.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.alamat), '')) < 5 then
    raise exception 'Sila isi alamat.' using errcode = '22023';
  end if;
  if a.tujuan is null then
    raise exception 'Sila pilih tujuan bantuan.' using errcode = '22023';
  end if;
  if a.tujuan = 'lain_lain' and char_length(coalesce(btrim(a.tujuan_lain), '')) < 3 then
    raise exception 'Sila nyatakan tujuan bantuan.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.keadaan), '')) < 20 then
    raise exception 'Sila terangkan keadaan dan sebab anda memerlukan bantuan (sekurang-kurangnya 20 aksara).' using errcode = '22023';
  end if;
  if a.jumlah_dimohon is null or a.jumlah_dimohon <= 0 then
    raise exception 'Sila isi anggaran jumlah yang diperlukan.' using errcode = '22023';
  end if;
  if a.tahap_keperluan is null then
    raise exception 'Sila pilih tahap keperluan.' using errcode = '22023';
  end if;
  if a.tahap_keperluan = 'mendesak' and char_length(coalesce(btrim(a.sebab_mendesak), '')) < 5 then
    raise exception 'Sila nyatakan sebab keperluan mendesak.' using errcode = '22023';
  end if;
  if a.status_pekerjaan is null then
    raise exception 'Sila pilih status pekerjaan.' using errcode = '22023';
  end if;
  if a.pendapatan_jenis is null then
    raise exception 'Sila pilih jenis pendapatan isi rumah.' using errcode = '22023';
  end if;
  if a.pendapatan_jenis = 'tetap' and a.pendapatan_isi_rumah is null then
    raise exception 'Sila isi pendapatan bulanan isi rumah (boleh RM0).' using errcode = '22023';
  end if;
  if a.pendapatan_jenis = 'tidak_pasti' and char_length(coalesce(btrim(a.pendapatan_catatan), '')) < 5 then
    raise exception 'Sila jelaskan keadaan pendapatan yang tidak pasti.' using errcode = '22023';
  end if;
  if a.bil_tanggungan is null then
    raise exception 'Sila isi bilangan tanggungan.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(a.ringkasan_perbelanjaan), '')) < 5 then
    raise exception 'Sila isi ringkasan keperluan atau perbelanjaan asas.' using errcode = '22023';
  end if;
  if a.bantuan_lain_ada is null then
    raise exception 'Sila nyatakan sama ada anda menerima bantuan lain.' using errcode = '22023';
  end if;
  if a.bantuan_lain_ada and char_length(coalesce(btrim(a.bantuan_lain_sumber), '')) < 2 then
    raise exception 'Sila nyatakan sumber bantuan lain yang diterima.' using errcode = '22023';
  end if;

  if a.kategori = 'pelajar' then
    if a.pelajar_hubungan_pemohon is null then
      raise exception 'Sila nyatakan sama ada anda pelajar atau penjaga.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.pelajar_nama), '')) < 2 then
      raise exception 'Sila isi nama pelajar.' using errcode = '22023';
    end if;
    if a.pelajar_hubungan_pemohon = 'penjaga' and char_length(coalesce(btrim(a.pelajar_hubungan_ahli), '')) < 2 then
      raise exception 'Sila nyatakan hubungan pelajar dengan anda.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.pelajar_institusi), '')) < 2 then
      raise exception 'Sila isi institusi pengajian.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.pelajar_program), '')) < 2 then
      raise exception 'Sila isi program atau peringkat pengajian.' using errcode = '22023';
    end if;
    if char_length(coalesce(btrim(a.pelajar_tahun_semester), '')) < 1 then
      raise exception 'Sila isi tahun atau semester.' using errcode = '22023';
    end if;
    if a.pelajar_status_pengajian is null then
      raise exception 'Sila pilih status pengajian.' using errcode = '22023';
    end if;
  end if;

  select count(*) into v_docs from public.bantuan_documents d where d.application_id = a.id;
  if v_docs = 0 and not a.dokumen_tiada then
    raise exception 'Sila muat naik sekurang-kurangnya satu dokumen sokongan, atau tandakan "Dokumen belum tersedia" dengan sebab.' using errcode = '22023';
  end if;
  if v_docs = 0 and a.dokumen_tiada and char_length(coalesce(btrim(a.dokumen_tiada_sebab), '')) < 5 then
    raise exception 'Sila nyatakan sebab dokumen belum tersedia.' using errcode = '22023';
  end if;

  if not (a.pengakuan_benar and a.pengakuan_proses and a.pengakuan_satu_kali) then
    raise exception 'Sila tandakan semua pengakuan sebelum menghantar.' using errcode = '22023';
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
    if coalesce(p_data->>'kategori', '') not in ('keluarga', 'pelajar') then
      raise exception 'Sila pilih kategori bantuan.' using errcode = '22023';
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
           nombor_ahli_salin = case when p_data ? 'nombor_ahli_salin' then nullif(btrim(p_data->>'nombor_ahli_salin'), '') else a.nombor_ahli_salin end,
           telefon = case when p_data ? 'telefon' then nullif(btrim(p_data->>'telefon'), '') else a.telefon end,
           alamat = case when p_data ? 'alamat' then nullif(btrim(p_data->>'alamat'), '') else a.alamat end,
           tujuan = case when p_data ? 'tujuan' then nullif(btrim(p_data->>'tujuan'), '') else a.tujuan end,
           tujuan_lain = case when p_data ? 'tujuan_lain' then nullif(btrim(p_data->>'tujuan_lain'), '') else a.tujuan_lain end,
           keadaan = case when p_data ? 'keadaan' then nullif(btrim(p_data->>'keadaan'), '') else a.keadaan end,
           tahap_keperluan = case when p_data ? 'tahap_keperluan' then nullif(btrim(p_data->>'tahap_keperluan'), '') else a.tahap_keperluan end,
           sebab_mendesak = case when p_data ? 'sebab_mendesak' then nullif(btrim(p_data->>'sebab_mendesak'), '') else a.sebab_mendesak end,
           status_pekerjaan = case when p_data ? 'status_pekerjaan' then nullif(btrim(p_data->>'status_pekerjaan'), '') else a.status_pekerjaan end,
           pendapatan_jenis = case when p_data ? 'pendapatan_jenis' then nullif(btrim(p_data->>'pendapatan_jenis'), '') else a.pendapatan_jenis end,
           pendapatan_catatan = case when p_data ? 'pendapatan_catatan' then nullif(btrim(p_data->>'pendapatan_catatan'), '') else a.pendapatan_catatan end,
           ringkasan_perbelanjaan = case when p_data ? 'ringkasan_perbelanjaan' then nullif(btrim(p_data->>'ringkasan_perbelanjaan'), '') else a.ringkasan_perbelanjaan end,
           bantuan_lain_sumber = case when p_data ? 'bantuan_lain_sumber' then nullif(btrim(p_data->>'bantuan_lain_sumber'), '') else a.bantuan_lain_sumber end,
           bantuan_lain_kekerapan = case when p_data ? 'bantuan_lain_kekerapan' then nullif(btrim(p_data->>'bantuan_lain_kekerapan'), '') else a.bantuan_lain_kekerapan end,
           pelajar_hubungan_pemohon = case when p_data ? 'pelajar_hubungan_pemohon' then nullif(btrim(p_data->>'pelajar_hubungan_pemohon'), '') else a.pelajar_hubungan_pemohon end,
           pelajar_nama = case when p_data ? 'pelajar_nama' then nullif(btrim(p_data->>'pelajar_nama'), '') else a.pelajar_nama end,
           pelajar_hubungan_ahli = case when p_data ? 'pelajar_hubungan_ahli' then nullif(btrim(p_data->>'pelajar_hubungan_ahli'), '') else a.pelajar_hubungan_ahli end,
           pelajar_institusi = case when p_data ? 'pelajar_institusi' then nullif(btrim(p_data->>'pelajar_institusi'), '') else a.pelajar_institusi end,
           pelajar_program = case when p_data ? 'pelajar_program' then nullif(btrim(p_data->>'pelajar_program'), '') else a.pelajar_program end,
           pelajar_tahun_semester = case when p_data ? 'pelajar_tahun_semester' then nullif(btrim(p_data->>'pelajar_tahun_semester'), '') else a.pelajar_tahun_semester end,
           pelajar_status_pengajian = case when p_data ? 'pelajar_status_pengajian' then nullif(btrim(p_data->>'pelajar_status_pengajian'), '') else a.pelajar_status_pengajian end,
           pelajar_bantuan_sedia_ada = case when p_data ? 'pelajar_bantuan_sedia_ada' then nullif(btrim(p_data->>'pelajar_bantuan_sedia_ada'), '') else a.pelajar_bantuan_sedia_ada end,
           dokumen_tiada_sebab = case when p_data ? 'dokumen_tiada_sebab' then nullif(btrim(p_data->>'dokumen_tiada_sebab'), '') else a.dokumen_tiada_sebab end,
           jumlah_dimohon = case when p_data ? 'jumlah_dimohon' then nullif(btrim(p_data->>'jumlah_dimohon'), '')::numeric(12,2) else a.jumlah_dimohon end,
           pendapatan_isi_rumah = case when p_data ? 'pendapatan_isi_rumah' then nullif(btrim(p_data->>'pendapatan_isi_rumah'), '')::numeric(12,2) else a.pendapatan_isi_rumah end,
           bantuan_lain_amaun = case when p_data ? 'bantuan_lain_amaun' then nullif(btrim(p_data->>'bantuan_lain_amaun'), '')::numeric(12,2) else a.bantuan_lain_amaun end,
           bil_tanggungan = case when p_data ? 'bil_tanggungan' then nullif(btrim(p_data->>'bil_tanggungan'), '')::integer else a.bil_tanggungan end,
           bantuan_lain_ada = case when p_data ? 'bantuan_lain_ada' then nullif(btrim(p_data->>'bantuan_lain_ada'), '')::boolean else a.bantuan_lain_ada end,
           dokumen_tiada = case when p_data ? 'dokumen_tiada' then nullif(btrim(p_data->>'dokumen_tiada'), '')::boolean else a.dokumen_tiada end,
           pengakuan_benar = case when p_data ? 'pengakuan_benar' then nullif(btrim(p_data->>'pengakuan_benar'), '')::boolean else a.pengakuan_benar end,
           pengakuan_proses = case when p_data ? 'pengakuan_proses' then nullif(btrim(p_data->>'pengakuan_proses'), '')::boolean else a.pengakuan_proses end,
           pengakuan_satu_kali = case when p_data ? 'pengakuan_satu_kali' then nullif(btrim(p_data->>'pengakuan_satu_kali'), '')::boolean else a.pengakuan_satu_kali end,
           tarikh_diperlukan = case when p_data ? 'tarikh_diperlukan' then nullif(btrim(p_data->>'tarikh_diperlukan'), '')::date else a.tarikh_diperlukan end,
           kategori = case
             when a.status = 'draft' and coalesce(p_data->>'kategori', '') in ('keluarga', 'pelajar')
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

-- -----------------------------------------------------------------------------
-- 7. Dokumen sokongan
--
-- Fail dimuat naik terus ke bucket persendirian `bantuan-docs` (polisi storan di
-- bahagian 9). RPC ini MENDAFTARKAN fail: ia mengesahkan fail benar-benar wujud
-- dalam Storage dan memakai saiz + jenis SEBENAR daripada Storage (bukan yang
-- didakwa klien). Had 5 fail setiap permohonan dikuatkuasakan di bawah kunci baris
-- supaya dua muat naik serentak tidak melepasinya.
-- -----------------------------------------------------------------------------

create or replace function public.bantuan_add_document(
  p_app uuid, p_path text, p_nama_fail text, p_jenis text default 'lain'
) returns public.bantuan_documents
language plpgsql security definer set search_path = public
as $$
declare
  me     uuid := public.my_member_id();
  app    public.bantuan_applications;
  obj    record;
  v_req  uuid;
  v_n    integer;
  doc    public.bantuan_documents;
begin
  if me is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  select * into app from public.bantuan_applications where id = p_app for update;
  if not found or app.member_id <> me then
    raise exception 'Permohonan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.status not in ('draft', 'needs_information') then
    raise exception 'Dokumen tidak boleh ditambah pada status ini.' using errcode = '55000';
  end if;
  if p_jenis not in ('pendapatan', 'bil', 'pengajian', 'lain') then
    raise exception 'Jenis dokumen tidak sah.' using errcode = '22023';
  end if;
  if p_path is null or p_path !~ ('^' || p_app::text || '/[0-9a-f-]{36}\.(pdf|jpg|png)$') then
    raise exception 'Laluan fail tidak sah.' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(p_nama_fail), '')) not between 1 and 200 then
    raise exception 'Nama fail tidak sah.' using errcode = '22023';
  end if;

  select count(*) into v_n from public.bantuan_documents where application_id = p_app;
  if v_n >= 5 then
    raise exception 'Maksimum 5 dokumen bagi satu permohonan.' using errcode = '22023';
  end if;

  select o.name,
         coalesce((o.metadata->>'size')::bigint, 0) as saiz,
         coalesce(o.metadata->>'mimetype', '')      as jenis_mime
    into obj
    from storage.objects o
   where o.bucket_id = 'bantuan-docs' and o.name = p_path;
  if not found then
    raise exception 'Fail belum selesai dimuat naik. Sila cuba lagi.' using errcode = '22023';
  end if;
  if obj.saiz <= 0 or obj.saiz > 5242880 then
    raise exception 'Saiz fail melebihi 5 MB.' using errcode = '22023';
  end if;
  if obj.jenis_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Hanya PDF, JPG dan PNG dibenarkan.' using errcode = '22023';
  end if;

  if app.status = 'needs_information' then
    select r.id into v_req from public.bantuan_info_requests r
     where r.application_id = p_app and r.responded_at is null
     order by r.created_at desc limit 1;
  end if;

  insert into public.bantuan_documents (application_id, info_request_id, storage_path, nama_fail, mime, saiz_bait, jenis)
  values (p_app, v_req, p_path, btrim(p_nama_fail), obj.jenis_mime, obj.saiz, p_jenis)
  returning * into doc;

  return doc;
end;
$$;

-- Memulangkan `storage_path` supaya klien boleh membuang objek (cuba-terbaik).
create or replace function public.bantuan_remove_document(p_doc uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me   uuid := public.my_member_id();
  doc  public.bantuan_documents;
  app  public.bantuan_applications;
  v_open uuid;
begin
  select * into doc from public.bantuan_documents where id = p_doc;
  if not found then
    raise exception 'Dokumen tidak dijumpai.' using errcode = 'P0002';
  end if;
  select * into app from public.bantuan_applications where id = doc.application_id for update;
  if app.member_id <> me then
    raise exception 'Dokumen tidak dijumpai.' using errcode = 'P0002';
  end if;
  if app.status not in ('draft', 'needs_information') then
    raise exception 'Dokumen tidak boleh dibuang pada status ini.' using errcode = '55000';
  end if;
  -- Semasa minta maklumat tambahan, dokumen asal yang sudah dihantar tidak boleh dibuang.
  if app.status = 'needs_information' then
    select r.id into v_open from public.bantuan_info_requests r
     where r.application_id = app.id and r.responded_at is null
     order by r.created_at desc limit 1;
    if doc.info_request_id is distinct from v_open then
      raise exception 'Dokumen yang telah dihantar tidak boleh dibuang.' using errcode = '55000';
    end if;
  end if;
  delete from public.bantuan_documents where id = p_doc;
  return doc.storage_path;
end;
$$;

revoke all on function public.bantuan_add_document(uuid, text, text, text) from public, anon;
revoke all on function public.bantuan_remove_document(uuid) from public, anon;
grant execute on function public.bantuan_add_document(uuid, text, text, text) to authenticated;
grant execute on function public.bantuan_remove_document(uuid) to authenticated;

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
    raise exception 'Sila terangkan maklumat atau dokumen yang diperlukan (sekurang-kurangnya 10 aksara).' using errcode = '22023';
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
  app := public.bantuan_lock_admin(p_id, p_versi, array['under_review']);
  if p_jumlah > app.jumlah_dimohon then
    raise exception 'Jumlah diluluskan tidak boleh melebihi jumlah dimohon.' using errcode = '22023';
  end if;

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

-- Senarai admin: carian, penapis, penanda hantar semula + kemungkinan pertindihan.
create or replace function public.bantuan_admin_list(
  p_cari     text default null,
  p_kategori text default null,
  p_status   text default null,
  p_dari     date default null,
  p_hingga   date default null,
  p_mendesak boolean default false,
  p_had      integer default 200
) returns table (
  id uuid, no_rujukan text, nama_pemohon text, nombor_ahli_salin text,
  kategori text, tujuan text, status text, tahap_keperluan text,
  jumlah_dimohon numeric, jumlah_diluluskan numeric,
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
  select a.id, a.no_rujukan, a.nama_pemohon, a.nombor_ahli_salin, a.kategori, a.tujuan, a.status,
         a.tahap_keperluan, a.jumlah_dimohon, a.jumlah_diluluskan, a.dihantar_at,
         exists (select 1 from public.bantuan_history h where h.application_id = a.id and h.tindakan = 'dihantar_semula'),
         exists (
           select 1 from public.bantuan_applications b
            where b.member_id = a.member_id and b.id <> a.id and b.kategori = a.kategori
              and b.tujuan is not distinct from a.tujuan
              and b.status in ('submitted', 'under_review', 'needs_information', 'approved')
         ),
         a.versi
    from public.bantuan_applications a
   where a.status <> 'draft'
     and a.member_id is distinct from me
     and (p_kategori is null or a.kategori = p_kategori)
     and (p_status is null or a.status = p_status)
     and (p_mendesak is not true or a.tahap_keperluan = 'mendesak')
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
   group by s.status
  union all
  select 'mendesak_menunggu', count(*)::integer
    from public.bantuan_applications a
   where a.tahap_keperluan = 'mendesak'
     and a.status in ('submitted', 'under_review')
     and a.member_id is distinct from me;
end;
$$;

-- Permohonan terdahulu pemohon yang sama (untuk semakan sahaja). `jumlah_diluluskan`
-- BUKAN jumlah yang telah dibayar — pembayaran di luar skop modul ini.
create or replace function public.bantuan_admin_sebelum(p_id uuid)
returns table (
  id uuid, no_rujukan text, kategori text, tujuan text, status text,
  jumlah_dimohon numeric, jumlah_diluluskan numeric, dihantar_at timestamptz
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
  select b.id, b.no_rujukan, b.kategori, b.tujuan, b.status, b.jumlah_dimohon, b.jumlah_diluluskan, b.dihantar_at
    from public.bantuan_applications b
   where b.member_id = v_member and b.id <> p_id and b.status <> 'draft'
   order by b.dihantar_at desc nulls last;
end;
$$;

revoke all on function public.bantuan_admin_list(text, text, text, date, date, boolean, integer) from public, anon;
revoke all on function public.bantuan_admin_ringkasan() from public, anon;
revoke all on function public.bantuan_admin_sebelum(uuid) from public, anon;
grant execute on function public.bantuan_admin_list(text, text, text, date, date, boolean, integer) to authenticated;
grant execute on function public.bantuan_admin_ringkasan() to authenticated;
grant execute on function public.bantuan_admin_sebelum(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Storan persendirian `bantuan-docs`
--
-- Nama objek: <application_id>/<uuid>.<pdf|jpg|png>. Had saiz + jenis MIME
-- dikuatkuasakan oleh Storage sendiri (bukan klien sahaja). TIADA polisi UPDATE,
-- jadi fail yang dimuat naik tidak boleh ditimpa. Bacaan hanya pemilik atau admin
-- yang dibenarkan; muat turun melalui URL bertandatangan sementara.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bantuan-docs', 'bantuan-docs', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

create or replace function public.bantuan_obj_app(p_name text)
returns uuid
language sql immutable
as $$
  select case when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'
              then public.uuid_or_null(split_part(p_name, '/', 1)) end;
$$;

create or replace function public.bantuan_obj_can_read(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.bantuan_obj_app(p_name) is not null
     and (public.bantuan_owner_of(public.bantuan_obj_app(p_name))
          or public.bantuan_admin_can_see(public.bantuan_obj_app(p_name)));
$$;

create or replace function public.bantuan_obj_can_write(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.bantuan_obj_app(p_name) is not null
     and not public.my_account_suspended()
     and exists (
       select 1 from public.bantuan_applications a
        where a.id = public.bantuan_obj_app(p_name)
          and a.member_id = public.my_member_id()
          and a.status in ('draft', 'needs_information')
     );
$$;

revoke all on function public.bantuan_obj_app(text) from public, anon;
revoke all on function public.bantuan_obj_can_read(text) from public, anon;
revoke all on function public.bantuan_obj_can_write(text) from public, anon;
grant execute on function public.bantuan_obj_app(text) to authenticated;
grant execute on function public.bantuan_obj_can_read(text) to authenticated;
grant execute on function public.bantuan_obj_can_write(text) to authenticated;

drop policy if exists bantuan_docs_read on storage.objects;
create policy bantuan_docs_read on storage.objects
  for select to authenticated
  using (bucket_id = 'bantuan-docs' and public.bantuan_obj_can_read(name));

drop policy if exists bantuan_docs_insert on storage.objects;
create policy bantuan_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bantuan-docs' and public.bantuan_obj_can_write(name));

drop policy if exists bantuan_docs_delete on storage.objects;
create policy bantuan_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'bantuan-docs' and public.bantuan_obj_can_write(name));

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

  -- 3. Permohonan bantuan menunggu semakan — LAJNAH KEBAJIKAN (+ Super Admin).
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
