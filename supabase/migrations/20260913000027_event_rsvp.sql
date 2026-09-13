-- =============================================================================
-- MySAFF — RSVP ahli untuk acara (usrah DAN program)
--
-- Jalankan SELEPAS 20260913000026_event_attendance_export.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Satu baris seorang ahli satu acara; ahli menukar jawapan dengan upsert pada
-- (event_id, member_id), bukan baris baharu setiap kali.
--
-- RLS:
--   - Ahli: SELECT / INSERT / UPDATE baris SENDIRI sahaja. INSERT dan UPDATE
--     hanya semasa acara aktif dan belum melepasi `valid_until`.
--   - Admin department acara (ikut `event_department()`): SELECT semua baris
--     acara berkenaan.
--   - Tiada DELETE.
--
-- `member_id` lalai kepada `my_member_id()` supaya app tidak perlu (dan tidak
-- boleh) menghantar id ahli lain; semakan RLS menolak apa-apa yang lain.
-- =============================================================================


-- 1. TABLE ---------------------------------------------------------------------

create table if not exists public.event_rsvp (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.usrah_events(id) on delete cascade,
  member_id    uuid not null default public.my_member_id() references public.members(id) on delete cascade,
  response     text not null check (response in ('hadir', 'tidak_hadir')),
  responded_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index if not exists event_rsvp_event_id_idx on public.event_rsvp (event_id);

alter table public.event_rsvp enable row level security;

revoke all on public.event_rsvp from anon;


-- 2. MASA JAWAPAN & KUNCI BARIS -----------------------------------------------
--
-- `responded_at` ialah masa PELAYAN, bukan jam peranti. Pada UPDATE, acara dan
-- ahli dikunci: upsert hanya boleh menukar jawapan, bukan memindahkan baris.

create or replace function public.set_event_rsvp_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.responded_at := now();
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.member_id := old.member_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_event_rsvp_fields() from public, anon;

drop trigger if exists event_rsvp_fields on public.event_rsvp;
create trigger event_rsvp_fields
  before insert or update on public.event_rsvp
  for each row execute function public.set_event_rsvp_fields();


-- 3. PEMBANTU ------------------------------------------------------------------

/* RSVP dibuka selagi acara aktif dan belum melepasi tetingkap sahnya. */
create or replace function public.event_rsvp_open(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usrah_events e
    where e.id = p_event_id
      and e.is_active
      and now() < e.valid_until
  );
$$;

revoke all on function public.event_rsvp_open(uuid) from public, anon;
grant execute on function public.event_rsvp_open(uuid) to authenticated;


-- 4. POLISI --------------------------------------------------------------------

drop policy if exists event_rsvp_select_own on public.event_rsvp;
create policy event_rsvp_select_own on public.event_rsvp
  for select to authenticated
  using (member_id = public.my_member_id());

drop policy if exists event_rsvp_select_admin on public.event_rsvp;
create policy event_rsvp_select_admin on public.event_rsvp
  for select to authenticated
  using (
    exists (
      select 1 from public.usrah_events e
      where e.id = event_rsvp.event_id
        and public.can_view_event(e.event_type)
    )
  );

drop policy if exists event_rsvp_insert_own on public.event_rsvp;
create policy event_rsvp_insert_own on public.event_rsvp
  for insert to authenticated
  with check (
    member_id = public.my_member_id()
    and public.event_rsvp_open(event_id)
  );

drop policy if exists event_rsvp_update_own on public.event_rsvp;
create policy event_rsvp_update_own on public.event_rsvp
  for update to authenticated
  using (member_id = public.my_member_id())
  with check (
    member_id = public.my_member_id()
    and public.event_rsvp_open(event_id)
  );


-- 5. JAWAPAN SAYA --------------------------------------------------------------
--
-- Security INVOKER: RLS yang menentukan. Ditapis pada `my_member_id()` kerana
-- ahli yang juga admin department itu boleh membaca SEMUA baris acara.

create or replace function public.my_event_rsvp(p_event_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select r.response
  from public.event_rsvp r
  where r.event_id = p_event_id
    and r.member_id = public.my_member_id();
$$;

revoke all on function public.my_event_rsvp(uuid) from public, anon;
grant execute on function public.my_event_rsvp(uuid) to authenticated;


-- 6. RINGKASAN & EKSPORT (ADMIN) -------------------------------------------------
--
-- `security definer`: "Belum Respon" dikira terhadap SEMUA ahli aktif yang
-- mempunyai akaun (setiap ahli melihat setiap acara aktif), dan admin
-- department belum tentu boleh membaca `members`. Kiraan sahaja didedahkan.

create or replace function public.event_rsvp_summary(p_event_id uuid)
returns table (hadir integer, tidak_hadir integer, belum integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      count(*) filter (where r.response = 'hadir')::integer       as hadir,
      count(*) filter (where r.response = 'tidak_hadir')::integer as tidak_hadir
    from public.event_rsvp r
    join public.members m on m.id = r.member_id and not m.disekat
    where r.event_id = p_event_id
  ),
  eligible as (
    select count(*)::integer as total
    from public.members m
    where m.user_id is not null
      and not m.disekat
  )
  select c.hadir, c.tidak_hadir, greatest(el.total - c.hadir - c.tidak_hadir, 0)
  from counts c, eligible el
  where exists (
    select 1 from public.usrah_events e
    where e.id = p_event_id
      and public.can_view_event(e.event_type)
  );
$$;

revoke all on function public.event_rsvp_summary(uuid) from public, anon;
grant execute on function public.event_rsvp_summary(uuid) to authenticated;

create or replace function public.event_rsvp_export(p_event_id uuid)
returns table (
  nombor_ahli  text,
  full_name    text,
  generasi     text,
  response     text,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    r.response,
    r.responded_at
  from public.event_rsvp r
  join public.members m on m.id = r.member_id
  join public.usrah_events e on e.id = r.event_id
  where r.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by r.response, m.full_name;
$$;

revoke all on function public.event_rsvp_export(uuid) from public, anon;
grant execute on function public.event_rsvp_export(uuid) to authenticated;


-- 7. DIREKTORI ACARA: tambah valid_until -----------------------------------------
--
-- Skrin ahli memapar butang RSVP hanya sebelum `valid_until`. Selain kolum itu,
-- sama seperti 20260913000025.

drop function if exists public.event_upcoming_directory();

create or replace function public.event_upcoming_directory()
returns table (
  id            uuid,
  event_type    text,
  name          text,
  poster_url    text,
  qr_token      text,
  start_date    date,
  end_date      date,
  start_time    time,
  end_time      time,
  location_text text,
  valid_until   timestamptz
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
    e.qr_token,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location_text,
    e.valid_until
  from public.usrah_events e
  where e.is_active
    and e.end_date >= current_date
    and public.can_read_shared()
  order by e.start_date, e.start_time;
$$;

revoke all on function public.event_upcoming_directory() from public, anon;
grant execute on function public.event_upcoming_directory() to authenticated;

notify pgrst, 'reload schema';
