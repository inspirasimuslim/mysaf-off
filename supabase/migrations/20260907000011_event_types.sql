-- =============================================================================
-- mysaf-off — Dua jenis program dalam satu table
--
-- Jalankan SELEPAS 20260907000010_usrah_attendance_scans.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- `usrah_events` kini memegang DUA jenis acara: usrah bulanan (milik LAJNAH
-- TARBIAH) dan program am (milik JABATAN SETIAUSAHA). Satu table dan bukan dua
-- kerana segala-galanya yang membuatkan table ini berguna — kod QR, geofence,
-- tetingkap sah, jejak imbasan — adalah sama bagi kedua-duanya. Yang berbeza
-- hanyalah SIAPA yang menguruskannya dan KE MANA kehadirannya mengalir, dan
-- kedua-dua perbezaan itu muat dalam satu kolum.
--
-- Nama table kekal `usrah_events`. Menamakannya semula akan menyentuh setiap
-- policy, fungsi dan pertanyaan yang sudah berfungsi, demi ketepatan istilah
-- semata-mata.
-- =============================================================================


-- =============================================================================
-- 1. KOLUM BAHARU
--
-- Semuanya ditambah dengan default atau nullable supaya dua program sedia ada
-- kekal sah pada saat kolum wujud, sebelum pengisian di bahagian 2 berjalan.
-- =============================================================================

alter table public.usrah_events
  add column if not exists event_type    text not null default 'usrah',
  add column if not exists kawasan_usrah text,
  add column if not exists year          int,
  add column if not exists month         int,
  add column if not exists start_date    date,
  add column if not exists end_date      date,
  add column if not exists start_time    time,
  add column if not exists end_time      time;


-- =============================================================================
-- 2. PINDAH DATA LAMA
--
-- Program sedia ada ialah acara satu hari, satu masa. Ia menjadi julat yang
-- bermula dan berakhir pada titik yang sama — bentuk yang sama, dinyatakan
-- dalam kolum baharu, tanpa satu pun baris berubah maksudnya.
--
-- `year`/`month` turut diisi daripada tarikh supaya baris lama tidak menjadi
-- kes khas yang perlu diingati di setiap tempat lain.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usrah_events' and column_name = 'event_date'
  ) then
    execute $migrate$
      update public.usrah_events
      set start_date = coalesce(start_date, event_date),
          end_date   = coalesce(end_date,   event_date),
          start_time = coalesce(start_time, event_time),
          end_time   = coalesce(end_time,   event_time),
          year       = coalesce(year,  extract(year  from event_date)::int),
          month      = coalesce(month, extract(month from event_date)::int)
    $migrate$;
  end if;
end;
$$;

/*
  `event_date` dan `event_time` DIGUGURKAN dan bukan dikekalkan bersebelahan
  dengan julat baharu. Dua kolum yang memegang fakta yang sama akan menyimpang
  pada kemas kini pertama yang terlupa menyentuh kedua-duanya, dan pembaca
  seterusnya tidak akan tahu yang mana betul. Setiap rujukan kepadanya dalam app
  dan dalam fungsi di bawah ditukar kepada `start_date`/`start_time` dalam
  perubahan yang sama.
*/
/*
  Dua objek bergantung pada kolum itu dan digugurkan dahulu, satu per satu —
  bukan dengan `cascade`, yang akan turut menyapu apa-apa lain yang bergantung
  padanya tanpa memberitahu.

  Trigger termasuk kerana ia disenaraikan `update of event_date, event_time`:
  trigger yang menamakan kolum memegang rujukan kepada kolum itu. Ia dicipta
  semula di bahagian 4, kini atas kolum julat.
*/
drop index if exists public.usrah_events_date_idx;
drop trigger if exists usrah_events_valid_until on public.usrah_events;

alter table public.usrah_events drop column if exists event_date;
alter table public.usrah_events drop column if exists event_time;

alter table public.usrah_events
  alter column start_date set not null,
  alter column end_date   set not null,
  alter column start_time set not null,
  alter column end_time   set not null;

create index if not exists usrah_events_start_date_idx on public.usrah_events (start_date desc);
create index if not exists usrah_events_type_idx on public.usrah_events (event_type, start_date desc);


