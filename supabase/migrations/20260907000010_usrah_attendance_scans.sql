-- =============================================================================
-- mysaf-off — Imbasan QR kehadiran usrah (Fasa B)
--
-- Jalankan SELEPAS 20260907000009_usrah_events.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Fasa A memberi admin cara MENCIPTA program dan menjana kod QRnya. Fasa ini
-- memberi ahli cara MENUNTUT kehadiran terhadap program itu — dan setiap syarat
-- tuntutan diadili di sini, bukan di app. Peranti pengguna memegang GPS, jamnya
-- sendiri dan kod QR; tiada satu pun daripada tiga itu yang boleh dipercayai
-- sebagai bukti, jadi RPC di bawah menerima nombor mentah sahaja dan membuat
-- keputusannya sendiri.
-- =============================================================================


-- =============================================================================
-- 1. TABLE usrah_attendance_scans
--
-- Baris ini ialah JEJAK AUDIT, bukan sumber kebenaran laporan. Laporan bulanan
-- terus dibaca daripada `usrah_monthly_attendance` (yang juga menerima import
-- Excel), manakala table ini menyimpan bukti bagaimana satu kehadiran sampai ke
-- sana: bila diimbas, dari koordinat mana, dan berapa jauh dari pin program.
-- =============================================================================

create table if not exists public.usrah_attendance_scans (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.usrah_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  scanned_at timestamptz not null default now(),

  -- Koordinat SEPERTI DILAPORKAN oleh peranti, disimpan walaupun setelah
  -- diterima: bila satu kehadiran dipertikaikan kemudian, jarak yang dikira
  -- pada masa itu lebih berguna daripada keputusan lulus/gagal semata-mata.
  latitude        numeric,
  longitude       numeric,
  distance_meters numeric,

  method text not null check (method in ('scan', 'upload')),

  -- Satu ahli, satu program, satu baris. Kekangan ini — dan bukan semakan dalam
  -- app — yang menjadikan imbasan kedua mustahil walaupun dua permintaan tiba
  -- serentak.
  unique (event_id, member_id)
);

create index if not exists usrah_attendance_scans_event_idx
  on public.usrah_attendance_scans (event_id, scanned_at desc);

create index if not exists usrah_attendance_scans_member_idx
  on public.usrah_attendance_scans (member_id, scanned_at desc);


-- =============================================================================
-- 2. ROW LEVEL SECURITY
--
-- Ahli MEMASUKKAN rekod dirinya sendiri tetapi tidak boleh mengubah atau
-- memadamnya: kehadiran yang sudah dituntut ialah fakta yang direkodkan, bukan
-- catatan yang boleh dikemas semula oleh orang yang membuatnya. Tiada policy
-- UPDATE atau DELETE untuk ahli langsung — pembetulan ialah kerja LAJNAH
-- TARBIAH.
--
-- Policy INSERT di bawah kekal walaupun laluan sebenar app melalui RPC
-- `security definer`: ia menutup pintu terus ke PostgREST, supaya seseorang yang
-- memanggil REST API secara langsung tidak boleh menulis baris bagi ahli lain.
-- =============================================================================

alter table public.usrah_attendance_scans enable row level security;

