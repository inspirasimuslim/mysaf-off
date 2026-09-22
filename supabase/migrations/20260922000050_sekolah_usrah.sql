-- =============================================================================
-- mysaf-off — Usrah Sekolah (Naqib/Naqibah, Mad'u, Sesi) di bawah LAJNAH
-- PERKADERAN
--
-- Jalankan SELEPAS 20260920000049_mbm_couples.sql. Idempotent.
--
-- Naqib/Naqibah dilantik oleh admin LAJNAH PERKADERAN (`perkaderan_naqib_
-- assignments`), kemudian mengendalikan SATU (atau lebih) kumpulan usrah
-- sekolah sendiri (`sekolah_usrah_groups`) — senarai mad'u dan sesi kekal
-- milik kumpulan itu sahaja.
--
-- Sejarah tidak boleh hilang: mad'u yang dibuang HANYA disoftremove
-- (`is_active=false`), dan tiada satu pun table di sini mendapat kebenaran
-- DELETE (kecuali `sekolah_usrah_attendance` — satu baris kehadiran BOLEH
-- dipadam kerana itulah caranya checkbox "tidak hadir" diwakili: tiada baris
-- langsung). Ini sengaja LEBIH KETAT daripada "CRUD penuh" secara literal —
-- mengelakkan kumpulan/sesi/mad'u lampau terhapus walaupun oleh naqib sendiri.
--
-- PENTING: projek Supabase ini memberi DEFAULT PRIVILEGES penuh (termasuk
-- DELETE) kepada `authenticated` pada SETIAP table baharu secara automatik
-- (`pg_default_acl` peranan `postgres`). Hanya TIDAK menulis `grant delete`
-- TIDAK menyekat apa-apa — setiap table di bawah yang sepatutnya tiada
-- DELETE mesti `revoke delete ... from authenticated` secara eksplisit
-- SELEPAS grant-nya. Disahkan melalui ujian RLS langsung (lihat ringkasan
-- di penghujung sesi).
-- =============================================================================


-- =============================================================================
-- 1. TABLE
-- =============================================================================

create table if not exists public.perkaderan_naqib_assignments (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  is_active   boolean not null default true
);

create index if not exists perkaderan_naqib_assignments_member_idx on public.perkaderan_naqib_assignments (member_id);

-- Satu ahli hanya satu status AKTIF pada satu-satu masa — lantikan lampau
-- (is_active=false) kekal sebagai sejarah, tidak dipadam bila naqib ditukar.
create unique index if not exists perkaderan_naqib_assignments_active_member_idx
  on public.perkaderan_naqib_assignments (member_id) where is_active;


create table if not exists public.sekolah_usrah_groups (
  id               uuid primary key default gen_random_uuid(),
  naqib_member_id  uuid not null references public.members (id) on delete cascade,
  sekolah          text not null,
  -- Dijana automatik oleh trigger di bawah — lihat seksyen 3.
  group_name       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sekolah_usrah_groups_naqib_idx on public.sekolah_usrah_groups (naqib_member_id);

drop trigger if exists sekolah_usrah_groups_set_updated_at on public.sekolah_usrah_groups;
create trigger sekolah_usrah_groups_set_updated_at
  before update on public.sekolah_usrah_groups
  for each row execute function public.set_updated_at();


create table if not exists public.sekolah_usrah_mad_u (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.sekolah_usrah_groups (id) on delete cascade,
  nama       text not null,
  tingkatan  text,
  -- Soft-remove sahaja — JANGAN hard delete, ia memusnahkan sejarah kehadiran lampau.
  is_active  boolean not null default true,
  added_at   timestamptz not null default now()
);

create index if not exists sekolah_usrah_mad_u_group_idx on public.sekolah_usrah_mad_u (group_id);


create table if not exists public.sekolah_usrah_sessions (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.sekolah_usrah_groups (id) on delete cascade,
  session_date  date not null,
  location_text text,
  topik         text,
  recorded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sekolah_usrah_sessions_group_idx on public.sekolah_usrah_sessions (group_id);

drop trigger if exists sekolah_usrah_sessions_set_updated_at on public.sekolah_usrah_sessions;
create trigger sekolah_usrah_sessions_set_updated_at
  before update on public.sekolah_usrah_sessions
  for each row execute function public.set_updated_at();


create table if not exists public.sekolah_usrah_attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sekolah_usrah_sessions (id) on delete cascade,
  mad_u_id    uuid not null references public.sekolah_usrah_mad_u (id) on delete cascade,
  -- SATU baris = HADIR. Tiada baris = tidak hadir/belum sertai — checkbox tak
  -- ditanda tidak pernah menulis baris "tidak hadir".
  unique (session_id, mad_u_id)
);

create index if not exists sekolah_usrah_attendance_session_idx on public.sekolah_usrah_attendance (session_id);
create index if not exists sekolah_usrah_attendance_mad_u_idx on public.sekolah_usrah_attendance (mad_u_id);


-- =============================================================================
-- 2. FUNGSI AKSES
--
-- `has_department_access`, `is_super_admin` dan `my_member_id` sudah wujud
-- (`20260906000002_members.sql` / `20260906000008_usrah_monthly_attendance.sql`)
-- — dipanggil terus, bukan ditulis semula.
-- =============================================================================

create or replace function public.can_view_perkaderan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH PERKADERAN', false, uid);
$$;

create or replace function public.can_edit_perkaderan(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access('LAJNAH PERKADERAN', true, uid);
$$;

/** Wujud lantikan naqib AKTIF untuk pengguna semasa. */
create or replace function public.is_active_naqib(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perkaderan_naqib_assignments a
    join public.members m on m.id = a.member_id
    where m.user_id = uid
      and a.is_active = true
  );
$$;

/*
  `my_member_id()` sedia ada (`20260906000008_usrah_monthly_attendance.sql`,
  dikemas kini oleh `20260913000017_security_hardening.sql` supaya akaun yang
  disekat atau belum tukar kata laluan sementara tidak dikira "diri sendiri")
  tidak menerima parameter `uid` — overload di sini membolehkan fungsi di
  bawah menyemak PEMILIK BARIS (`uid` dari caller) dan bukan sentiasa
  `auth.uid()`. Pengawal yang SAMA (`must_change_password`, `disekat`)
  dikekalkan di sini — naqib dengan akaun belum sihat tidak patut boleh
  menulis ke kumpulannya sendiri, sama seperti mana-mana tulisan sendiri lain
  dalam app ini.
  Mesti wujud SEBELUM `is_own_naqib_group`: fungsi `language sql` disahkan
  terhadap objek yang dirujuk pada masa CREATE, bukan lewat.
*/
create or replace function public.my_member_id(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members
  where user_id = uid and not must_change_password and not disekat
  limit 1;
$$;

revoke all on function public.my_member_id(uuid) from public, anon;
grant execute on function public.my_member_id(uuid) to authenticated;

/** Kumpulan `p_group_id` dimiliki oleh naqib AKTIF `uid` sendiri. */
create or replace function public.is_own_naqib_group(p_group_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_naqib(uid) and exists (
    select 1
    from public.sekolah_usrah_groups g
    where g.id = p_group_id
      and g.naqib_member_id = public.my_member_id(uid)
  );
$$;

/** Sesi `p_session_id` tergolong kepada kumpulan naqib AKTIF `uid` sendiri. */
create or replace function public.is_own_naqib_session(p_session_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sekolah_usrah_sessions s
    where s.id = p_session_id
      and public.is_own_naqib_group(s.group_id, uid)
  );
$$;

revoke all on function public.can_view_perkaderan(uuid) from public, anon;
revoke all on function public.can_edit_perkaderan(uuid) from public, anon;
revoke all on function public.is_active_naqib(uuid) from public, anon;
revoke all on function public.is_own_naqib_group(uuid, uuid) from public, anon;
revoke all on function public.is_own_naqib_session(uuid, uuid) from public, anon;

grant execute on function public.can_view_perkaderan(uuid) to authenticated;
grant execute on function public.can_edit_perkaderan(uuid) to authenticated;
grant execute on function public.is_active_naqib(uuid) to authenticated;
grant execute on function public.is_own_naqib_group(uuid, uuid) to authenticated;
grant execute on function public.is_own_naqib_session(uuid, uuid) to authenticated;


-- =============================================================================
-- 3. TRIGGER — NAMA KUMPULAN DIJANA AUTOMATIK
--
-- "Usrah [Nama Sekolah] - [Nama Naqib]" — nilai yang dihantar client untuk
-- `group_name` sentiasa ditimpa supaya app tidak boleh terlepas menyegerakkan
-- nama bila naqib atau sekolah bertukar.
-- =============================================================================

create or replace function public.sekolah_usrah_set_group_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_naqib_name text;
begin
  select full_name into v_naqib_name from public.members where id = new.naqib_member_id;
  new.group_name := 'Usrah ' || new.sekolah || ' - ' || coalesce(v_naqib_name, 'Naqib');
  return new;
end;
$$;

drop trigger if exists sekolah_usrah_groups_set_name on public.sekolah_usrah_groups;
create trigger sekolah_usrah_groups_set_name
  before insert or update of sekolah, naqib_member_id on public.sekolah_usrah_groups
  for each row execute function public.sekolah_usrah_set_group_name();


-- =============================================================================
-- 4. ROW LEVEL SECURITY
--
-- Tiga lapisan pada setiap table: Super Admin (semua), admin LAJNAH
-- PERKADERAN (ikut can_view/can_edit), naqib AKTIF (kumpulan SENDIRI sahaja).
-- Ahli biasa tidak disebut dalam mana-mana policy — dia tidak mendapat apa-apa.
-- =============================================================================

-- --- perkaderan_naqib_assignments --------------------------------------------
-- Lantikan diurus oleh admin/Super Admin sahaja. Naqib TIDAK mempunyai akses
-- langsung ke table ini — status "adakah saya naqib" disemak melalui
-- `is_active_naqib()` (security definer), bukan bacaan terus baris sendiri.

alter table public.perkaderan_naqib_assignments enable row level security;

drop policy if exists perkaderan_naqib_assignments_select on public.perkaderan_naqib_assignments;
create policy perkaderan_naqib_assignments_select on public.perkaderan_naqib_assignments
  for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan());

drop policy if exists perkaderan_naqib_assignments_insert on public.perkaderan_naqib_assignments;
create policy perkaderan_naqib_assignments_insert on public.perkaderan_naqib_assignments
  for insert to authenticated
  with check (public.is_super_admin() or public.can_edit_perkaderan());

-- UPDATE sahaja (untuk `is_active=false` — "Buang" naqib). Tiada DELETE:
-- lantikan lampau kekal sebagai sejarah — walaupun untuk Super Admin. Jika
-- pembetulan kecemasan diperlukan, ia dibuat terus di pangkalan data
-- (`scripts/run-sql.mjs`), bukan melalui app.
grant select, insert, update on public.perkaderan_naqib_assignments to authenticated;
/*
  REVOKE eksplisit diperlukan: projek Supabase ini memberi DEFAULT
  PRIVILEGES penuh (termasuk DELETE) kepada `authenticated` pada SETIAP
  table baharu secara automatik (lihat `pg_default_acl` peranan `postgres`)
  — hanya TIDAK menulis `grant delete` di atas TIDAK mencukupi untuk
  menyekatnya.
*/
revoke delete on public.perkaderan_naqib_assignments from authenticated;


-- --- sekolah_usrah_groups -----------------------------------------------------

alter table public.sekolah_usrah_groups enable row level security;

drop policy if exists sekolah_usrah_groups_select on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_select on public.sekolah_usrah_groups
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_view_perkaderan()
    or public.is_own_naqib_group(id)
  );

-- Admin boleh cipta kumpulan untuk MANA-MANA naqib; naqib hanya untuk dirinya
-- sendiri — disemak melalui `naqib_member_id = my_member_id()` kerana
-- `is_own_naqib_group` memerlukan baris SEDIA ADA (belum wujud semasa insert).
drop policy if exists sekolah_usrah_groups_insert on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_insert on public.sekolah_usrah_groups
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or (public.is_active_naqib() and naqib_member_id = public.my_member_id())
  );

drop policy if exists sekolah_usrah_groups_update on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_update on public.sekolah_usrah_groups
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(id)
  )
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or (public.is_active_naqib() and naqib_member_id = public.my_member_id())
  );

