-- =============================================================================
-- MySAFF — Jenis kehadiran: geofence MENGHALANG (bersemuka) atau MELABEL (hibrid)
--
-- Jalankan SELEPAS 20260915000031_single_qr_geofence_label.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Masih SATU kod QR setiap acara. `event_mode` hanya menentukan peranan
-- geofence pada acara berpin:
--   * 'bersemuka' — luar radius DITOLAK (P0007), tiada GPS DITOLAK (P0006);
--                   dalam radius diterima sebagai 'bersemuka'.
--   * 'hibrid'    — tingkah laku 20260915000031 tanpa perubahan: diterima dari
--                   mana-mana lokasi, dilabel 'bersemuka'/'online' ikut jarak.
-- Acara tanpa pin: diterima sebagai 'bersemuka' dalam kedua-dua mod.
-- =============================================================================


-- 1. KOLUM ------------------------------------------------------------------------
--
-- Acara SEDIA ADA dicipta semasa geofence hanya melabel, jadi mereka mesti
-- menjadi 'hibrid' — bukan menerima lalai 'bersemuka' dan tiba-tiba menolak
-- kehadiran dari luar kawasan.
--
-- Caranya: kolum ditambah dengan lalai 'hibrid' (setiap baris sedia ada terus
-- mendapat nilai itu dalam ALTER yang sama), kemudian lalai ditukar kepada
-- 'bersemuka' untuk acara BAHARU. Tiada UPDATE, jadi tiada trigger berjalan dan
-- `updated_at` baris lama tidak berubah. Dibungkus dalam semakan kewujudan
-- supaya menjalankan semula tidak menukar acara baharu 'bersemuka' kepada hibrid.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usrah_events' and column_name = 'event_mode'
  ) then
    alter table public.usrah_events add column event_mode text not null default 'hibrid';
    alter table public.usrah_events alter column event_mode set default 'bersemuka';
  end if;
end;
$$;

alter table public.usrah_events drop constraint if exists usrah_events_event_mode_check;
alter table public.usrah_events
  add constraint usrah_events_event_mode_check check (event_mode in ('bersemuka', 'hibrid'));


-- 2. REKOD KEHADIRAN -----------------------------------------------------------------
--
-- Tandatangan dan jenis pulangan SAMA seperti 20260915000031, jadi app tidak
-- berubah. Urutan semakan tidak berubah: kaedah → akaun → rekod ahli → token
-- → qr_enabled → aktif/tempoh → duplicate → geofence. Hanya bahagian geofence
-- bercabang ikut `event_mode` TERKINI acara pada saat imbasan.

create or replace function public.record_usrah_attendance(
  p_event_id  uuid,
  p_qr_token  text,
  p_latitude  numeric,
  p_longitude numeric,
  p_method    text
)
returns table (
  event_name      text,
  event_type      text,
  start_date      date,
  end_date        date,
  start_time      time,
  end_time        time,
  distance_meters numeric,
  attendance_mode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    public.usrah_events%rowtype;
  v_member   uuid;
  v_distance numeric;
  v_method   text;
  v_mode     text;
begin
  v_method := lower(coalesce(p_method, ''));
  if v_method not in ('scan', 'upload') then
    raise exception 'Kaedah kehadiran tidak sah.' using errcode = '22023';
  end if;

  if public.my_account_suspended() then
    raise exception 'Akaun anda telah disekat. Sila hubungi pentadbir.' using errcode = 'P0004';
  end if;

  v_member := public.my_member_id();
  if v_member is null then
    raise exception 'Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir.'
      using errcode = 'P0005';
  end if;

  select * into v_event from public.usrah_events where id = p_event_id for share;

  -- Token yang salah mendapat jawapan SAMA seperti program yang tiada.
  if not found or v_event.qr_token is distinct from p_qr_token then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not v_event.qr_enabled then
    raise exception 'Kod QR untuk program ini telah dimatikan sementara oleh admin.'
      using errcode = 'P0008';
  end if;

  if not v_event.is_active or now() >= v_event.valid_until then
    raise exception 'Program tidak aktif atau tamat tempoh.' using errcode = 'P0003';
  end if;

  if exists (
    select 1 from public.usrah_attendance_scans
    where event_id = p_event_id and member_id = v_member
  ) then
    raise exception 'Kehadiran sudah direkodkan untuk program ini.' using errcode = 'P0001';
  end if;

  if v_event.latitude is not null and v_event.longitude is not null then
    if v_event.event_mode = 'bersemuka' then
      -- Geofence MENGHALANG — tingkah laku sebelum fasa hibrid.
      if p_latitude is null or p_longitude is null then
        raise exception 'Lokasi anda diperlukan untuk program ini. Hidupkan GPS dan benarkan capaian lokasi.'
          using errcode = 'P0006';
      end if;

      v_distance := public.haversine_meters(v_event.latitude, v_event.longitude, p_latitude, p_longitude);

      if v_distance > v_event.geofence_radius_meters then
        raise exception 'Anda berada di luar kawasan program (jarak: %m, had: %m).',
          round(v_distance)::int, v_event.geofence_radius_meters
          using errcode = 'P0007';
      end if;

      v_mode := 'bersemuka';
    else
      -- Hibrid: geofence MELABEL sahaja (20260915000031, tidak berubah).
      if p_latitude is not null and p_longitude is not null then
        v_distance := public.haversine_meters(v_event.latitude, v_event.longitude, p_latitude, p_longitude);
        v_mode := case when v_distance <= v_event.geofence_radius_meters then 'bersemuka' else 'online' end;
      else
        -- Tiada GPS: kehadiran fizikal tidak dapat disahkan.
        v_mode := 'online';
      end if;
    end if;
  else
    -- Tiada pin: tiada rujukan lokasi untuk menghalang atau melabel.
    v_mode := 'bersemuka';
  end if;

  insert into public.usrah_attendance_scans (
    event_id, member_id, latitude, longitude, distance_meters, method, attendance_mode
  )
  values (p_event_id, v_member, p_latitude, p_longitude, v_distance, v_method, v_mode);

  -- Grid bulanan hanya menerima kehadiran usrah — lihat 20260907000011.
  if v_event.event_type = 'usrah' then
    insert into public.usrah_monthly_attendance (member_id, year, month, attended)
    values (
      v_member,
      coalesce(v_event.year,  extract(year  from v_event.start_date)::int),
      coalesce(v_event.month, extract(month from v_event.start_date)::int),
      true
    )
    on conflict (member_id, year, month) do update
      set attended = true, updated_at = now()
      where public.usrah_monthly_attendance.attended is distinct from true;
  end if;

  return query
    select v_event.name, v_event.event_type, v_event.start_date, v_event.end_date,
           v_event.start_time, v_event.end_time, v_distance, v_mode;
end;
$$;

revoke all on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
