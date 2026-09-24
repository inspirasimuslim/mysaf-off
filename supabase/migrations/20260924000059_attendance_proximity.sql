-- =============================================================================
-- MySAFF — Kehadiran Proximity: "Tekan Hadir" bila ahli berada dalam geofence
--
-- Jalankan SELEPAS 20260923000058_ahli_diputihkan.sql. Idempotent.
--
-- 1. usrah_attendance_scans.method menerima 'proximity'.
-- 2. attendance_core(): SATU tempat untuk semua peraturan kehadiran (qr_enabled,
--    aktif/valid_until, duplicate, geofence, rekod scan + grid bulanan). Dipanggil
--    oleh KEDUA-DUA laluan — imbasan QR dan proximity. Tidak boleh dipanggil
--    terus oleh pengguna.
-- 3. record_usrah_attendance(): laluan QR — tandatangan & tingkah laku SAMA;
--    hanya menyemak kaedah + token, kemudian menyerahkan kepada attendance_core().
-- 4. record_attendance_proximity(): laluan proximity — tiada token QR; geofence
--    DIKUATKUASA (menghalang) tanpa mengira event_mode, dikira semula di pelayar.
-- 5. nearby_active_events(): senarai program yang sedang berlangsung dan dalam
--    radius koordinat pengguna. Kosong (bukan ralat) bila tiada.
-- =============================================================================


-- 1. KAEDAH ---------------------------------------------------------------------

alter table public.usrah_attendance_scans drop constraint if exists usrah_attendance_scans_method_check;
alter table public.usrah_attendance_scans
  add constraint usrah_attendance_scans_method_check check (method in ('scan', 'upload', 'proximity'));


-- 2. LOGIK TERAS ----------------------------------------------------------------
--
-- Kandungan disalin daripada record_usrah_attendance() (20260916000047) tanpa
-- perubahan, KECUALI:
--   * token QR tidak disemak di sini (tugas laluan QR);
--   * kaedah 'proximity' sentiasa MENGHALANG di luar radius dan MEMERLUKAN pin +
--     koordinat, walaupun acara berkongsi mod 'hibrid'. Hibrid hanya melabel
--     imbasan QR; "saya berada di lokasi" tanpa bukti jarak tidak boleh diterima;
--   * kaedah 'proximity' juga menolak acara sebelum masa mula.

create or replace function public.attendance_core(
  p_event_id  uuid,
  p_member_id uuid,
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
  v_distance numeric;
  v_mode     text;
  v_blocking boolean;
begin
  if p_method not in ('scan', 'upload', 'proximity') then
    raise exception 'Kaedah kehadiran tidak sah.' using errcode = '22023';
  end if;

  if public.my_account_suspended() then
    raise exception 'Akaun anda telah disekat. Sila hubungi pentadbir.' using errcode = 'P0004';
  end if;

  -- Ahli mesti pemanggil sebenar; fungsi ini tidak boleh merekod untuk orang lain.
  if p_member_id is null or p_member_id is distinct from public.my_member_id() then
    raise exception 'Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir.'
      using errcode = 'P0005';
  end if;

  select * into v_event from public.usrah_events where id = p_event_id for share;
  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not v_event.qr_enabled then
    raise exception 'Kod QR untuk program ini telah dimatikan sementara oleh admin.'
      using errcode = 'P0008';
  end if;

  if not v_event.is_active or now() >= v_event.valid_until then
    raise exception 'Program tidak aktif atau tamat tempoh.' using errcode = 'P0003';
  end if;

  if p_method = 'proximity' then
    if now() < ((v_event.start_date + v_event.start_time) at time zone 'Asia/Kuala_Lumpur') then
      raise exception 'Program ini belum bermula.' using errcode = 'P0003';
    end if;
    if v_event.latitude is null or v_event.longitude is null then
      raise exception 'Program ini tiada lokasi. Sila imbas kod QR.' using errcode = 'P0006';
    end if;
  end if;

  if exists (
    select 1 from public.usrah_attendance_scans
    where event_id = p_event_id and member_id = p_member_id
  ) then
    raise exception 'Kehadiran sudah direkodkan untuk program ini.' using errcode = 'P0001';
  end if;

  v_blocking := v_event.event_mode = 'bersemuka' or p_method = 'proximity';

  if v_event.latitude is not null and v_event.longitude is not null then
    if v_blocking then
      -- Geofence MENGHALANG.
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
      -- Hibrid: geofence MELABEL sahaja.
      if p_latitude is not null and p_longitude is not null then
        v_distance := public.haversine_meters(v_event.latitude, v_event.longitude, p_latitude, p_longitude);
        v_mode := case when v_distance <= v_event.geofence_radius_meters then 'bersemuka' else 'online' end;
      else
        v_mode := 'online';
      end if;
    end if;
  else
    v_mode := 'bersemuka';
  end if;

  insert into public.usrah_attendance_scans (
    event_id, member_id, latitude, longitude, distance_meters, method, attendance_mode
  )
  values (p_event_id, p_member_id, p_latitude, p_longitude, v_distance, p_method, v_mode);

  /*
    Grid bulanan: usrah SENTIASA (bulan sesi usrah); program hanya bila
    `ganti_usrah`, pada bulan yang DIPILIH admin — bukan start_date, bukan now().
    `where attended is distinct from true` = first-write-wins.
  */
  if v_event.event_type = 'usrah' or v_event.ganti_usrah then
    insert into public.usrah_monthly_attendance as t (
      member_id, year, month, attended, attendance_source,
      kawasan_attended, location_text, attended_date, recorded_by
    )
    values (
      p_member_id,
      case
        when v_event.event_type = 'usrah' then coalesce(v_event.year, extract(year from v_event.start_date)::int)
        else v_event.ganti_usrah_year
      end,
      case
        when v_event.event_type = 'usrah' then coalesce(v_event.month, extract(month from v_event.start_date)::int)
        else v_event.ganti_usrah_month
      end,
      true,
      case when v_event.event_type = 'usrah' then 'usrah' else 'program_ganti' end,
      v_event.kawasan_usrah,
      v_event.location_text,
      v_event.start_date,
      'system'
    )
    on conflict (member_id, year, month) do update
      set attended          = true,
          attendance_source = case when t.attended is distinct from true
                                   then excluded.attendance_source else t.attendance_source end,
          kawasan_attended  = excluded.kawasan_attended,
          location_text     = excluded.location_text,
          attended_date     = excluded.attended_date,
          recorded_by       = 'system',
          updated_at        = now()
      where t.attended is distinct from true
         or (t.recorded_by = 'system' and t.kawasan_attended is null
             and t.location_text is null and t.attended_date is null);
  end if;

  return query
    select v_event.name, v_event.event_type, v_event.start_date, v_event.end_date,
           v_event.start_time, v_event.end_time, v_distance, v_mode;
end;
$$;

-- Dalaman sahaja: hanya dipanggil oleh dua fungsi SECURITY DEFINER di bawah.
revoke all on function public.attendance_core(uuid, uuid, numeric, numeric, text) from public, anon, authenticated;


-- 3. LALUAN QR ------------------------------------------------------------------

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
  v_method text := lower(coalesce(p_method, ''));
begin
  -- 'proximity' sengaja tidak diterima di sini: laluan itu tiada token QR.
  if v_method not in ('scan', 'upload') then
    raise exception 'Kaedah kehadiran tidak sah.' using errcode = '22023';
  end if;

  if public.my_account_suspended() then
    raise exception 'Akaun anda telah disekat. Sila hubungi pentadbir.' using errcode = 'P0004';
  end if;

  if public.my_member_id() is null then
    raise exception 'Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir.'
      using errcode = 'P0005';
  end if;

  -- Token yang salah mendapat jawapan SAMA seperti program yang tiada.
  if not exists (
    select 1 from public.usrah_events e
    where e.id = p_event_id and e.qr_token is not distinct from p_qr_token
  ) then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  return query
    select * from public.attendance_core(p_event_id, public.my_member_id(), p_latitude, p_longitude, v_method);
end;
$$;

revoke all on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) to authenticated;


