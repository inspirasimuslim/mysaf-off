-- =============================================================================
-- mysaf-off — Pengukuhan keselamatan (audit September 2026)
--
-- Jalankan SELEPAS 20260912000016_adhoc_payments.sql.
-- Skrip ini idempotent: selamat dijalankan semula.
--
-- Setiap bahagian di bawah menutup satu kebocoran yang DISAHKAN melalui simulasi
-- peranan terhadap pangkalan data sebenar — bukan pengerasan teori:
--
--   1. Kata laluan sementara hanya dikuatkuasakan dalam app. 319 daripada 325
--      akaun masih memegang 'ikhwandihati', dan sesiapa yang tahu emelnya boleh
--      log masuk terus melalui API dan membaca NRIC, alamat serta pendapatan —
--      tarikh luput tidak menghalang apa-apa di pangkalan data.
--   2. Ahli boleh memadam tanda `must_change_password` sendiri melalui PostgREST.
--   3. Pendaftaran awam terbuka: akaun orang luar (tanpa rekod ahli) boleh
--      membaca direktori penuh — nama, emel, telefon 325 ahli.
--   4. Ahli boleh memasukkan baris `usrah_attendance_scans` terus, melangkau kod
--      QR, geofence dan tetingkap masa.
--   5. `record_usrah_attendance()` menerima id program TANPA kod QR, dan id itu
--      diedarkan kepada setiap ahli oleh `event_upcoming_directory()`.
--   6. Ahli boleh menukar `profiles.email` sendiri dan menyamar sebagai orang
--      lain dalam senarai Lantik Admin.
--   7. Storage: nama fail tidak disahkan (kecuali avatar), tiada had saiz atau
--      jenis fail, dan senarai objek terbuka kepada `anon`.
--   8. `anon` memegang grant table dan EXECUTE pada fungsi kebenaran.
-- =============================================================================


-- =============================================================================
-- 1. KUNCI AKAUN YANG BELUM MENUKAR KATA LALUAN SEMENTARA
--
-- Selagi `must_change_password` benar, akaun itu memegang kata laluan yang
-- diketahui umum — jadi ia tidak dianggap pemilik apa-apa data. Kunci diletakkan
-- di tiga pintu yang dilalui setiap policy:
--
--   - `my_member_id()`       → NULL, jadi setiap policy "baris sendiri" gagal
--   - `is_super_admin()`     → palsu
--   - `has_department_access()` → palsu
--
-- `my_account_suspended()` SENGAJA tidak disentuh: app membacanya SEBELUM gate
-- kata laluan, dan mengubahnya akan memaparkan "Akaun Disekat" kepada ahli baharu
-- yang sepatutnya melihat skrin tukar kata laluan.
--
-- Aliran log masuk pertama tidak terjejas: skrin tukar kata laluan hanya
-- memanggil `auth.updateUser()` dan `complete_password_change()`, dan tiada satu
-- pun daripadanya bergantung pada policy di atas.
-- =============================================================================

create or replace function public.temp_password_pending(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bool_or(m.must_change_password) from public.members m where m.user_id = uid),
    false
  );
$$;

-- Dalaman sahaja — dipanggil dari dalam fungsi `security definer` lain.
revoke all on function public.temp_password_pending(uuid) from public, anon, authenticated;

create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.members m
  where m.user_id = auth.uid()
    and not m.must_change_password
    and not m.disekat
  limit 1;
$$;

revoke all on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(uid)
     and not public.temp_password_pending(uid)
     and exists (
       select 1
       from public.profiles p
       where p.id = uid
         and p.role = 'super_admin'
     );
$$;

