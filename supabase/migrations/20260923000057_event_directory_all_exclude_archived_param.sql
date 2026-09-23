-- =============================================================================
-- mysaf-off — Pisahkan tapisan album_archived daripada event_directory_all()
--
-- Jalankan SELEPAS 20260923000056_album_archive.sql.
-- Idempotent.
--
-- BUG: `and not album_archived` yang ditambah dalam
-- 20260923000056_album_archive.sql (untuk sorok acara dari senarai skrin
-- Album selepas "Padam Seluruh Album") turut menyorok acara itu daripada
-- event-info.tsx (carousel/butiran ahli), yang memanggil fungsi SAMA.
-- Kesannya, bila admin arkibkan album, SELURUH butiran program/usrah itu
-- hilang untuk ahli — bukan setakat album gambarnya.
--
-- FIX: tambah parameter `p_exclude_archived_album boolean default false`.
-- Default `false` (event-info.tsx) — tiada tapisan album_archived, semua
-- acara tetap dipulangkan. `true` (khusus skrin Album Tetapan) — tapis
-- keluar album_archived=true macam sedia ada.
-- =============================================================================

drop function if exists public.event_directory_all();

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
    and (not p_exclude_archived_album or not e.album_archived)
    and public.can_read_shared()
  group by e.id
  order by e.start_date desc, e.start_time desc;
$$;

revoke all on function public.event_directory_all(boolean) from public, anon;
grant execute on function public.event_directory_all(boolean) to authenticated;
