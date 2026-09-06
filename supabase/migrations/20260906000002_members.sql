-- =============================================================================
-- mysaf-off — Modul Senarai Ahli
--
-- Jalankan SELEPAS 20260906000001_roles_permissions.sql.
-- Skrip ini idempotent: selamat dijalankan semula tanpa menduplikasi data.
--
-- Kebenaran dibina di atas sistem role/permission sedia ada (`profiles`,
-- `departments`, `admin_assignments`) — tiada mekanisme baharu diperkenalkan.
-- =============================================================================


-- =============================================================================
-- 1. TABLE generations
--
-- Generasi disimpan sebagai baris, bukan enum, supaya boleh ditambah/dibuang
-- dari app persis seperti `departments`. `code` ialah kunci yang dirujuk oleh
-- `members.generasi` — huruf kecil, format 'i01'..'i27'.
-- =============================================================================

create table if not exists public.generations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  label      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists generations_set_updated_at on public.generations;
create trigger generations_set_updated_at
  before update on public.generations
  for each row execute function public.set_updated_at();

-- Seed i01..i27. `generate_series` mengelak 27 baris VALUES yang berulang.
insert into public.generations (code, label, is_active)
select
  'i' || lpad(n::text, 2, '0'),
  'Ikhwan ' || lpad(n::text, 2, '0'),
  true
from generate_series(1, 27) as n
on conflict (code) do nothing;


-- =============================================================================
-- 2. TABLE members
--
-- Satu baris = seorang ahli. `user_id` nullable kerana rekod ahli wujud dahulu
-- (diimport dari Excel), akaun log masuk menyusul kemudian.
-- =============================================================================

create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),

  -- --- Identiti ---
  nombor_ahli   text unique,
  generasi      text references public.generations (code) on update cascade on delete restrict,
  full_name     text not null,
  jantina       text,
  nric          text,
  email         text,
  no_tel        text,
  alamat        text,
  alamat_semasa text,
  kawasan_usrah text,
  disekat       boolean not null default false,

  -- --- Jawatan ---
  jawatan_ikhwan_1 text,
  jawatan_ikhwan_2 text,
  jawatan_ikhwan_3 text,
  jawatan_pas_1    text,
  jawatan_pas_2    text,
  jawatan_pas_3    text,
  no_keahlian_pas  text,

  -- --- Pendidikan ---
  tahap_pendidikan   text,
  status_pengajian   text check (status_pengajian in ('tidak_belajar', 'sedang_belajar', 'sudah_tamat')),
  sekolah            text,
  nama_institusi     text,
  alamat_institusi   text,
  tahun_pengajian    text,
  jurusan_pengajian  text,
  sumber_pembiayaan  text,
  pembiayaan_lain    text,

  -- --- Pekerjaan ---
  status_pekerjaan text check (
    status_pekerjaan in (
      'bekerja', 'berniaga_usahawan', 'suri_rumah', 'belajar_sepenuh_masa',
      'bekerja_dan_belajar', 'pesara', 'tidak_bekerja'
    )
  ),
  sektor_pekerjaan          text,
  jawatan_pekerjaan         text,
  nama_majikan              text,
  alamat_tempat_kerja       text,
  anggaran_pendapatan_range text check (
    anggaran_pendapatan_range in ('<1000', '1000-2999', '3000-4999', '5000-9999', '10000+')
  ),
  jenis_perniagaan          text,

  -- --- Keluarga ---
  status_perkahwinan text check (
    status_perkahwinan in ('bujang', 'berkahwin_mbm', 'berkahwin_bukan_mbm')
  ),
  nama_pasangan     text,
  tahun_berkahwin   text,
  bil_anak          int,
  anggaran_pendapatan_isi_rumah_range text check (
    anggaran_pendapatan_isi_rumah_range in ('<1000', '1000-2999', '3000-4999', '5000-9999', '10000+')
  ),
  bil_tanggungan_selain_keluarga int,
  pekerjaan_ibu                  text,
  pekerjaan_bapa                 text,
  bil_tanggungan_ibu_bapa        int,

  -- --- Pautan akaun ---
  -- `unique` menghalang dua rekod ahli dikaitkan kepada akaun yang sama; tanpa
  -- itu skrin Profil tidak dapat menentukan baris mana yang milik pengguna.
  user_id    uuid unique references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_generasi_idx    on public.members (generasi);
