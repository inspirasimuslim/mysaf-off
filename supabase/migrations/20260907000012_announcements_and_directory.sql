-- =============================================================================
-- mysaf-off — Direktori acara + pengumuman
--
-- Jalankan SELEPAS 20260907000011_event_types.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Skrin Utama kini memaparkan apa yang AKAN datang kepada setiap ahli: poster
-- program dan usrah yang belum tamat, dan pengumuman yang sedang aktif. Tiada
-- satu pun daripadanya memerlukan kebenaran department — ia maklumat yang
-- memang ditujukan kepada semua orang.
--
-- Yang perlu dijaga bukanlah SIAPA yang membacanya, tetapi APA yang terdedah:
-- `usrah_events` memegang `qr_token` (sesiapa yang memilikinya boleh mendakwa
-- hadir) dan koordinat pin. Jadi laluan awam ini ialah fungsi sempit dengan
-- senarai kolum yang ditulis satu per satu, bukan policy SELECT yang dilonggarkan.
-- =============================================================================


-- =============================================================================
-- 1. DIREKTORI ACARA AKAN DATANG
--
-- Sama bentuk dengan `list_members_directory()`: `security definer` supaya ia
-- memintas RLS `usrah_events`, dengan `returns table` yang menjadi satu-satunya
-- pintu keluar. Perhatikan apa yang TIADA di sini — `qr_token`, `latitude`,
-- `longitude`, `geofence_radius_meters`, `valid_until`, `created_by`. RLS
-- `usrah_events` sendiri TIDAK dilonggarkan; ahli masih tidak boleh
-- menyenaraikan table itu.
--
-- `end_date >= current_date` dan bukan `valid_until > now()`: senarai ini
-- menjawab "apa yang akan datang", dan acara yang berlangsung hari ini masih
-- patut kelihatan walaupun tetingkap kehadirannya sudah tertutup petang tadi.
-- =============================================================================

create or replace function public.event_upcoming_directory()
returns table (
  id            uuid,
  event_type    text,
  name          text,
  poster_url    text,
  start_date    date,
  end_date      date,
  start_time    time,
  end_time      time,
  location_text text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.event_type,
    e.name,
    e.poster_url,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location_text
  from public.usrah_events e
  where e.is_active
    and e.end_date >= current_date
    and not public.my_account_suspended()
  order by e.start_date, e.start_time;
$$;

revoke all on function public.event_upcoming_directory() from public, anon;
grant execute on function public.event_upcoming_directory() to authenticated;


-- =============================================================================
-- 2. TABLE announcements
--
-- Poster ialah kandungan sebenar, bukan hiasan — sebab itu `poster_url` NOT
-- NULL. Pengumuman tanpa poster akan menjadi kad kosong dalam carousel yang
-- dibina sepenuhnya daripada imej.
-- =============================================================================

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  poster_url  text not null,

  -- Suis, bukan padam. Pengumuman lama selalunya perlu dihidupkan semula
  -- (contoh: acara tahunan), dan menyembunyikannya lebih murah daripada
  -- mencipta semula.
  is_active   boolean not null default true,

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists announcements_active_idx
  on public.announcements (is_active, created_at desc);

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. RLS announcements
--
-- Bacaan terbuka kepada setiap ahli yang log masuk — itulah gunanya pengumuman.
-- Yang dijaga ialah TULISAN, dan pemiliknya JABATAN SETIAUSAHA, department yang
-- sama seperti modul Program.
--
-- `can_edit_program()` sudah merangkumi laluan Super Admin dan semakan sekatan
-- akaun (melalui `has_department_access`), jadi tiada cabang berasingan
-- diperlukan untuk kedua-duanya.
-- =============================================================================

alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    -- Pengurus melihat yang tidak aktif juga; itu yang menjadikan senarai
    -- pentadbiran berguna.
    public.can_view_program()
    or (is_active and not public.my_account_suspended())
  );

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (public.can_edit_program());

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update to authenticated
  using (public.can_edit_program())
  with check (public.can_edit_program());

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated
  using (public.can_edit_program());

grant select, insert, update, delete on public.announcements to authenticated;


-- =============================================================================
-- 4. BUCKET announcement-posters
--
-- `public = true` atas sebab yang sama seperti `event-posters`: poster
-- dibenamkan terus dalam carousel skrin Utama, jadi ia perlu boleh dicapai
-- tanpa token bertandatangan. Yang dilindungi ialah TULISAN.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('announcement-posters', 'announcement-posters', true)
on conflict (id) do update set public = true;

drop policy if exists announcement_posters_public_read on storage.objects;
create policy announcement_posters_public_read on storage.objects
  for select
  using (bucket_id = 'announcement-posters');

drop policy if exists announcement_posters_insert on storage.objects;
create policy announcement_posters_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'announcement-posters' and public.can_edit_program());

drop policy if exists announcement_posters_update on storage.objects;
create policy announcement_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'announcement-posters' and public.can_edit_program())
  with check (bucket_id = 'announcement-posters' and public.can_edit_program());

drop policy if exists announcement_posters_delete on storage.objects;
create policy announcement_posters_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'announcement-posters' and public.can_edit_program());

notify pgrst, 'reload schema';
