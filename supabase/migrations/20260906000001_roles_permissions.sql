-- =============================================================================
-- mysaf-off — Sistem Role & Permission (Super Admin / Admin / Ahli)
--
-- Jalankan keseluruhan fail ini SEKALI dalam Supabase Dashboard > SQL Editor.
-- Skrip ini idempotent: selamat dijalankan semula tanpa menduplikasi data.
--
-- Kebenaran dikuatkuasakan di peringkat pangkalan data (RLS), bukan sekadar
-- di dalam app — klien memegang anon key, jadi app TIDAK boleh jadi satu-satunya
-- lapisan kawalan.
-- =============================================================================


-- =============================================================================
-- 1. ENUM PERANAN
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'user_role' and typnamespace = 'public'::regnamespace
  ) then
    create type public.user_role as enum ('super_admin', 'admin', 'ahli');
  end if;
end $$;


-- =============================================================================
-- 2. FUNGSI PEMBANTU AM
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 3. TABLE profiles
--
-- `email` disimpan di sini kerana skema `auth` tidak boleh dibaca terus oleh
-- klien — panel Super Admin perlukan emel untuk mengenal pasti ahli.
-- =============================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       public.user_role not null default 'ahli',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Untuk projek yang sudah mempunyai table profiles sebelum ini.
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists role       public.user_role not null default 'ahli';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- --- Auto-cipta baris profil untuk setiap akaun auth -------------------------
-- `security definer` supaya trigger boleh menulis walaupun RLS aktif.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Emel akaun boleh berubah (skrin "Tukar Emel") — pastikan profil ikut sama.
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_new_user();

-- Backfill akaun sedia ada yang belum mempunyai profil.
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
from auth.users u
on conflict (id) do nothing;


-- =============================================================================
-- 4. TABLE departments
-- =============================================================================

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

insert into public.departments (name, is_active)
values
  ('SETIAUSAHA', true),
  ('TIMBALAN SETIAUSAHA', true),
  ('BENDAHARI', true),
  ('LAJNAH PERKADERAN', true),
  ('LAJNAH TARBIAH', true),
  ('LAJNAH HAL EHWAL SEKOLAH & ALUMNI', true),
  ('LAJNAH PEMBANGUNAN GENERASI', true),
  ('LAJNAH KEBAJIKAN', true),
  ('LAJNAH PEMBANGUNAN NGO', true),
  ('LAJNAH EKONOMI DAN ASET', true),
  ('LAJNAH MUSLIMAT', true),
  ('I-GEM', true),
  ('JABATAN DATA & SUMBER MANUSIA', true),
  ('JABATAN SETIAUSAHA', true)
on conflict (name) do nothing;


-- =============================================================================
-- 5. TABLE admin_assignments
--
-- Satu baris = satu admin pada satu department. Seorang admin boleh memegang
-- banyak department (banyak baris), tetapi tidak boleh berganda pada department
-- yang sama — dikuatkuasakan oleh unique (user_id, department_id).
-- =============================================================================

create table if not exists public.admin_assignments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  can_view      boolean not null default true,
  can_edit      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (user_id, department_id)
);

create index if not exists admin_assignments_user_id_idx on public.admin_assignments (user_id);
create index if not exists admin_assignments_department_id_idx on public.admin_assignments (department_id);


-- =============================================================================
-- 6. FUNGSI is_super_admin()
--
-- `security definer` PENTING: fungsi ini dipanggil dari dalam policy `profiles`
-- itu sendiri. Tanpa security definer, bacaan ke profiles akan mencetuskan
-- policy yang sama sekali lagi → rekursi tanpa henti.
-- =============================================================================

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'super_admin'
  );
$$;

grant execute on function public.is_super_admin(uuid) to authenticated;


-- --- Halang kenaikan pangkat sendiri -----------------------------------------
-- Policy UPDATE membenarkan pengguna mengemas kini profil sendiri (nama), jadi
-- perubahan `role` perlu disekat berasingan — RLS tidak boleh membandingkan
-- nilai lama dengan nilai baharu dalam satu policy.

create or replace function public.guard_profile_role_change()
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

  if new.role is distinct from old.role and not public.is_super_admin(auth.uid()) then
    raise exception 'Hanya Super Admin boleh menukar peranan pengguna.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();


-- =============================================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.departments       enable row level security;
alter table public.admin_assignments enable row level security;

-- --- profiles ----------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- Baris profil dicipta oleh trigger `handle_new_user`, bukan oleh klien.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_super_admin());

-- --- departments -------------------------------------------------------------
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select to authenticated
  using (true);

drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists departments_delete on public.departments;
create policy departments_delete on public.departments
  for delete to authenticated
  using (public.is_super_admin());

-- --- admin_assignments -------------------------------------------------------
drop policy if exists admin_assignments_select on public.admin_assignments;
create policy admin_assignments_select on public.admin_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists admin_assignments_insert on public.admin_assignments;
create policy admin_assignments_insert on public.admin_assignments
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists admin_assignments_update on public.admin_assignments;
create policy admin_assignments_update on public.admin_assignments
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists admin_assignments_delete on public.admin_assignments;
create policy admin_assignments_delete on public.admin_assignments
  for delete to authenticated
  using (public.is_super_admin());


-- =============================================================================
-- 8. GRANTS
-- RLS di atas yang menentukan baris mana boleh disentuh; grant ini hanya
-- membuka pintu table kepada peranan `authenticated`.
-- =============================================================================

grant usage on schema public to authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.departments       to authenticated;
grant select, insert, update, delete on public.admin_assignments to authenticated;