create index if not exists members_full_name_idx   on public.members (full_name);
create index if not exists members_user_id_idx     on public.members (user_id);
create index if not exists members_nombor_ahli_idx on public.members (nombor_ahli);

-- Carian emel tidak sensitif huruf besar/kecil semasa mengaitkan akaun.
create index if not exists members_email_lower_idx on public.members (lower(email));

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. AKSES DEPARTMENT
--
-- `security definer` supaya semakan boleh membaca `admin_assignments` dan
-- `departments` tanpa terikat pada policy pengguna yang memanggilnya.
-- =============================================================================

create or replace function public.has_department_access(
  dept_name  text,
  need_edit  boolean default false,
  uid        uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin(uid)
      or exists (
        select 1
        from public.admin_assignments a
        join public.departments d on d.id = a.department_id
        where a.user_id = uid
          and d.name = dept_name
          and case when need_edit then a.can_edit else a.can_view end
      );
$$;

grant execute on function public.has_department_access(text, boolean, uuid) to authenticated;

/*
  Department yang memiliki modul ahli. Dibungkus sebagai fungsi supaya namanya
  ditulis SEKALI sahaja — policy di bawah memanggilnya, jadi menukar pemilik
  modul kemudian hanya perlu menyunting fungsi ini.
*/
create or replace function public.can_view_members(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('JABATAN DATA & SUMBER MANUSIA', false, uid);
$$;

create or replace function public.can_edit_members(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('JABATAN DATA & SUMBER MANUSIA', true, uid);
$$;

grant execute on function public.can_view_members(uuid) to authenticated;
grant execute on function public.can_edit_members(uuid) to authenticated;


-- =============================================================================
-- 4. KOLUM KHUSUS ADMIN
--
-- Ahli boleh mengemas kini barisnya sendiri, tetapi bukan kolum yang menentukan
-- identiti keahliannya. RLS tidak dapat membandingkan nilai lama dengan nilai
-- baharu dalam satu policy, jadi sekatan ini dibuat melalui trigger — sama
-- seperti `guard_profile_role_change` pada migration terdahulu.
-- =============================================================================

create or replace function public.guard_member_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
begin
  -- Tiada konteks permintaan API (SQL Editor / psql) atau service_role:
  -- ini laluan pentadbir pangkalan data, bukan pengguna app.
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  if public.can_edit_members(auth.uid()) then
    return new;
  end if;

  if new.nombor_ahli is distinct from old.nombor_ahli
     or new.generasi is distinct from old.generasi
     or new.email    is distinct from old.email
     or new.disekat  is distinct from old.disekat
     -- Tanpa ini seorang ahli boleh mengalihkan rekod orang lain kepada dirinya.
     or new.user_id  is distinct from old.user_id then
    raise exception 'Nombor ahli, generasi, emel dan status sekatan hanya boleh diubah oleh admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists members_guard_admin_columns on public.members;
create trigger members_guard_admin_columns
  before update on public.members
  for each row execute function public.guard_member_admin_columns();


-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table public.members     enable row level security;
alter table public.generations enable row level security;

-- --- members -----------------------------------------------------------------
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (user_id = auth.uid() or public.can_view_members());

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert to authenticated
  with check (public.can_edit_members());

/*
  Ahli lulus policy ini untuk barisnya sendiri; kolum yang dilindungi
  dikuatkuasakan oleh `members_guard_admin_columns` di atas.
  `with check` mengulang syarat `using` supaya baris tidak boleh dialihkan
  keluar dari skop capaian pemiliknya semasa dikemas kini.
*/
drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (user_id = auth.uid() or public.can_edit_members())
  with check (user_id = auth.uid() or public.can_edit_members());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.can_edit_members());

-- --- generations -------------------------------------------------------------
drop policy if exists generations_select on public.generations;
create policy generations_select on public.generations
  for select to authenticated
  using (true);

drop policy if exists generations_insert on public.generations;
create policy generations_insert on public.generations
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists generations_update on public.generations;
create policy generations_update on public.generations
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists generations_delete on public.generations;
create policy generations_delete on public.generations
  for delete to authenticated
  using (public.is_super_admin());


-- =============================================================================
-- 6. GRANTS
-- RLS di atas yang menentukan baris mana boleh disentuh; grant ini hanya
-- membuka pintu table kepada peranan `authenticated`.
-- =============================================================================

grant select, insert, update, delete on public.members     to authenticated;
grant select, insert, update, delete on public.generations to authenticated;