-- Tiada DELETE — kumpulan lampau (bersama sesi & sejarah kehadirannya) kekal wujud.
grant select, insert, update on public.sekolah_usrah_groups to authenticated;
-- REVOKE eksplisit diperlukan — lihat nota DEFAULT PRIVILEGES di atas.
revoke delete on public.sekolah_usrah_groups from authenticated;


-- --- sekolah_usrah_mad_u -------------------------------------------------------

alter table public.sekolah_usrah_mad_u enable row level security;

drop policy if exists sekolah_usrah_mad_u_select on public.sekolah_usrah_mad_u;
create policy sekolah_usrah_mad_u_select on public.sekolah_usrah_mad_u
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_view_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

drop policy if exists sekolah_usrah_mad_u_insert on public.sekolah_usrah_mad_u;
create policy sekolah_usrah_mad_u_insert on public.sekolah_usrah_mad_u
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

-- UPDATE sahaja (tambah/tukar tingkatan, atau `is_active=false` — "Buang"
-- mad'u). Tiada DELETE — JANGAN musnahkan sejarah kehadiran lampau.
drop policy if exists sekolah_usrah_mad_u_update on public.sekolah_usrah_mad_u;
create policy sekolah_usrah_mad_u_update on public.sekolah_usrah_mad_u
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  )
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