-- =============================================================================
-- 3. KEKANGAN
--
-- Kawasan, tahun dan bulan ialah bahasa usrah bulanan sahaja. Kekangan di bawah
-- menjadikannya mustahil untuk satu baris 'program' memegang nilai itu — bukan
-- kerana ia akan merosakkan apa-apa, tetapi kerana baris yang memegangnya akan
-- membuatkan pembaca seterusnya percaya ia bermakna sesuatu.
-- =============================================================================

alter table public.usrah_events drop constraint if exists usrah_events_event_type_check;
alter table public.usrah_events add constraint usrah_events_event_type_check
  check (event_type in ('usrah', 'program'));

alter table public.usrah_events drop constraint if exists usrah_events_month_check;
alter table public.usrah_events add constraint usrah_events_month_check
  check (month is null or month between 1 and 12);

alter table public.usrah_events drop constraint if exists usrah_events_year_check;
alter table public.usrah_events add constraint usrah_events_year_check
  check (year is null or year between 2000 and 2100);

alter table public.usrah_events drop constraint if exists usrah_events_program_fields_check;
alter table public.usrah_events add constraint usrah_events_program_fields_check
  check (
    event_type <> 'program'
    or (kawasan_usrah is null and year is null and month is null)
  );

alter table public.usrah_events drop constraint if exists usrah_events_range_check;
alter table public.usrah_events add constraint usrah_events_range_check
  check (end_date >= start_date);


-- =============================================================================
-- 4. TETINGKAP SAH DIKIRA DARIPADA PENGHUJUNG
--
-- Sebelum ini tiga jam selepas program BERMULA. Dengan julat, itu akan menutup
-- kehadiran di tengah-tengah program tiga hari — jadi ia kini tiga jam selepas
-- program TAMAT.
--
-- Zon masa dikendalikan sama seperti sebelumnya: tarikh dan masa digabung
-- DAHULU, barulah ditafsir dalam waktu Malaysia. Tanpa itu, '8:00 malam' akan
-- disimpan sebagai 8:00 UTC dan tetingkapnya tamat lapan jam terlalu awal.
-- =============================================================================

create or replace function public.set_usrah_event_valid_until()
returns trigger
language plpgsql
as $$
begin
  new.valid_until :=
    ((new.end_date + new.end_time) at time zone 'Asia/Kuala_Lumpur') + interval '3 hours';
  return new;
end;
$$;

drop trigger if exists usrah_events_valid_until on public.usrah_events;
create trigger usrah_events_valid_until
  before insert or update of start_date, start_time, end_date, end_time on public.usrah_events
  for each row execute function public.set_usrah_event_valid_until();

-- Kira semula bagi baris sedia ada, yang `valid_until`nya masih berasaskan
-- masa mula.
update public.usrah_events
set valid_until = ((end_date + end_time) at time zone 'Asia/Kuala_Lumpur') + interval '3 hours';


-- =============================================================================
-- 5. KEBENARAN MENGIKUT JENIS
--
-- `has_department_access(dept_name, need_edit, uid)` sudah menerima nama
-- department sebagai parameter sejak 20260906000002, jadi tiada mekanisme
-- kebenaran baharu diperkenalkan di sini — hanya pemetaan daripada jenis acara
-- kepada department yang memilikinya.
--
-- Pemetaan itu tinggal di SATU tempat. Menyebarkan `case event_type ...` ke
-- dalam setiap policy bermakna menambah jenis ketiga kelak perlu menemui
-- semula setiap salinannya.
-- =============================================================================

create or replace function public.event_department(p_event_type text)
returns text
language sql
immutable
as $$
  select case p_event_type
    when 'program' then 'JABATAN SETIAUSAHA'
    else 'LAJNAH TARBIAH'
  end;
$$;