create or replace function public.has_department_access(
  dept_name  text,
  need_edit  boolean default false,
  uid        uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(uid)
     and not public.temp_password_pending(uid)
     and (
       public.is_super_admin(uid)
       or exists (
         select 1
         from public.admin_assignments a
         join public.departments d on d.id = a.department_id
         where a.user_id = uid
           and d.name = dept_name
           and case when need_edit then a.can_edit else a.can_view end
       )
     );
$$;

/*
  `members` membandingkan `user_id = auth.uid()` terus dan tidak melalui
  `my_member_id()`, jadi kunci diulang di sini menggunakan kolum baris itu
  sendiri.
*/
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (
    not public.my_account_suspended()
    and ((user_id = auth.uid() and not must_change_password) or public.can_view_members())
  );

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (
    not public.my_account_suspended()
    and ((user_id = auth.uid() and not must_change_password) or public.can_edit_members())
  )
  with check (
    not public.my_account_suspended()
    and ((user_id = auth.uid() and not must_change_password) or public.can_edit_members())
  );


-- =============================================================================
-- 2. TANDA KATA LALUAN TIDAK BOLEH DIPADAM SENDIRI
--
-- Dua lubang, satu punca: tanda itu boleh dikosongkan tanpa kata laluan
-- benar-benar bertukar.
--
--   - Kolum `must_change_password` / `temp_password_expires_at` kini dilindungi
--     trigger yang sama seperti `disekat`.
--   - `complete_password_change()` kini MENGESAHKAN kata laluan sudah bukan
--     kata laluan sementara (bcrypt dibandingkan di pelayan), dan menolak bila
--     tetingkap sudah tamat — itulah yang menjadikan tarikh luput benar-benar
--     berkuat kuasa, dan bukan sekadar skrin dalam app.
--
-- Nilai 'ikhwandihati' diulang di sini daripada `_shared/admin.ts` dan
-- `lib/temp-password.ts`. Tukar ketiga-tiganya bersama.
-- =============================================================================

create or replace function public.guard_member_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
begin
  -- Tiada konteks permintaan API (SQL Editor / psql) atau service_role:
  -- ini laluan pentadbir pangkalan data, bukan pengguna app.
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  -- Ditetapkan oleh `link_my_member_record()` sahaja, bagi tempoh satu transaksi.
  if coalesce(current_setting('app.member_linking', true), '') = 'on' then
    return new;
  end if;

  -- Ditetapkan oleh `complete_password_change()` sahaja, selepas ia mengesahkan
  -- kata laluan benar-benar bertukar.
  if coalesce(current_setting('app.password_change', true), '') = 'on' then
    return new;
  end if;

  if public.can_edit_members(auth.uid()) then
    return new;
  end if;

  if new.nombor_ahli is distinct from old.nombor_ahli
     or new.generasi is distinct from old.generasi
     or new.email    is distinct from old.email
     or new.disekat  is distinct from old.disekat
     or new.user_id  is distinct from old.user_id
     or new.must_change_password     is distinct from old.must_change_password
     or new.temp_password_expires_at is distinct from old.temp_password_expires_at then
    raise exception 'Nombor ahli, generasi, emel, status sekatan dan status kata laluan hanya boleh diubah oleh admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_must    boolean;
  v_expires timestamptz;
  v_hash    text;
begin
  if v_uid is null then
    raise exception 'Sesi tidak sah. Sila log masuk semula.' using errcode = 'MS001';
  end if;

  select m.must_change_password, m.temp_password_expires_at
    into v_must, v_expires
  from public.members m
  where m.user_id = v_uid
  limit 1;

  -- Tiada rekod atau tiada tanda: tiada apa untuk dikosongkan.
  if not found or not v_must then
    return;
  end if;

  if v_expires is not null and v_expires <= now() then
    raise exception 'Tempoh log masuk sementara anda telah tamat. Hubungi Super Admin untuk membukanya semula.'
      using errcode = 'MS004';
  end if;

  select u.encrypted_password into v_hash from auth.users u where u.id = v_uid;

  if v_hash is null or v_hash = extensions.crypt('ikhwandihati', v_hash) then
    raise exception 'Kata laluan anda masih kata laluan sementara. Sila tetapkan kata laluan baharu.'
      using errcode = 'MS005';
  end if;

  perform set_config('app.password_change', 'on', true);

  update public.members
  set must_change_password = false,
      temp_password_expires_at = null,
      updated_at = now()
  where user_id = v_uid;

  perform set_config('app.password_change', 'off', true);
end;
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

/*
  Pemulihan data: akaun yang tandanya sudah kosong tetapi kata laluannya MASIH
  'ikhwandihati' (satu akaun semasa audit). Ia ditanda semula dengan tetingkap
  tiga hari baharu dan bukan dikunci terus — pemiliknya akan dipaksa menukar
  kata laluan pada kali seterusnya dia membuka app, sama seperti ahli baharu.
*/
update public.members m
set must_change_password = true,
    temp_password_expires_at = now() + interval '3 days'
from auth.users u
where u.id = m.user_id
  and not m.must_change_password
  and u.encrypted_password = extensions.crypt('ikhwandihati', u.encrypted_password);


-- =============================================================================
-- 3. DATA BERSAMA HANYA UNTUK AKAUN AHLI
--
-- Pendaftaran awam masih terbuka di tetapan Auth, jadi "sudah log masuk" tidak
-- lagi bermakna "ahli". Direktori, program, pengumuman dan senarai pembayaran
-- kini memerlukan rekod ahli yang terpaut (dan tidak dikunci), atau Super Admin.
--
-- Penyelesaian sebenar ialah mematikan pendaftaran awam — lihat laporan audit.
-- Lapisan ini memastikan data kekal tertutup walaupun tetapan itu terlepas.
-- =============================================================================

create or replace function public.can_read_shared()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.account_suspended(auth.uid())
     and (public.my_member_id() is not null or public.is_super_admin(auth.uid()));
$$;

revoke all on function public.can_read_shared() from public, anon;
grant execute on function public.can_read_shared() to authenticated;

create or replace function public.list_members_directory()
returns table (
  nombor_ahli        text,
  full_name          text,
  generasi           text,
  email              text,
  no_tel             text,
  avatar_url         text,
  status_pekerjaan   text,
  status_perkahwinan text
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
    m.email,
    m.no_tel,
    m.avatar_url,
    m.status_pekerjaan,
    m.status_perkahwinan
  from public.members m
  where public.can_read_shared()
  order by m.generasi, m.full_name;
$$;

revoke all on function public.list_members_directory() from public, anon;
grant execute on function public.list_members_directory() to authenticated;

create or replace function public.event_upcoming_directory()
returns table (
  id            uuid,
  event_type    text,
  name          text,
  poster_url    text,
  start_date    date,
  end_date      date,
  start_time    time,
  end_time      time,
  location_text text
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
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location_text
  from public.usrah_events e
  where e.is_active
    and e.end_date >= current_date
    and public.can_read_shared()
  order by e.start_date, e.start_time;
$$;

revoke all on function public.event_upcoming_directory() from public, anon;
grant execute on function public.event_upcoming_directory() to authenticated;

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
    and public.can_read_shared()
  limit 1;
$$;

revoke all on function public.usrah_event_by_qr_token(text) from public, anon;
grant execute on function public.usrah_event_by_qr_token(text) to authenticated;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (public.can_view_program() or (is_active and public.can_read_shared()));

drop policy if exists adhoc_payment_types_select on public.adhoc_payment_types;
create policy adhoc_payment_types_select on public.adhoc_payment_types
  for select to authenticated
  using (public.can_view_yuran() or (is_active and public.can_read_shared()));


-- =============================================================================
-- 4. KEHADIRAN MESTI MELALUI KOD QR
--
-- Policy INSERT ahli pada `usrah_attendance_scans` digugurkan: ia membenarkan
-- baris kehadiran ditulis terus melalui REST, tanpa satu pun semakan dalam RPC.
-- RPC itu `security definer` dan tidak memerlukan policy tersebut.
--
-- RPC kini menuntut kod QR itu sendiri. Id program bukan rahsia — ia dipulangkan
-- kepada setiap ahli oleh direktori acara — jadi id sahaja tidak membuktikan
-- seseorang pernah melihat kod yang dipapar di lokasi. Program tanpa pin lokasi
-- sebelum ini boleh dituntut dari mana-mana, dan program berpin boleh dicari
-- kedudukannya melalui jarak dalam mesej ralat.
-- =============================================================================

drop policy if exists usrah_scans_insert on public.usrah_attendance_scans;

drop function if exists public.record_usrah_attendance(uuid, numeric, numeric, text);

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

  -- Token yang salah mendapat jawapan SAMA seperti program yang tiada: jawapan
  -- berbeza akan mengesahkan bahawa id itu wujud.
  if not found or v_event.qr_token is distinct from p_qr_token then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
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
           v_event.start_time, v_event.end_time, v_distance;
end;
$$;

revoke all on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.record_usrah_attendance(uuid, text, numeric, numeric, text) to authenticated;


-- =============================================================================
-- 5. EMEL PROFIL MENGIKUT AKAUN
--
-- `profiles.email` ialah salinan emel Auth yang dipapar kepada Super Admin
-- semasa melantik admin. Policy UPDATE membenarkan pengguna menyunting profil
-- sendiri, jadi tanpa sekatan ini seseorang boleh meletakkan emel orang lain
-- pada profilnya. Penyegerakan sebenar datang daripada trigger
-- `on_auth_user_email_updated`, yang berjalan tanpa konteks JWT dan lulus.
-- =============================================================================

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims   json := nullif(current_setting('request.jwt.claims', true), '')::json;
  jwt_role text := claims ->> 'role';
begin
  if claims is null or jwt_role = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_super_admin(auth.uid()) then
    raise exception 'Hanya Super Admin boleh menukar peranan pengguna.' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and not public.is_super_admin(auth.uid()) then
    raise exception 'Emel profil mengikut emel akaun dan tidak boleh diubah terus.' using errcode = '42501';
  end if;

  return new;
end;
$$;


-- =============================================================================
-- 6. STORAGE
--
-- Nama fail disahkan mengikut bentuk yang SEBENARNYA dijana oleh app, dalam satu
-- fungsi. Corak itu tidak membenarkan '/', jadi tiada folder dan tiada path
-- traversal; sambungan dikunci kepada imej.
--
--   avatars              <member_id>.jpg
--   event-posters        <event_id>.jpg
--   announcement-posters poster-<epoch ms>.jpg
--   payment-qr           qr-<epoch ms>.jpg
--
-- Bacaan fail melalui URL awam TIDAK melalui RLS, jadi menutup policy SELECT
-- kepada `anon` hanya menutup SENARAI objek (yang mendedahkan id setiap ahli
-- yang mempunyai avatar) — gambar dalam app tetap dipapar seperti biasa.
-- `authenticated` perlu SELECT untuk `upsert`.
-- =============================================================================

create or replace function public.storage_name_ok(p_bucket text, p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case p_bucket
      when 'avatars' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
      when 'event-posters' then
        p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      when 'announcement-posters' then
        p_name ~ '^poster-[0-9]{10,16}\.jpg$'
      when 'payment-qr' then
        p_name ~ '^qr-[0-9]{10,16}\.jpg$'
      else false
    end,
    false
  );
$$;

revoke all on function public.storage_name_ok(text, text) from public, anon;
grant execute on function public.storage_name_ok(text, text) to authenticated;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('avatars', 'event-posters', 'announcement-posters', 'payment-qr');

-- --- avatars -----------------------------------------------------------------
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.storage_name_ok(bucket_id, name)
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  )
  with check (
    bucket_id = 'avatars'
    and public.storage_name_ok(bucket_id, name)
    and public.can_manage_member_avatar(public.uuid_or_null(split_part(name, '.', 1)))
  );

-- --- event-posters -----------------------------------------------------------
drop policy if exists event_posters_public_read on storage.objects;
create policy event_posters_public_read on storage.objects
  for select to authenticated
  using (bucket_id = 'event-posters');

drop policy if exists event_posters_insert on storage.objects;
create policy event_posters_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-posters'
    and public.storage_name_ok(bucket_id, name)
    and (public.can_edit_usrah() or public.can_edit_program())
  );

drop policy if exists event_posters_update on storage.objects;
create policy event_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program()))
  with check (
    bucket_id = 'event-posters'
    and public.storage_name_ok(bucket_id, name)
    and (public.can_edit_usrah() or public.can_edit_program())
  );