grant select, insert, update on public.sekolah_usrah_mad_u to authenticated;
-- REVOKE eksplisit diperlukan — lihat nota DEFAULT PRIVILEGES di atas.
revoke delete on public.sekolah_usrah_mad_u from authenticated;


-- --- sekolah_usrah_sessions -----------------------------------------------------

alter table public.sekolah_usrah_sessions enable row level security;

drop policy if exists sekolah_usrah_sessions_select on public.sekolah_usrah_sessions;
create policy sekolah_usrah_sessions_select on public.sekolah_usrah_sessions
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_view_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

drop policy if exists sekolah_usrah_sessions_insert on public.sekolah_usrah_sessions;
create policy sekolah_usrah_sessions_insert on public.sekolah_usrah_sessions
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

drop policy if exists sekolah_usrah_sessions_update on public.sekolah_usrah_sessions;
create policy sekolah_usrah_sessions_update on public.sekolah_usrah_sessions
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  )
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_group(group_id)
  );

-- Tiada DELETE — sesi lampau (bersama sejarah kehadirannya) kekal wujud.
grant select, insert, update on public.sekolah_usrah_sessions to authenticated;
-- REVOKE eksplisit diperlukan — lihat nota DEFAULT PRIVILEGES di atas.
revoke delete on public.sekolah_usrah_sessions from authenticated;


