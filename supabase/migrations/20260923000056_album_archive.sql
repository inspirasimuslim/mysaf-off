-- =============================================================================
-- mysaf-off — "Padam Seluruh Album" turut sorok acara dari senarai Album
--
-- Jalankan SELEPAS 20260922000055_event_directory_all.sql.
-- Idempotent.
--
-- TIDAK guna `usrah_events.is_active` sedia ada — kolum itu dikongsi merentasi
-- carousel Dashboard, RSVP, kod QR kehadiran, kehadiran/scan, senarai admin,
-- dll (lihat setiap `where e.is_active` dalam migrations lain). Menetapkannya
-- `false` di sini akan MENYORROK acara itu daripada SEMUA tempat itu sekali,
-- bukan setakat Album — kesan sampingan besar yang tidak diminta. `album_archived`
-- ialah kolum BAHARU, KHUSUS untuk skrin Album sahaja, supaya tiada fungsi lain
-- terjejas.
-- =============================================================================

alter table public.usrah_events
  add column if not exists album_archived boolean not null default false;

drop function if exists public.event_directory_all();

create function public.event_directory_all()
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
  valid_until   timestamptz,
  is_upcoming   boolean,
  photo_count   int
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
    e.valid_until,
    e.end_date >= current_date as is_upcoming,
    count(p.id)::int as photo_count
  from public.usrah_events e
  left join public.event_photos p on p.event_id = e.id
  where e.is_active
    and not e.album_archived
    and public.can_read_shared()
  group by e.id
  order by e.start_date desc, e.start_time desc;
$$;

revoke all on function public.event_directory_all() from public, anon;
grant execute on function public.event_directory_all() to authenticated;