drop policy if exists usrah_scans_select on public.usrah_attendance_scans;
create policy usrah_scans_select on public.usrah_attendance_scans
  for select to authenticated
  using (
    public.can_view_usrah()
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists usrah_scans_insert on public.usrah_attendance_scans;
create policy usrah_scans_insert on public.usrah_attendance_scans
  for insert to authenticated
  with check (not public.my_account_suspended() and member_id = public.my_member_id());

drop policy if exists usrah_scans_update on public.usrah_attendance_scans;
create policy usrah_scans_update on public.usrah_attendance_scans
  for update to authenticated
  using (public.can_edit_usrah())
  with check (public.can_edit_usrah());

drop policy if exists usrah_scans_delete on public.usrah_attendance_scans;
create policy usrah_scans_delete on public.usrah_attendance_scans
  for delete to authenticated
  using (public.can_edit_usrah());

grant select, insert, update, delete on public.usrah_attendance_scans to authenticated;


-- =============================================================================
-- 3. JARAK HAVERSINE
--
-- Dipisahkan daripada RPC supaya ia boleh diuji sendiri dengan koordinat yang
-- diketahui. `immutable` kerana jawapannya bergantung pada argumen sahaja.
--
-- PostGIS akan lebih tepat, tetapi ia extension yang perlu dihidupkan dan
-- diselenggara; untuk radius berpuluh hingga beribu meter, ralat haversine
-- (bumi sebagai sfera dan bukan sferoid) di bawah satu peratus — jauh lebih
-- kecil daripada ralat GPS telefon itu sendiri.
-- =============================================================================

create or replace function public.haversine_meters(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
as $$
  select round(
    (
      2 * 6371000 * asin(
        sqrt(
          power(sin(radians(lat2 - lat1) / 2), 2)
          + cos(radians(lat1)) * cos(radians(lat2))
            * power(sin(radians(lon2 - lon1) / 2), 2)
        )
      )
    )::numeric,
    1
  );
$$;

revoke all on function public.haversine_meters(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.haversine_meters(numeric, numeric, numeric, numeric) to authenticated;


-- =============================================================================
-- 4. CARI PROGRAM DARIPADA KOD QR
--
-- Ahli tidak boleh SELECT `usrah_events` (lihat 20260907000009) dan itu kekal
-- begitu: menyenaraikan semua program akan mendedahkan setiap `qr_token`, yang
-- bermakna sesiapa boleh mendakwa hadir di mana-mana. Fungsi ini membalikkan
-- arahnya — ia menerima token yang SUDAH dipegang pengimbas dan memulangkan
-- program itu sahaja, tanpa `qr_token` dalam jawapannya.
--
-- Ia sengaja tidak menolak program yang tamat atau dimatikan: skrin imbasan
-- perlu tahu program APA yang diimbas untuk memberi mesej yang bermakna, dan
-- keputusan menerima atau menolak tetap dibuat oleh RPC di bahagian 5.
-- =============================================================================

create or replace function public.usrah_event_by_qr_token(p_qr_token text)
returns table (
  id                     uuid,
  name                   text,
  event_date             date,
  event_time             time,
  location_text          text,
  geofence_radius_meters int,
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
    e.event_date,
    e.event_time,
    e.location_text,
    e.geofence_radius_meters,
    e.valid_until,
    e.is_active,
    (e.latitude is not null and e.longitude is not null) as has_pin
  from public.usrah_events e
  where e.qr_token = p_qr_token
    and not public.my_account_suspended()
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;


-- =============================================================================
-- 5. REKOD KEHADIRAN
--
-- Satu-satunya laluan tulis bagi ahli. Setiap syarat disemak DI SINI kerana
-- setiap satunya boleh dipalsukan di sebelah sana: jam peranti (tetingkap sah),
-- koordinat GPS (geofence), dan keadaan skrin (kehadiran berulang). App hanya
-- menghantar tiga nombor dan satu id; segala-galanya yang lain dibaca semula
-- daripada pangkalan data.
--
-- Ralat dilontar dengan `errcode` tersendiri dan bukan hanya teks: app boleh
-- membezakan "di luar kawasan" daripada "sudah hadir" tanpa mencocokkan ayat
-- Bahasa Malaysia, sementara `message` kekal sedia untuk dipapar terus.
-- =============================================================================

create or replace function public.record_usrah_attendance(
  p_event_id  uuid,
  p_latitude  numeric,
  p_longitude numeric,
  p_method    text
)
returns table (
  event_name      text,
  event_date      date,
  event_time      time,
  distance_meters numeric
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
begin
  -- Nilai selain dua ini bermakna app menghantar sesuatu yang tidak difahami;
  -- ia ditolak dan bukan dinormalkan senyap-senyap.
  v_method := lower(coalesce(p_method, ''));
  if v_method not in ('scan', 'upload') then
    raise exception 'Kaedah kehadiran tidak sah.' using errcode = '22023';
  end if;

  -- (b) Ahli. Akaun yang disekat ditolak sebelum apa-apa lagi dibaca — sekatan
  -- bukan sesuatu yang boleh dilangkau dengan mengimbas lebih laju.
  if public.my_account_suspended() then
    raise exception 'Akaun anda telah disekat. Sila hubungi pentadbir.' using errcode = 'P0004';
  end if;

  v_member := public.my_member_id();
  if v_member is null then
    raise exception 'Akaun anda belum dipadankan dengan rekod ahli. Hubungi pentadbir.'
      using errcode = 'P0005';
  end if;

  -- (a) Program. `for share` menahan baris ini sehingga transaksi tamat, jadi
  -- program yang dimatikan di pertengahan tidak menghasilkan keputusan yang
  -- bercanggah dengan apa yang disemak sebentar tadi.
  select * into v_event from public.usrah_events where id = p_event_id for share;

  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not v_event.is_active or now() >= v_event.valid_until then
    raise exception 'Program tidak aktif atau tamat tempoh.' using errcode = 'P0003';
  end if;

  -- (d) Kehadiran berulang disemak SEBELUM geofence supaya ahli yang sudah
  -- hadir mendapat jawapan yang betul walaupun dia sudah beredar dari lokasi.
  if exists (
    select 1 from public.usrah_attendance_scans
    where event_id = p_event_id and member_id = v_member
  ) then
    raise exception 'Kehadiran sudah direkodkan untuk program ini.' using errcode = 'P0001';
  end if;

  -- (c) Geofence. Program tanpa pin lokasi tidak boleh disemak jaraknya; ia
  -- diterima dengan `distance_meters` NULL, yang jujur tentang apa yang
  -- diketahui dan bukan menyamar sebagai jarak sifar.
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

  -- (e) Kedua-dua tulisan dalam satu transaksi: fungsi ini ialah satu pernyataan
  -- dari sudut pandangan pemanggil, jadi kegagalan pada upsert membatalkan baris
  -- imbasan juga. Jejak audit yang tidak sepadan dengan laporan adalah lebih
  -- teruk daripada tiada jejak langsung.
  insert into public.usrah_attendance_scans (
    event_id, member_id, latitude, longitude, distance_meters, method
  )
  values (p_event_id, v_member, p_latitude, p_longitude, v_distance, v_method);

  /*
    Bulan diambil daripada TARIKH PROGRAM dan bukan daripada `now()`. Program
    lewat malam yang diimbas selepas tengah malam masih milik bulan program itu,
    dan itu tarikh yang sama yang dilihat admin dalam laporan.

    `where ... is distinct from true` melindungi rekod sedia ada: sel yang sudah
    ditanda hadir tidak ditulis semula, jadi upsert ini tidak menyentuh apa yang
    sudah betul.
  */
  insert into public.usrah_monthly_attendance (member_id, year, month, attended)
  values (
    v_member,
    extract(year from v_event.event_date)::int,
    extract(month from v_event.event_date)::int,
    true
  )
  on conflict (member_id, year, month) do update
    set attended = true, updated_at = now()
    where public.usrah_monthly_attendance.attended is distinct from true;

  return query
    select v_event.name, v_event.event_date, v_event.event_time, v_distance;
end;
$$;

revoke all on function public.record_usrah_attendance(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_usrah_attendance(uuid, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