-- --- sekolah_usrah_attendance -----------------------------------------------
-- Satu-satunya table di sini dengan DELETE: checkbox tak ditanda = tiada baris.

alter table public.sekolah_usrah_attendance enable row level security;

drop policy if exists sekolah_usrah_attendance_select on public.sekolah_usrah_attendance;
create policy sekolah_usrah_attendance_select on public.sekolah_usrah_attendance
  for select to authenticated
  using (
    public.is_super_admin()
    or public.can_view_perkaderan()
    or public.is_own_naqib_session(session_id)
  );

drop policy if exists sekolah_usrah_attendance_insert on public.sekolah_usrah_attendance;
create policy sekolah_usrah_attendance_insert on public.sekolah_usrah_attendance
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_session(session_id)
  );

drop policy if exists sekolah_usrah_attendance_delete on public.sekolah_usrah_attendance;
create policy sekolah_usrah_attendance_delete on public.sekolah_usrah_attendance
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_edit_perkaderan()
    or public.is_own_naqib_session(session_id)
  );

grant select, insert, delete on public.sekolah_usrah_attendance to authenticated;


-- =============================================================================
-- 5. RPC — EKSPORT LAPORAN (.xlsx, dua helaian)
--
-- `p_group_id` NULL = semua kumpulan, atau satu kumpulan sahaja. Admin/Super
-- Admin LAJNAH PERKADERAN sahaja — sepadan dengan butang di
-- `perkaderan-groups.tsx`, bukan Panel Naqib.
--
-- `security definer` supaya admin department ini boleh membaca `members`
-- (nama naqib) walaupun belum tentu memegang kebenaran JABATAN DATA & SUMBER
-- MANUSIA.
-- =============================================================================