-- 4. LALUAN PROXIMITY -----------------------------------------------------------
--
-- Klien TIDAK dipercayai: event_id dan koordinat boleh dipalsukan. Sebab itu
-- jarak dikira semula di dalam attendance_core() daripada pin acara di database.

create or replace function public.record_attendance_proximity(
  p_event_id  uuid,
  p_latitude  numeric,
  p_longitude numeric
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
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Lokasi anda diperlukan untuk program ini. Hidupkan GPS dan benarkan capaian lokasi.'
      using errcode = 'P0006';
  end if;

  return query
    select * from public.attendance_core(p_event_id, public.my_member_id(), p_latitude, p_longitude, 'proximity');
end;
$$;

revoke all on function public.record_attendance_proximity(uuid, numeric, numeric) from public, anon;
grant execute on function public.record_attendance_proximity(uuid, numeric, numeric) to authenticated;


-- 5. PROGRAM BERDEKATAN ---------------------------------------------------------
--
-- Hanya program yang MEMANG boleh direkod sekarang: aktif, QR hidup, antara masa
-- mula dan valid_until, berpin, dan pengguna dalam radius. Program yang sudah
-- direkod oleh ahli ini dikecualikan supaya "Tekan Hadir" tidak ditawarkan
-- untuk sesuatu yang pasti ditolak. Akaun disekat / belum dipadankan → kosong.

create or replace function public.nearby_active_events(p_latitude numeric, p_longitude numeric)
returns table (event_id uuid, name text, distance_meters numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or v_member is null or public.my_account_suspended() then
    return;
  end if;

  return query
    select e.id, e.name, d.dist
    from public.usrah_events e
    cross join lateral (
      select public.haversine_meters(e.latitude, e.longitude, p_latitude, p_longitude) as dist
    ) d
    where e.is_active
      and e.qr_enabled
      and e.latitude is not null
      and e.longitude is not null
      and now() >= ((e.start_date + e.start_time) at time zone 'Asia/Kuala_Lumpur')
      and now() <  e.valid_until
      and d.dist <= e.geofence_radius_meters
      and not exists (
        select 1 from public.usrah_attendance_scans s
        where s.event_id = e.id and s.member_id = v_member
      )
    order by d.dist asc;
end;
$$;

revoke all on function public.nearby_active_events(numeric, numeric) from public, anon;
grant execute on function public.nearby_active_events(numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
