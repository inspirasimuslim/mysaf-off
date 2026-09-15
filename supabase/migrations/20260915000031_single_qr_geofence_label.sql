-- =============================================================================
-- MySAFF — Satu kod QR, geofence sebagai PELABEL mod, togol QR oleh admin
--
-- Jalankan SELEPAS 20260915000030_hybrid_attendance.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Membatalkan sistem dua-QR (hibrid). Setiap acara kembali kepada SATU
-- `qr_token`. Mod kehadiran tidak lagi ditentukan oleh kod yang diimbas tetapi
-- oleh LOKASI pengimbas:
--   * acara berpin, dalam radius        → 'bersemuka'
--   * acara berpin, luar radius/tiada GPS → 'online'   (DITERIMA, bukan ditolak)
--   * acara tanpa pin                    → 'bersemuka' (tiada rujukan lokasi)
-- Geofence tidak lagi menolak sesiapa.
--
-- `qr_enabled` membolehkan admin mematikan kod QR sementara tanpa mematikan
-- acara. `usrah_attendance_scans.attendance_mode` DIKEKALKAN — rekod sedia ada
-- dan Kehadiran Live/eksport terus menggunakannya.
-- =============================================================================


-- 1. BUANG FUNGSI YANG MERUJUK KOLUM HIBRID --------------------------------------
--
-- Fungsi `language sql`/`plpgsql` tidak mencatat kebergantungan kolum, jadi
-- DROP COLUMN akan berjaya tetapi meninggalkannya rosak. Ia dibuang di sini dan
-- dicipta semula di bawah dalam bentuk satu-QR.

drop function if exists public.usrah_event_by_qr_token(text);
drop function if exists public.record_usrah_attendance(uuid, text, numeric, numeric, text);
drop function if exists public.event_upcoming_directory();


-- 2. TRIGGER TOKEN KEMBALI KE BENTUK ASAL (INSERT SAHAJA) ---------------------------

drop trigger if exists usrah_events_qr_token on public.usrah_events;

create or replace function public.set_usrah_event_qr_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.qr_token is null or length(btrim(new.qr_token)) < 32 then
    new.qr_token := gen_random_uuid()::text;
  end if;
  return new;
end;
$$;

revoke all on function public.set_usrah_event_qr_token() from public, anon;

create trigger usrah_events_qr_token
  before insert on public.usrah_events
  for each row execute function public.set_usrah_event_qr_token();


-- 3. BUANG KEKANGAN & KOLUM HIBRID ---------------------------------------------------

alter table public.usrah_events
  drop constraint if exists usrah_events_online_fields_check,
  drop constraint if exists usrah_events_online_qr_token_key,
  drop constraint if exists usrah_events_event_mode_check;

alter table public.usrah_events
  drop column if exists online_qr_token,
  drop column if exists online_valid_from,
  drop column if exists online_valid_until,
  drop column if exists event_mode;


-- 4. TOGOL KOD QR --------------------------------------------------------------------
--
-- Lalai TRUE: acara baharu terus menerima kehadiran; admin perlu SENGAJA
-- mematikannya. Ditulis melalui policy UPDATE sedia ada (can_edit_event).

alter table public.usrah_events
  add column if not exists qr_enabled boolean not null default true;


-- 5. CARI ACARA MENGIKUT TOKEN (bentuk asal) -----------------------------------------

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
  has_pin                boolean
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
    (e.latitude is not null and e.longitude is not null) as has_pin
  from public.usrah_events e
  where e.qr_token = p_qr_token
    and public.can_read_shared()
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;


-- 6. REKOD KEHADIRAN -----------------------------------------------------------------
--
-- Urutan semakan:
--   kaedah → akaun disekat → rekod ahli → acara & token
--   → qr_enabled (SEBELUM semakan acara yang lain)
--   → aktif / tempoh → duplicate → pelabel mod mengikut jarak.
-- Jarak disimpan untuk KEDUA-DUA mod (audit); NULL bila tiada pin atau tiada GPS.

create function public.record_usrah_attendance(
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

  -- Geofence = PELABEL, bukan penyekat.
  if v_event.latitude is not null and v_event.longitude is not null then
    if p_latitude is not null and p_longitude is not null then
      v_distance := public.haversine_meters(v_event.latitude, v_event.longitude, p_latitude, p_longitude);
      v_mode := case when v_distance <= v_event.geofence_radius_meters then 'bersemuka' else 'online' end;
    else
      -- Tiada GPS: kehadiran fizikal tidak dapat disahkan.
      v_mode := 'online';
    end if;
  else
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


-- 7. DIREKTORI ACARA AHLI (bentuk asal) ----------------------------------------------

create function public.event_upcoming_directory()
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
