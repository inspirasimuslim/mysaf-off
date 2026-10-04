-- =============================================================================
-- mysaf-off — Halang kehadiran (QR/proximity) sebelum program bermula
--
-- Diminta 2026-10-04: "Halang scan qr kehadiran jika bukan berada pada tempat
-- dan masa event". Semakan attendance_core() (20260924000059) mendapati:
--   * TEMPAT — geofence sudah MENGHALANG (reject, bukan label) untuk
--     event_mode = 'bersemuka' DAN untuk kaedah 'proximity', tidak kira mod.
--     Hanya event hibrid + kaedah scan/upload yang geofence cuma MELABEL
--     ('bersemuka' vs 'online') tanpa menolak — ini SENGAJA dikekalkan,
--     sebab mod hibrid memang bermaksud ahli jauh dibenarkan hadir secara
--     online melalui QR (disahkan dengan pengguna 2026-10-04).
--   * MASA — semakan "program belum bermula" (now() < start_date+start_time)
--     sebelum ini HANYA untuk kaedah 'proximity'. Kaedah scan/upload (QR)
--     tiada semakan ini sama sekali — ahli boleh imbas QR program yang belum
--     bermula langsung. Ini jurang sebenar — dibetulkan di sini.
--
-- Perubahan: alih semakan "belum bermula" keluar daripada blok
-- `if p_method = 'proximity'`, jadi terpakai untuk SEMUA kaedah (scan/upload/
-- proximity). Semakan "program tiada lokasi" (khusus laluan proximity, sebab
-- laluan itu tiada token/cara lain) kekal hanya untuk proximity. Tiada
-- perubahan lain pada attendance_core() — tandatangan sama, create or
-- replace mencukupi.
-- =============================================================================

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

  -- Semakan "belum bermula" kini untuk SEMUA kaedah (dulu hanya proximity) —
  -- lihat komen besar di atas fail ini.
  if now() < ((v_event.start_date + v_event.start_time) at time zone 'Asia/Kuala_Lumpur') then
    raise exception 'Program ini belum bermula.' using errcode = 'P0003';
  end if;

  if p_method = 'proximity' then
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

-- Dalaman sahaja: hanya dipanggil oleh record_usrah_attendance() /
-- record_attendance_proximity() (20260924000059) — grant/revoke tidak berubah.
revoke all on function public.attendance_core(uuid, uuid, numeric, numeric, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