create or replace function public.can_view_event(p_event_type text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access(public.event_department(p_event_type), false, uid);
$$;

create or replace function public.can_edit_event(p_event_type text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_department_access(public.event_department(p_event_type), true, uid);
$$;

/*
  Pintasan bernama untuk modul Program, seiring dengan `can_view_usrah()` /
  `can_edit_usrah()` yang sudah wujud. Kedua-duanya menyerahkan kerja kepada
  fungsi di atas supaya nama department hanya tertulis sekali.
*/
create or replace function public.can_view_program(uid uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select public.can_view_event('program', uid);
$$;

create or replace function public.can_edit_program(uid uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select public.can_edit_event('program', uid);
$$;

revoke all on function public.event_department(text) from public, anon;
revoke all on function public.can_view_event(text, uuid) from public, anon;
revoke all on function public.can_edit_event(text, uuid) from public, anon;
revoke all on function public.can_view_program(uuid) from public, anon;
revoke all on function public.can_edit_program(uuid) from public, anon;

grant execute on function public.event_department(text) to authenticated;
grant execute on function public.can_view_event(text, uuid) to authenticated;
grant execute on function public.can_edit_event(text, uuid) to authenticated;
grant execute on function public.can_view_program(uuid) to authenticated;
grant execute on function public.can_edit_program(uuid) to authenticated;


-- =============================================================================
-- 6. RLS usrah_events MENGIKUT JENIS
--
-- Admin LAJNAH TARBIAH tidak melihat baris 'program', dan admin JABATAN
-- SETIAUSAHA tidak melihat baris 'usrah'. Penapisan itu berlaku di RLS dan bukan
-- hanya dalam pertanyaan app: dua modul yang berkongsi satu table hanya selamat
-- jika pemisahnya dikuatkuasakan di bawah.
-- =============================================================================

drop policy if exists usrah_events_select on public.usrah_events;
create policy usrah_events_select on public.usrah_events
  for select to authenticated
  using (public.can_view_event(event_type));

drop policy if exists usrah_events_insert on public.usrah_events;
create policy usrah_events_insert on public.usrah_events
  for insert to authenticated
  with check (public.can_edit_event(event_type));

drop policy if exists usrah_events_update on public.usrah_events;
create policy usrah_events_update on public.usrah_events
  for update to authenticated
  using (public.can_edit_event(event_type))
  with check (public.can_edit_event(event_type));

drop policy if exists usrah_events_delete on public.usrah_events;
create policy usrah_events_delete on public.usrah_events
  for delete to authenticated
  using (public.can_edit_event(event_type));

/*
  Poster: kebenaran menulis dibuka kepada sesiapa yang boleh menyunting
  MANA-MANA jenis acara. Nama objek ialah '<event_id>.jpg' dan bucket tidak tahu
  jenis acara pemiliknya, jadi menapis lebih halus di sini memerlukan bacaan
  silang table dari dalam policy storage — kerumitan yang tidak berbaloi untuk
  fail yang memang dipapar secara awam.
*/
drop policy if exists event_posters_insert on storage.objects;
create policy event_posters_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program()));

drop policy if exists event_posters_update on storage.objects;
create policy event_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program()))
  with check (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program()));

drop policy if exists event_posters_delete on storage.objects;
create policy event_posters_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program()));


-- =============================================================================
-- 7. RLS usrah_attendance_scans MENGIKUT JENIS
--
-- Audit imbasan mengikut pemilik acaranya. Ahli tetap melihat barisnya sendiri
-- bagi kedua-dua jenis.
-- =============================================================================

drop policy if exists usrah_scans_select on public.usrah_attendance_scans;
create policy usrah_scans_select on public.usrah_attendance_scans
  for select to authenticated
  using (
    exists (
      select 1 from public.usrah_events e
      where e.id = event_id and public.can_view_event(e.event_type)
    )
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists usrah_scans_update on public.usrah_attendance_scans;
create policy usrah_scans_update on public.usrah_attendance_scans
  for update to authenticated
  using (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event(e.event_type))
  )
  with check (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event(e.event_type))
  );

drop policy if exists usrah_scans_delete on public.usrah_attendance_scans;
create policy usrah_scans_delete on public.usrah_attendance_scans
  for delete to authenticated
  using (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event(e.event_type))
  );


-- =============================================================================
-- 8. CARI PROGRAM DARIPADA KOD QR
--
-- Bentuk pulangan berubah (julat menggantikan tarikh tunggal, dan `event_type`
-- ditambah), jadi fungsi digugurkan dahulu — `create or replace` tidak boleh
-- menukar senarai kolum yang dipulangkan.
-- =============================================================================

drop function if exists public.usrah_event_by_qr_token(text);