create or replace function public.perkaderan_export(p_group_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Eksport ini hanya untuk admin LAJNAH PERKADERAN.' using errcode = 'PK001';
  end if;

  with relevant_groups as (
    select g.id, g.group_name, g.sekolah, m.full_name as naqib_name
    from public.sekolah_usrah_groups g
    join public.members m on m.id = g.naqib_member_id
    where p_group_id is null or g.id = p_group_id
  ),
  session_summary as (
    select
      rg.group_name,
      rg.naqib_name,
      rg.sekolah,
      s.id as session_id,
      s.session_date,
      s.location_text,
      s.topik,
      (select count(*) from public.sekolah_usrah_attendance a where a.session_id = s.id) as bilangan_hadir
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
  ),
  -- Mad'u relevan bagi setiap sesi: AKTIF sekarang, PLUS mana-mana mad'u yang
  -- sudah dibuang tetapi ada rekod hadir sejarah pada sesi itu — sejarah tidak
  -- pernah hilang daripada laporan walaupun mad'u itu sudah tiada dalam senarai.
  relevant_mad_u as (
    select s.id as session_id, mu.id as mad_u_id, mu.nama, mu.tingkatan
    from public.sekolah_usrah_sessions s
    join relevant_groups rg on rg.id = s.group_id
    join public.sekolah_usrah_mad_u mu on mu.group_id = s.group_id and mu.is_active = true
    union
    select a.session_id, mu.id, mu.nama, mu.tingkatan
    from public.sekolah_usrah_attendance a
    join public.sekolah_usrah_mad_u mu on mu.id = a.mad_u_id
    join public.sekolah_usrah_sessions s on s.id = a.session_id
    join relevant_groups rg on rg.id = s.group_id
  ),
  detail as (
    select
      ss.group_name,
      rm.nama,
      rm.tingkatan,
      ss.session_date,
      exists (
        select 1 from public.sekolah_usrah_attendance a
        where a.session_id = rm.session_id and a.mad_u_id = rm.mad_u_id
      ) as hadir
    from relevant_mad_u rm
    join session_summary ss on ss.session_id = rm.session_id
  )
  select jsonb_build_object(
    'ringkasan_sesi', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'naqib', naqib_name,
          'sekolah', sekolah,
          'tarikh', session_date,
          'lokasi', location_text,
          'topik', topik,
          'bilangan_hadir', bilangan_hadir
        ) order by group_name, session_date
      ), '[]'::jsonb)
      from session_summary
    ),
    'kehadiran_terperinci', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'kumpulan', group_name,
          'nama_mad_u', nama,
          'tingkatan', tingkatan,
          'tarikh_sesi', session_date,
          'hadir', hadir
        ) order by group_name, session_date, nama
      ), '[]'::jsonb)
      from detail
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.perkaderan_export(uuid) from public, anon;
grant execute on function public.perkaderan_export(uuid) to authenticated;


-- =============================================================================
-- 6. RPC — SENARAI UNTUK SKRIN ADMIN (nama naqib merentasi department)
--
-- Admin LAJNAH PERKADERAN belum tentu memegang kebenaran JABATAN DATA &
-- SUMBER MANUSIA, jadi bacaan terus `sekolah_usrah_groups` join `members`
-- daripada app akan tersekat RLS `members`. Dua RPC `security definer` ini
-- mendedahkan NAMA sahaja — sama justifikasi seperti `perkaderan_export`.
-- =============================================================================

create or replace function public.perkaderan_naqib_list()
returns table (
  id             uuid,
  member_id      uuid,
  member_full_name text,
  member_generasi  text,
  assigned_at    timestamptz,
  is_active      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.member_id, m.full_name, m.generasi, a.assigned_at, a.is_active
  from public.perkaderan_naqib_assignments a
  join public.members m on m.id = a.member_id
  where a.is_active = true
    and (public.is_super_admin() or public.can_view_perkaderan())
  order by m.full_name;
$$;

create or replace function public.perkaderan_groups_summary()
returns table (
  id              uuid,
  naqib_member_id uuid,
  naqib_full_name text,
  sekolah         text,
  group_name      text,
  mad_u_count     bigint,
  session_count   bigint,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.naqib_member_id,
    m.full_name,
    g.sekolah,
    g.group_name,
    (select count(*) from public.sekolah_usrah_mad_u mu where mu.group_id = g.id and mu.is_active = true),
    (select count(*) from public.sekolah_usrah_sessions s where s.group_id = g.id),
    g.created_at
  from public.sekolah_usrah_groups g
  join public.members m on m.id = g.naqib_member_id
  where public.is_super_admin() or public.can_view_perkaderan()
  order by g.sekolah, m.full_name;
$$;

revoke all on function public.perkaderan_naqib_list() from public, anon;
revoke all on function public.perkaderan_groups_summary() from public, anon;
grant execute on function public.perkaderan_naqib_list() to authenticated;
grant execute on function public.perkaderan_groups_summary() to authenticated;

notify pgrst, 'reload schema';
