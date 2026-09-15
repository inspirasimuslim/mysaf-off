-- =============================================================================
-- MySAFF — Kehadiran Hibrid (Bersemuka + Online) untuk usrah DAN program
--
-- Jalankan SELEPAS 20260915000029_org_chart.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Acara 'hibrid' mempunyai DUA kod QR:
--   * `qr_token`        — bersemuka. Logik sedia ada tidak berubah: geofence
--                         wajib, tetingkap `valid_until`.
--   * `online_qr_token` — online. Tiada semakan lokasi langsung; diterima hanya
--                         dalam [online_valid_from, online_valid_until].
--
-- Mod kehadiran ditentukan oleh TOKEN yang dihantar, di pelayan — bukan oleh
-- pilihan di app. Satu ahli tetap SATU rekod setiap acara tanpa mengira mod
-- (kekangan unik (event_id, member_id) sedia ada), jadi dua QR tidak boleh
-- digunakan untuk "hadir dua kali".
--
-- Acara sedia ada menjadi 'bersemuka' melalui nilai lalai kolum — tiada
-- perubahan tingkah laku bagi mereka.
-- =============================================================================


-- 1. KOLUM usrah_events -----------------------------------------------------------

alter table public.usrah_events
  add column if not exists event_mode         text not null default 'bersemuka',
  add column if not exists online_qr_token    text,
  add column if not exists online_valid_from  timestamptz,
  add column if not exists online_valid_until timestamptz;

alter table public.usrah_events drop constraint if exists usrah_events_event_mode_check;
alter table public.usrah_events
  add constraint usrah_events_event_mode_check check (event_mode in ('bersemuka', 'hibrid'));

alter table public.usrah_events drop constraint if exists usrah_events_online_qr_token_key;
alter table public.usrah_events
  add constraint usrah_events_online_qr_token_key unique (online_qr_token);

-- Bentuk baris mesti sepadan dengan modnya: bersemuka tiada apa-apa medan
-- online; hibrid mesti ada token DAN tempoh yang sah.
alter table public.usrah_events drop constraint if exists usrah_events_online_fields_check;
alter table public.usrah_events
  add constraint usrah_events_online_fields_check check (
    (
      event_mode = 'bersemuka'
      and online_qr_token is null
      and online_valid_from is null
      and online_valid_until is null
    )
    or (
      event_mode = 'hibrid'
      and online_qr_token is not null
      and length(btrim(online_qr_token)) >= 32
      and online_qr_token <> qr_token
      and online_valid_from is not null
      and online_valid_until is not null
      and online_valid_until > online_valid_from
    )
  );


-- 2. KOLUM usrah_attendance_scans ---------------------------------------------------

alter table public.usrah_attendance_scans
  add column if not exists attendance_mode text not null default 'bersemuka';

alter table public.usrah_attendance_scans drop constraint if exists usrah_attendance_scans_attendance_mode_check;
alter table public.usrah_attendance_scans
  add constraint usrah_attendance_scans_attendance_mode_check check (attendance_mode in ('bersemuka', 'online'));


-- 3. TOKEN DIJANA PELAYAN -----------------------------------------------------------
--
-- Dilanjutkan daripada `20260913000024_qr_token_server_generated.sql`.
-- `online_qr_token` SENTIASA dijana di sini dan tidak pernah diterima dari app —
-- nilai yang dihantar diabaikan. Pada UPDATE token kekal sama (menukar mod ke
-- hibrid menjana satu jika belum ada); menukar ke bersemuka membuang semua
-- medan online.

create or replace function public.set_usrah_event_qr_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.qr_token is null or length(btrim(new.qr_token)) < 32 then
      new.qr_token := gen_random_uuid()::text;
    end if;

    if new.event_mode = 'hibrid' then
      new.online_qr_token := gen_random_uuid()::text;
    else
      new.online_qr_token := null;
      new.online_valid_from := null;
      new.online_valid_until := null;
    end if;
  else
    if new.event_mode = 'hibrid' then
      new.online_qr_token := coalesce(old.online_qr_token, gen_random_uuid()::text);
    else
      new.online_qr_token := null;
      new.online_valid_from := null;
      new.online_valid_until := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.set_usrah_event_qr_token() from public, anon;

drop trigger if exists usrah_events_qr_token on public.usrah_events;
create trigger usrah_events_qr_token
  before insert or update of event_mode, online_qr_token on public.usrah_events
  for each row execute function public.set_usrah_event_qr_token();


-- 4. CARI ACARA MENGIKUT TOKEN --------------------------------------------------------
--
-- Padan `qr_token` ATAU `online_qr_token`. `attendance_mode` memberitahu app
-- token mana yang sepadan. Bagi token online `has_pin` sentiasa false: pin
-- acara tidak disemak untuk mod itu, jadi app tidak meminta GPS — kebenaran
-- lokasi yang ditolak tidak boleh menghalang ahli yang hadir secara maya.
--
-- Jenis pulangan berubah, jadi fungsi dibuang dan dicipta semula.

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
  attendance_mode        text,
  online_valid_from      timestamptz,
  online_valid_until     timestamptz
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
    case
      when e.qr_token = p_qr_token then (e.latitude is not null and e.longitude is not null)
      else false
    end as has_pin,
    case when e.qr_token = p_qr_token then 'bersemuka' else 'online' end as attendance_mode,
    e.online_valid_from,
    e.online_valid_until
  from public.usrah_events e
  where (
      e.qr_token = p_qr_token
      or (e.event_mode = 'hibrid' and e.online_qr_token = p_qr_token)
    )
    and public.can_read_shared()
  order by (e.qr_token = p_qr_token) desc
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;


