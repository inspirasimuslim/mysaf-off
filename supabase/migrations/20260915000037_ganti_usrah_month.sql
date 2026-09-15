-- =============================================================================
-- MySAFF — Ganti Usrah: bulan & tahun dipilih eksplisit
--
-- Jalankan SELEPAS 20260915000036_ganti_usrah.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Bulan usrah yang diganti kini dipilih admin (`ganti_usrah_year`,
-- `ganti_usrah_month`) dan tidak lagi diambil dari `start_date` program.
-- `start_date` kekal tarikh sebenar program (QR, geofence, valid_until).
--
-- Penggantian TIDAK terikat kepada kawasan usrah ahli: `usrah_monthly_attendance`
-- tidak pernah mempunyai kolum kawasan (kunci unik = member_id, year, month),
-- jadi setiap ahli yang hadir mendapat bulan yang sama — tingkah laku sedia ada.
-- =============================================================================


-- 1. KOLUM ------------------------------------------------------------------------

alter table public.usrah_events
  add column if not exists ganti_usrah_year  integer,
  add column if not exists ganti_usrah_month integer;

alter table public.usrah_events drop constraint if exists usrah_events_ganti_usrah_year_check;
alter table public.usrah_events
  add constraint usrah_events_ganti_usrah_year_check
  check (ganti_usrah_year is null or ganti_usrah_year between 2000 and 2100);

alter table public.usrah_events drop constraint if exists usrah_events_ganti_usrah_month_check;
alter table public.usrah_events
  add constraint usrah_events_ganti_usrah_month_check
  check (ganti_usrah_month is null or ganti_usrah_month between 1 and 12);

-- Program ganti yang dicipta sebelum migration ini mengikut bulan start_date —
-- isi dengan nilai itu supaya tingkah lakunya tidak berubah dan kekangan lulus.
update public.usrah_events
set ganti_usrah_year  = extract(year  from start_date)::int,
    ganti_usrah_month = extract(month from start_date)::int
where ganti_usrah
  and (ganti_usrah_year is null or ganti_usrah_month is null);

-- Bila ganti_usrah dihidupkan, KEDUA-DUA tahun dan bulan wajib diisi.
alter table public.usrah_events drop constraint if exists usrah_events_ganti_usrah_fields_check;
alter table public.usrah_events
  add constraint usrah_events_ganti_usrah_fields_check
  check (not ganti_usrah or (ganti_usrah_year is not null and ganti_usrah_month is not null));


-- 2. REKOD KEHADIRAN -----------------------------------------------------------------
--
-- Sama seperti 20260915000036 kecuali bulan grid bagi program ganti.

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
  values (p_event_id, v_member, p_latitude, p_longitude, v_distance, v_method, v_mode);

  /*
    Grid bulanan: usrah SENTIASA (bulan sesi usrah); program hanya bila
    `ganti_usrah`, pada bulan yang DIPILIH admin — bukan start_date, bukan now().
    Tiada rujukan kawasan: bulan yang sama untuk setiap ahli yang hadir.
    `where attended is distinct from true` = first-write-wins.
  */
  if v_event.event_type = 'usrah' or v_event.ganti_usrah then
    insert into public.usrah_monthly_attendance (member_id, year, month, attended, attendance_source)
    values (
      v_member,
      case
        when v_event.event_type = 'usrah' then coalesce(v_event.year, extract(year from v_event.start_date)::int)
        else v_event.ganti_usrah_year
      end,
      case
        when v_event.event_type = 'usrah' then coalesce(v_event.month, extract(month from v_event.start_date)::int)
        else v_event.ganti_usrah_month
      end,
      true,
      case when v_event.event_type = 'usrah' then 'usrah' else 'program_ganti' end
    )
    on conflict (member_id, year, month) do update
      set attended = true,
          attendance_source = excluded.attendance_source,
          updated_at = now()
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