-- --- announcement-posters ----------------------------------------------------
drop policy if exists announcement_posters_public_read on storage.objects;
create policy announcement_posters_public_read on storage.objects
  for select to authenticated
  using (bucket_id = 'announcement-posters');

drop policy if exists announcement_posters_insert on storage.objects;
create policy announcement_posters_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-posters'
    and public.storage_name_ok(bucket_id, name)
    and public.can_edit_program()
  );

drop policy if exists announcement_posters_update on storage.objects;
create policy announcement_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'announcement-posters' and public.can_edit_program())
  with check (
    bucket_id = 'announcement-posters'
    and public.storage_name_ok(bucket_id, name)
    and public.can_edit_program()
  );

-- --- payment-qr --------------------------------------------------------------
drop policy if exists payment_qr_public_read on storage.objects;
create policy payment_qr_public_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-qr');

drop policy if exists payment_qr_insert on storage.objects;
create policy payment_qr_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-qr'
    and public.storage_name_ok(bucket_id, name)
    and public.can_edit_yuran()
  );

drop policy if exists payment_qr_update on storage.objects;
create policy payment_qr_update on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-qr' and public.can_edit_yuran())
  with check (
    bucket_id = 'payment-qr'
    and public.storage_name_ok(bucket_id, name)
    and public.can_edit_yuran()
  );


