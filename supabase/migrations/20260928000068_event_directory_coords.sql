-- =============================================================================
-- mysaf-off — event_directory_all() pulangkan latitude/longitude
--
-- Jalankan SELEPAS 20260927000067_fix_five_binti.sql. Idempotent.
--
-- Butang "Navigasi" di event-info.tsx (ahli) perlu koordinat pin. Ahli tiada
-- akses baca terus ke usrah_events, jadi koordinat dipulangkan melalui fungsi
-- SECURITY DEFINER yang sama (pintu can_read_shared() kekal). Koordinat
-- lokasi program bukan rahsia — ahli sudah diarahkan ke sana.
-- Jenis pulangan berubah, maka drop + create.
-- =============================================================================

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
    e.latitude,
    e.longitude,
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
