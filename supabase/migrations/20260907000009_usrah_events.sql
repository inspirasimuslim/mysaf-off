-- =============================================================================
-- mysaf-off — Program usrah (QR kehadiran)
--
-- Jalankan SELEPAS 20260906000008_usrah_monthly_attendance.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Kebenaran dibina di atas `can_view_usrah()` / `can_edit_usrah()` yang sudah
-- wujud untuk kehadiran bulanan — kedua-duanya memanggil
-- `has_department_access('LAJNAH TARBIAH', ...)`, yang sudah merangkumi Super
-- Admin dan semakan sekatan akaun. Tiada fungsi kebenaran baharu diperkenalkan.
-- =============================================================================


-- =============================================================================
-- 1. TABLE usrah_events
-- =============================================================================

create table if not exists public.usrah_events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  poster_url text,

  event_date date not null,
  event_time time not null,

  location_text          text,
  latitude               numeric,
  longitude              numeric,
  geofence_radius_meters int not null default 100 check (geofence_radius_meters between 10 and 5000),

  /*
    Kandungan kod QR. Rahsia, bukan sekadar pengenalan: sesiapa yang memegang
    token ini boleh mendakwa hadir, jadi ia dijana secara rawak dan bukan
    diterbitkan daripada `id` yang boleh diteka daripada URL.
  */
  qr_token text not null unique,

  /*
    Tetingkap sah kod QR. Dikira oleh trigger di bawah dan bukan oleh app:
    jam peranti boleh silap atau diubah, dan tetingkap kehadiran bukan perkara
    yang patut bergantung pada jam pengguna.
  */
  valid_until timestamptz not null,

  -- Suis manual, berasingan daripada `valid_until`: admin boleh menutup
  -- program lebih awal tanpa menunggu tetingkap masa tamat.
  is_active  boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists usrah_events_date_idx on public.usrah_events (event_date desc);

/*
  Tetingkap sah: tiga jam selepas program bermula.

  Waktu tempatan yang menentukan, jadi tarikh dan masa digabung dahulu KEMUDIAN
  ditafsir dalam zon Malaysia. Tanpa `at time zone`, '8:00 malam' akan disimpan
  sebagai 8:00 UTC dan tetingkapnya tamat lapan jam terlalu awal.
*/
create or replace function public.set_usrah_event_valid_until()
returns trigger
language plpgsql
as $$
begin
  new.valid_until :=
    ((new.event_date + new.event_time) at time zone 'Asia/Kuala_Lumpur') + interval '3 hours';
  return new;
end;
$$;

drop trigger if exists usrah_events_valid_until on public.usrah_events;
create trigger usrah_events_valid_until
  before insert or update of event_date, event_time on public.usrah_events
  for each row execute function public.set_usrah_event_valid_until();

drop trigger if exists usrah_events_set_updated_at on public.usrah_events;
create trigger usrah_events_set_updated_at
  before update on public.usrah_events
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. ROW LEVEL SECURITY
--
-- Ahli TIDAK melihat table ini lagi. Skrin kehadiran ahli akan datang membaca
-- program melalui laluannya sendiri (imbasan QR), bukan dengan menyenaraikan
-- semua program — jadi tiada policy ahli dibuka lebih awal daripada keperluan.
-- =============================================================================

alter table public.usrah_events enable row level security;

drop policy if exists usrah_events_select on public.usrah_events;
create policy usrah_events_select on public.usrah_events
  for select to authenticated
  using (public.can_view_usrah());

drop policy if exists usrah_events_insert on public.usrah_events;
create policy usrah_events_insert on public.usrah_events
  for insert to authenticated
  with check (public.can_edit_usrah());

drop policy if exists usrah_events_update on public.usrah_events;
create policy usrah_events_update on public.usrah_events
  for update to authenticated
  using (public.can_edit_usrah())
  with check (public.can_edit_usrah());

drop policy if exists usrah_events_delete on public.usrah_events;
create policy usrah_events_delete on public.usrah_events
  for delete to authenticated
  using (public.can_edit_usrah());

grant select, insert, update, delete on public.usrah_events to authenticated;


-- =============================================================================
-- 3. BUCKET event-posters
--
-- `public = true` atas sebab yang sama seperti `avatars`: poster dibenamkan
-- terus dalam senarai program, jadi ia perlu boleh dicapai tanpa token
-- bertandatangan. Yang dilindungi ialah TULISAN.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do update set public = true;

drop policy if exists event_posters_public_read on storage.objects;
create policy event_posters_public_read on storage.objects
  for select
  using (bucket_id = 'event-posters');

drop policy if exists event_posters_insert on storage.objects;
create policy event_posters_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-posters' and public.can_edit_usrah());

drop policy if exists event_posters_update on storage.objects;
create policy event_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-posters' and public.can_edit_usrah())
  with check (bucket_id = 'event-posters' and public.can_edit_usrah());

drop policy if exists event_posters_delete on storage.objects;
create policy event_posters_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-posters' and public.can_edit_usrah());


-- =============================================================================
-- 4. LAPORAN KEHADIRAN SETAHUN
--
-- Laporan memerlukan nama dan nombor ahli, tetapi admin LAJNAH TARBIAH belum
-- tentu memegang kebenaran membaca `members` (itu milik JABATAN DATA & SUMBER
-- MANUSIA). `security definer` merapatkan jurang itu dengan tepat: ia mendedah
-- tiga kolum pengenalan sahaja, dan hanya kepada sesiapa yang sudah dibenarkan
-- melihat rekod usrah.
-- =============================================================================

create or replace function public.usrah_year_report(target_year int)
returns table (
  nombor_ahli text,
  full_name   text,
  generasi    text,
  m01 boolean,
  m02 boolean,
  m03 boolean,
  m04 boolean,
  m05 boolean,
  m06 boolean,
  m07 boolean,
  m08 boolean,
  m09 boolean,
  m10 boolean,
  m11 boolean,
  m12 boolean
) language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
  bool_or(case when a.month = 1 then a.attended end) as m01,
  bool_or(case when a.month = 2 then a.attended end) as m02,
  bool_or(case when a.month = 3 then a.attended end) as m03,
  bool_or(case when a.month = 4 then a.attended end) as m04,
  bool_or(case when a.month = 5 then a.attended end) as m05,
  bool_or(case when a.month = 6 then a.attended end) as m06,
  bool_or(case when a.month = 7 then a.attended end) as m07,
  bool_or(case when a.month = 8 then a.attended end) as m08,
  bool_or(case when a.month = 9 then a.attended end) as m09,
  bool_or(case when a.month = 10 then a.attended end) as m10,
  bool_or(case when a.month = 11 then a.attended end) as m11,
  bool_or(case when a.month = 12 then a.attended end) as m12
  from public.members m
  join public.usrah_monthly_attendance a on a.member_id = m.id
  where a.year = target_year
    and public.can_view_usrah()
  group by m.id, m.nombor_ahli, m.full_name, m.generasi
  order by m.nombor_ahli nulls last, m.full_name;
$$;

revoke all on function public.usrah_year_report(int) from public, anon;
grant execute on function public.usrah_year_report(int) to authenticated;

notify pgrst, 'reload schema';
