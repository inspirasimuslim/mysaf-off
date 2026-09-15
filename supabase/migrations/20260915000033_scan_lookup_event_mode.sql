-- =============================================================================
-- MySAFF — `usrah_event_by_qr_token()` turut memulangkan `event_mode`
--
-- Jalankan SELEPAS 20260915000032_event_mode_geofence.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Tab Scan memapar petunjuk yang tepat sebaik token dipadankan: acara
-- 'bersemuka' menolak imbasan dari luar kawasan, 'hibrid' melabelnya online.
-- Jenis pulangan berubah, jadi fungsi dibuang dan dicipta semula.
-- =============================================================================

drop function if exists public.usrah_event_by_qr_token(text);

create function public.usrah_event_by_qr_token(p_qr_token text)
returns table (
  id                     uuid,
  name                   text,
  event_type             text,
  start_date             date,
  end_date               date,
  start_time             time,
  end_time               time,
  location_text          text,
  geofence_radius_meters integer,
  valid_until            timestamptz,
  is_active              boolean,
  has_pin                boolean,
  event_mode             text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.name,
    e.event_type,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location_text,
    e.geofence_radius_meters,
    e.valid_until,
    e.is_active,
    (e.latitude is not null and e.longitude is not null) as has_pin,
    e.event_mode
  from public.usrah_events e
  where e.qr_token = p_qr_token
    and public.can_read_shared()
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;

notify pgrst, 'reload schema';
