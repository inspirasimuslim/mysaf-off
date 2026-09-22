-- =============================================================================
-- mysaf-off — Direktori SEMUA acara (lampau + semasa + akan datang)
--
-- Jalankan SELEPAS 20260922000054_event_photos.sql.
-- Idempotent.
--
-- `event_upcoming_directory()` (sedia ada) sengaja menapis
-- `end_date >= current_date` — betul untuk carousel Dashboard, tapi terlalu
-- ketat untuk skrin Album global (Tetapan > Lain-lain > Album), yang perlu
-- SENARAI SEMUA acara supaya ahli boleh sumbang gambar ke album acara LAMA.
--
-- `is_upcoming` mengulang SEMULA syarat SAMA PERSIS yang digunakan
-- `event_upcoming_directory()` (`e.end_date >= current_date`), dikira SEKALI
-- di sini dan dihantar sebagai lajur — supaya app client (event-info.tsx)
-- tidak perlu cipta semula perbandingan tarikh sendiri dalam JS (risiko
-- longgar zon waktu antara peranti dan pelayan).
-- =============================================================================

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
    and public.can_read_shared()
  group by e.id
  order by e.start_date desc, e.start_time desc;
$$;

revoke all on function public.event_directory_all() from public, anon;
grant execute on function public.event_directory_all() to authenticated;