create or replace function public.usrah_event_by_qr_token(p_qr_token text)
returns table (
  id                     uuid,
  name                   text,
  event_type             text,
  start_date             date,
  end_date               date,
  start_time             time,
  end_time               time,
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
    and not public.my_account_suspended()
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;


-- =============================================================================
-- 9. REKOD KEHADIRAN — grid bulanan hanya untuk usrah
--
-- `usrah_monthly_attendance` ialah dua belas bulatan usrah pada skrin Utama dan
-- ruang laporan tahunan Lajnah Tarbiah. Kehadiran program am tidak ada tempat di
-- sana: ia akan menghijaukan bulan yang ahli itu sebenarnya tidak menghadiri
-- usrah, dan merosakkan laporan yang sudah dipercayai.
--
-- Jadi baris 'program' berhenti di `usrah_attendance_scans` sahaja — jejak
-- lengkap, dieksport per-acara, tanpa menyentuh grid bulanan.
-- =============================================================================

drop function if exists public.record_usrah_attendance(uuid, numeric, numeric, text);

create or replace function public.record_usrah_attendance(
  p_event_id  uuid,
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

  -- (a) Acara. `for share` menahan baris ini sehingga transaksi tamat, jadi
  -- acara yang dimatikan di pertengahan tidak menghasilkan keputusan yang
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

  -- (c) Geofence. Acara tanpa pin lokasi tidak boleh disemak jaraknya; ia
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

  insert into public.usrah_attendance_scans (
    event_id, member_id, latitude, longitude, distance_meters, method
  )
  values (p_event_id, v_member, p_latitude, p_longitude, v_distance, v_method);

  /*
    Grid bulanan hanya menerima kehadiran usrah — lihat nota di kepala bahagian
    ini.

    Bulan diambil daripada `month`/`year` acara bila ia ada, dan daripada tarikh
    mula bila tidak: usrah bulanan menyatakan bulan yang DIWAKILINYA secara
    eksplisit, yang tidak semestinya bulan ia diadakan (sesi Oktober boleh jatuh
    pada 1 November). Nilai eksplisit itu yang menang.

    `where ... is distinct from true` melindungi rekod sedia ada: sel yang sudah
    ditanda hadir tidak ditulis semula, jadi upsert ini tidak menyentuh apa yang
    sudah betul.
  */
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
           v_event.start_time, v_event.end_time, v_distance;
end;
$$;

revoke all on function public.record_usrah_attendance(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.record_usrah_attendance(uuid, numeric, numeric, text) to authenticated;


-- =============================================================================
-- 10. LAPORAN KEHADIRAN SATU PROGRAM
--
-- Usrah dilaporkan setahun sekali kerana soalannya ialah "siapa hadir sepanjang
-- tahun". Program am dilaporkan seacara satu kerana soalannya ialah "siapa hadir
-- ke acara ini" — jadi bentuk laporannya berbeza, bukan hanya penapisnya.
--
-- `security definer` atas sebab yang sama seperti `usrah_year_report()`: admin
-- JABATAN SETIAUSAHA belum tentu memegang kebenaran membaca `members`, jadi
-- laluan biasa akan memulangkan senarai kehadiran tanpa nama. Tiga kolum
-- pengenalan sahaja didedahkan, dan hanya kepada sesiapa yang sudah dibenarkan
-- melihat acara jenis ini.
-- =============================================================================

create or replace function public.program_event_attendance(p_event_id uuid)
returns table (
  nombor_ahli text,
  full_name   text,
  generasi    text,
  scanned_at  timestamptz,
  method      text
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
    s.method
  from public.usrah_attendance_scans s
  join public.members m on m.id = s.member_id
  join public.usrah_events e on e.id = s.event_id
  where s.event_id = p_event_id
    and e.event_type = 'program'
    and public.can_view_program()
  order by s.scanned_at;
$$;

revoke all on function public.program_event_attendance(uuid) from public, anon;
grant execute on function public.program_event_attendance(uuid) to authenticated;


-- `usrah_year_report()` sengaja TIDAK disentuh: ia membaca
-- `usrah_monthly_attendance` dan `members` sahaja, dan kedua-duanya tidak
-- berubah di sini. Laporan tahunan usrah kekal betul-betul seperti sebelum ini.

notify pgrst, 'reload schema';
