-- =============================================================================
-- mysaf-off — Butiran kehadiran usrah: kawasan, lokasi, tarikh
--
-- Jalankan SELEPAS 20260916000046_cancel_pending_gateway.sql. Idempotent.
--
-- Grid bulanan hanya menjawab "hadir atau tidak". Migration ini menambah DI
-- MANA dan BILA — diisi automatik oleh imbasan QR, atau oleh admin LAJNAH
-- TARBIAH secara manual.
--
-- Baris sedia ada (import Excel) kekal tanpa butiran. Kawasan asal ahli TIDAK
-- diandaikan sebagai kawasan yang dihadiri: ahli boleh hadir usrah kawasan
-- lain, dan tekaan yang kelihatan seperti data lebih buruk daripada kosong.
-- =============================================================================

alter table public.usrah_monthly_attendance
  add column if not exists kawasan_attended text,
  add column if not exists location_text    text,
  add column if not exists attended_date    date,
  add column if not exists recorded_by      text not null default 'system';

alter table public.usrah_monthly_attendance drop constraint if exists usrah_monthly_attendance_recorded_by_check;
alter table public.usrah_monthly_attendance add constraint usrah_monthly_attendance_recorded_by_check
  check (recorded_by in ('system', 'admin'));

-- 8 kod yang sama seperti usrah_events.kawasan_usrah dan members.kawasan_usrah.
alter table public.usrah_monthly_attendance drop constraint if exists usrah_monthly_attendance_kawasan_check;
alter table public.usrah_monthly_attendance add constraint usrah_monthly_attendance_kawasan_check
  check (kawasan_attended is null or kawasan_attended in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA'));


-- =============================================================================
-- 1. IMBASAN QR MENGISI BUTIRAN
--
-- Definisi di bawah disalin daripada pangkalan data semasa; yang berubah hanya
-- pernyataan insert ke usrah_monthly_attendance di hujung. Program bertanda
-- "Ganti Usrah" turut mengisi butirannya (kawasan boleh NULL untuk program).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_usrah_attendance(p_event_id uuid, p_qr_token text, p_latitude numeric, p_longitude numeric, p_method text)
 RETURNS TABLE(event_name text, event_type text, start_date date, end_date date, start_time time without time zone, end_time time without time zone, distance_meters numeric, attendance_mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into public.usrah_monthly_attendance as t (
      member_id, year, month, attended, attendance_source,
      kawasan_attended, location_text, attended_date, recorded_by
    )
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
      case when v_event.event_type = 'usrah' then 'usrah' else 'program_ganti' end,
      v_event.kawasan_usrah,
      v_event.location_text,
      v_event.start_date,
      'system'
    )
    /*
      Bulan belum hadir: baris diambil alih sepenuhnya oleh imbasan ini.
      Bulan SUDAH hadir: attended dan attendance_source kekal (first-write-wins).
      Butiran hanya diisi jika baris itu masih TIADA butiran langsung dan bukan
      catatan admin (cth. baris import lama). Butiran diisi sebagai SATU unit
      daripada satu program, tidak dicampur daripada dua imbasan.
    */
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
$function$;



-- =============================================================================
-- 2. ADMIN MEREKOD / MEMBETULKAN SATU BULAN
--
-- Kebenaran: can_edit_usrah() — LAJNAH TARBIAH (sunting), dan Super Admin
-- melalui has_department_access(). Sama seperti policy insert/update table ini.
--
-- attendance_source baris sedia ada TIDAK diubah (program ganti kekal program
-- ganti); baris baharu mendapat 'usrah'. Bila ditanda TIDAK hadir, butiran
-- dikosongkan — kawasan dan tarikh bagi bulan yang tidak dihadiri tidak
-- bermakna apa-apa.
-- =============================================================================

create or replace function public.admin_set_usrah_attendance(
  p_member_id        uuid,
  p_year             int,
  p_month            int,
  p_attended         boolean,
  p_kawasan_attended text,
  p_location_text    text,
  p_attended_date    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kawasan  text := nullif(upper(trim(coalesce(p_kawasan_attended, ''))), '');
  v_location text := nullif(trim(coalesce(p_location_text, '')), '');
  v_date     date := p_attended_date;
  v_name     text;
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Merekod kehadiran usrah memerlukan kebenaran menyunting pada LAJNAH TARBIAH.'
      using errcode = 'MS001';
  end if;

  if p_attended is null then
    raise exception 'Status kehadiran wajib dipilih.' using errcode = '22023';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'Tahun atau bulan tidak sah.' using errcode = '22023';
  end if;
  if v_kawasan is not null and v_kawasan not in ('US', 'ULK', 'UU', 'UPT', 'UT', 'UTS', 'UB', 'UA') then
    raise exception 'Kod kawasan tidak sah.' using errcode = '22023';
  end if;

  select full_name into v_name from public.members where id = p_member_id;
  if not found then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not p_attended then
    v_kawasan := null;
    v_location := null;
    v_date := null;
  end if;

  insert into public.usrah_monthly_attendance as t (
    member_id, year, month, attended, attendance_source,
    kawasan_attended, location_text, attended_date, recorded_by
  )
  values (p_member_id, p_year, p_month, p_attended, 'usrah', v_kawasan, v_location, v_date, 'admin')
  on conflict (member_id, year, month) do update
    set attended         = excluded.attended,
        kawasan_attended = excluded.kawasan_attended,
        location_text    = excluded.location_text,
        attended_date    = excluded.attended_date,
        recorded_by      = 'admin',
        updated_at       = now();

  perform public.log_admin_activity(
    'Kemas kini kehadiran usrah',
    'usrah_monthly_attendance',
    p_member_id::text,
    jsonb_build_object(
      'label', coalesce(v_name, 'Ahli') || ' · ' || lpad(p_month::text, 2, '0') || '/' || p_year,
      'hadir', p_attended,
      'kawasan', v_kawasan,
      'lokasi', v_location,
      'tarikh', v_date
    ),
    auth.uid()
  );
end;
$$;

revoke all on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) from public, anon;
grant execute on function public.admin_set_usrah_attendance(uuid, int, int, boolean, text, text, date) to authenticated;

notify pgrst, 'reload schema';