-- =============================================================================
-- 7. TUTUP `anon`
--
-- RLS sudah menahan `anon` daripada setiap baris (tiada policy untuknya), tetapi
-- grant table dan EXECUTE fungsi masih terbuka melalui hak lalai Supabase —
-- migration 20260906000005 wujud kerana kesilapan yang sama. Di sini ia ditutup
-- secara menyeluruh dan bukan satu fungsi pada satu masa.
--
-- `list_super_admin_contacts()` ialah SATU-SATUNYA pengecualian yang disengajakan
-- (skrin log masuk). Fungsi milik extension dilangkau.
--
-- Nota untuk migration akan datang: fungsi baharu mewarisi EXECUTE daripada
-- PUBLIC, jadi corak `revoke all ... from public, anon` MESTI dikekalkan.
-- =============================================================================

revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

do $$
declare
  f record;
begin
  for f in
    select
      p.oid::regprocedure as sig,
      has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
      has_function_privilege('service_role', p.oid, 'execute') as service_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'list_super_admin_contacts'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    -- Hak `authenticated` dan `service_role` yang datang melalui PUBLIC dijadikan
    -- eksplisit dahulu, supaya mencabut PUBLIC tidak menutup laluan yang sah.
    if f.auth_ok then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.service_ok then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end;
$$;

grant execute on function public.list_super_admin_contacts() to anon, authenticated;

notify pgrst, 'reload schema';
