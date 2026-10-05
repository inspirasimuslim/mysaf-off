-- =============================================================================
-- mysaf-off — Program bermalam + RSVP bawa anak / bermalam
--
-- * usrah_events.bermalam: program/usrah bermalam. Bila true, ahli yang
--   menjawab 'hadir' DIWAJIBKAN bermalam (dikuatkuasakan trigger).
-- * event_rsvp: bawa_anak (0-6 anak), bermalam. Toggle bermalam meliputi ahli
--   dan anak yang dibawa. 'tidak_hadir' mengosongkan kedua-duanya.
-- * Eksport/ringkasan admin dilanjutkan untuk bajet makanan & penginapan.
-- Tiada data sedia ada diubah (kolum baharu, lalai false/0).
-- =============================================================================

alter table public.usrah_events
  add column if not exists bermalam boolean not null default false;

alter table public.event_rsvp
  add column if not exists bil_anak integer not null default 0,
  add column if not exists bermalam boolean not null default false;

alter table public.event_rsvp drop constraint if exists event_rsvp_bil_anak_check;
alter table public.event_rsvp
  add constraint event_rsvp_bil_anak_check check (bil_anak between 0 and 6);

-- Kunci baris + peraturan bermalam (ganti fungsi trigger 027).
create or replace function public.set_event_rsvp_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bermalam boolean;
begin
  new.responded_at := now();
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.member_id := old.member_id;
  end if;

  if new.response = 'tidak_hadir' then
    new.bil_anak := 0;
    new.bermalam := false;
  else
    select e.bermalam into v_bermalam from public.usrah_events e where e.id = new.event_id;
    if coalesce(v_bermalam, false) then
      new.bermalam := true;   -- program bermalam: ahli yang hadir wajib bermalam
    end if;
  end if;
  return new;
end;
$$;

-- Jawapan saya (terperinci).
create or replace function public.my_event_rsvp_detail(p_event_id uuid)
returns table (response text, bil_anak integer, bermalam boolean)
language sql
stable
set search_path = public
as $$
  select r.response, r.bil_anak, r.bermalam
  from public.event_rsvp r
  where r.event_id = p_event_id
    and r.member_id = public.my_member_id();
$$;

revoke all on function public.my_event_rsvp_detail(uuid) from public, anon;
grant execute on function public.my_event_rsvp_detail(uuid) to authenticated;

-- Direktori acara: tambah bermalam.
drop function if exists public.event_directory_all(boolean);

create function public.event_directory_all(p_exclude_archived_album boolean default false)
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
  latitude      double precision,
  longitude     double precision,
  valid_until   timestamptz,
  is_upcoming   boolean,
  photo_count   int,
  bermalam      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.event_type, e.name, e.poster_url, e.qr_token,
    e.start_date, e.end_date, e.start_time, e.end_time, e.location_text,
    e.latitude, e.longitude, e.valid_until,
    e.end_date >= current_date as is_upcoming,
    count(p.id)::int as photo_count,
    e.bermalam
  from public.usrah_events e
  left join public.event_photos p on p.event_id = e.id
  where e.is_active
    and (not p_exclude_archived_album or not e.album_archived)
    and public.can_read_shared()
  group by e.id
  order by e.start_date desc, e.start_time desc;
$$;

revoke all on function public.event_directory_all(boolean) from public, anon;
grant execute on function public.event_directory_all(boolean) to authenticated;

-- Ringkasan admin: tambah bilangan untuk makanan/penginapan.
drop function if exists public.event_rsvp_summary(uuid);

create function public.event_rsvp_summary(p_event_id uuid)
returns table (
  hadir integer, tidak_hadir integer, belum integer,
  anak integer, ahli_bermalam integer, anak_bermalam integer
)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      count(*) filter (where r.response = 'hadir')::integer       as hadir,
      count(*) filter (where r.response = 'tidak_hadir')::integer as tidak_hadir,
      coalesce(sum(r.bil_anak) filter (where r.response = 'hadir'), 0)::integer as anak,
      count(*) filter (where r.response = 'hadir' and r.bermalam)::integer as ahli_bermalam,
      coalesce(sum(r.bil_anak) filter (where r.response = 'hadir' and r.bermalam), 0)::integer as anak_bermalam
    from public.event_rsvp r
    join public.members m on m.id = r.member_id and not m.disekat
    where r.event_id = p_event_id
  ),
  eligible as (
    select count(*)::integer as total
    from public.members m
    where m.user_id is not null and not m.disekat
  )
  select c.hadir, c.tidak_hadir, greatest(el.total - c.hadir - c.tidak_hadir, 0),
         c.anak, c.ahli_bermalam, c.anak_bermalam
  from counts c, eligible el
  where exists (
    select 1 from public.usrah_events e
    where e.id = p_event_id and public.can_view_event(e.event_type)
  );
$$;

revoke all on function public.event_rsvp_summary(uuid) from public, anon;
grant execute on function public.event_rsvp_summary(uuid) to authenticated;

-- Eksport admin: tambah anak + bermalam.
drop function if exists public.event_rsvp_export(uuid);

create function public.event_rsvp_export(p_event_id uuid)
returns table (
  nombor_ahli  text,
  full_name    text,
  generasi     text,
  response     text,
  responded_at timestamptz,
  bil_anak     integer,
  bermalam     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli, m.full_name, m.generasi, r.response, r.responded_at,
    r.bil_anak, r.bermalam
  from public.event_rsvp r
  join public.members m on m.id = r.member_id
  join public.usrah_events e on e.id = r.event_id
  where r.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by r.response, m.full_name;
$$;

revoke all on function public.event_rsvp_export(uuid) from public, anon;
grant execute on function public.event_rsvp_export(uuid) to authenticated;

notify pgrst, 'reload schema';