-- 5. REKOD KEHADIRAN ------------------------------------------------------------------
--
-- Tandatangan sama (id acara + token). Token yang dihantar menentukan mod:
--   * sepadan `qr_token`        → bersemuka: logik SEDIA ADA sepenuhnya.
--   * sepadan `online_qr_token` → online: tiada geofence (lokasi & jarak NULL),
--                                 tetapi now() mesti dalam tempoh online.
-- Token yang salah mendapat jawapan sama seperti acara yang tiada.
-- Kehadiran online usrah tetap masuk ke grid bulanan — ahli itu hadir.

drop function if exists public.record_usrah_attendance(uuid, text, numeric, numeric, text);

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

  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if v_event.qr_token = p_qr_token then
    v_mode := 'bersemuka';
  elsif v_event.event_mode = 'hibrid' and v_event.online_qr_token = p_qr_token then
    v_mode := 'online';
  else
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not v_event.is_active then
    raise exception 'Program tidak aktif atau tamat tempoh.' using errcode = 'P0003';
  end if;

  if v_mode = 'bersemuka' then
    if now() >= v_event.valid_until then
      raise exception 'Program tidak aktif atau tamat tempoh.' using errcode = 'P0003';
    end if;
  else
    if now() < v_event.online_valid_from then
      raise exception 'Tempoh kehadiran online untuk program ini belum bermula (bermula %).',
        to_char(v_event.online_valid_from at time zone 'Asia/Kuala_Lumpur', 'DD/MM/YYYY HH12:MI AM')
        using errcode = 'P0003';
    end if;
    if now() > v_event.online_valid_until then
      raise exception 'Tempoh kehadiran online untuk program ini sudah tamat.' using errcode = 'P0003';
    end if;
  end if;

  -- Satu ahli, satu rekod setiap acara — tanpa mengira mod.
  if exists (
    select 1 from public.usrah_attendance_scans
    where event_id = p_event_id and member_id = v_member
  ) then
    raise exception 'Kehadiran sudah direkodkan untuk program ini.' using errcode = 'P0001';
  end if;

  if v_mode = 'bersemuka' then
    if v_event.latitude is not null and v_event.longitude is not null then
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
    end if;

    insert into public.usrah_attendance_scans (
      event_id, member_id, latitude, longitude, distance_meters, method, attendance_mode
    )
    values (p_event_id, v_member, p_latitude, p_longitude, v_distance, v_method, 'bersemuka');
  else
    -- Lokasi ahli online TIDAK disimpan walaupun app menghantarnya: ia tidak
    -- digunakan untuk apa-apa semakan.
    insert into public.usrah_attendance_scans (
      event_id, member_id, latitude, longitude, distance_meters, method, attendance_mode
    )
    values (p_event_id, v_member, null, null, null, v_method, 'online');
  end if;

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


-- 6. DIREKTORI ACARA AHLI ---------------------------------------------------------------
--
-- Menambah mod dan kod QR online (dipapar kepada ahli atas sebab yang sama
-- seperti `qr_token` — lihat 20260913000025). Acara hibrid kekal dalam
-- direktori selagi tempoh online belum tamat, walaupun tarikh acara berlalu.

drop function if exists public.event_upcoming_directory();

create function public.event_upcoming_directory()
returns table (
  id                 uuid,
  event_type         text,
  name               text,
  poster_url         text,
  qr_token           text,
  start_date         date,
  end_date           date,
  start_time         time,
  end_time           time,
  location_text      text,
  valid_until        timestamptz,
  event_mode         text,
  online_qr_token    text,
  online_valid_from  timestamptz,
  online_valid_until timestamptz
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
    e.event_mode,
    e.online_qr_token,
    e.online_valid_from,
    e.online_valid_until
  from public.usrah_events e
  where e.is_active
    and (
      e.end_date >= current_date
      or (e.event_mode = 'hibrid' and e.online_valid_until > now())
    )
    and public.can_read_shared()
  order by e.start_date, e.start_time;
$$;

revoke all on function public.event_upcoming_directory() from public, anon;
grant execute on function public.event_upcoming_directory() to authenticated;


-- 7. KEHADIRAN LIVE & EKSPORT -----------------------------------------------------------

drop function if exists public.event_attendance_live(uuid);

create function public.event_attendance_live(p_event_id uuid)
returns table (
  scan_id         uuid,
  full_name       text,
  generasi        text,
  avatar_url      text,
  scanned_at      timestamptz,
  method          text,
  attendance_mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    m.full_name,
    m.generasi,
    m.avatar_url,
    s.scanned_at,
    s.method,
    s.attendance_mode
  from public.usrah_attendance_scans s
  join public.usrah_events e on e.id = s.event_id
  join public.members m on m.id = s.member_id
  where s.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by s.scanned_at desc;
$$;

revoke all on function public.event_attendance_live(uuid) from public, anon;
grant execute on function public.event_attendance_live(uuid) to authenticated;

drop function if exists public.event_attendance_export(uuid);

create function public.event_attendance_export(p_event_id uuid)
returns table (
  nombor_ahli     text,
  full_name       text,
  generasi        text,
  scanned_at      timestamptz,
  method          text,
  attendance_mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    s.scanned_at,
    s.method,
    s.attendance_mode
  from public.usrah_attendance_scans s
  join public.members m on m.id = s.member_id
  join public.usrah_events e on e.id = s.event_id
  where s.event_id = p_event_id
    and public.can_view_event(e.event_type)
  order by s.scanned_at;
$$;

revoke all on function public.event_attendance_export(uuid) from public, anon;
grant execute on function public.event_attendance_export(uuid) to authenticated;

notify pgrst, 'reload schema';
