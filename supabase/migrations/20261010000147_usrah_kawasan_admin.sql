-- =============================================================================
-- mysaf-off — Admin Usrah Kawasan (2026-10-10)
--
-- Satu kawasan usrah (US/ULK/UU/UPT/UT/UTS/UA-UB/UP) boleh ada BEBERAPA admin.
-- Admin kawasan boleh menyunting KAWASANNYA SAHAJA dalam: kumpulan usrah (kumpulan,
-- naqib, ahli kumpulan), acara usrah (cipta/sunting/padam, imbasan kehadiran,
-- gambar, maklumat tambahan, poster) dan statistik tarbiah. Dilantik oleh
-- Super Admin atau admin LAJNAH TARBIAH (`can_edit_usrah()`).
--
-- Reka bentuk: admin kawasan BUKAN admin department. Mereka tidak masuk
-- `admin_assignments` dan tidak mendapat `can_view_usrah()`/`can_edit_usrah()`
-- (itu membuka SEMUA kawasan dan modul lain Lajnah Tarbiah — rekod kehadiran
-- bulanan, eksport, pelantikan rais dsb.). Sebaliknya satu table pelantikan
-- (`usrah_kawasan_admins`) dan fungsi kebenaran SEMPIT yang menyemak kawasan
-- baris. Kuasa admin Lajnah Tarbiah/Super Admin tidak berubah sedikit pun
-- (setiap semakan baharu = semakan lama ATAU padanan kawasan).
--
-- TIDAK termasuk (kekal Lajnah Tarbiah sahaja): kehadiran bulanan
-- (`admin_set_usrah_attendance`, `admin_clear_usrah_attendance`), import pukal
-- kumpulan usrah, eksport laporan usrah, pelantikan rais.
--
-- Table baharu + fungsi baharu + penulisan semula policy/fungsi sedia ada
-- (tiada data disentuh) — tiada snapshot backup diperlukan.
-- =============================================================================


-- 1. PELANTIKAN -------------------------------------------------------------

create table if not exists public.usrah_kawasan_admins (
  id            uuid primary key default gen_random_uuid(),
  kawasan_usrah text not null check (kawasan_usrah in ('US','ULK','UU','UPT','UT','UTS','UA-UB','UP')),
  member_id     uuid not null references public.members (id) on delete cascade,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (kawasan_usrah, member_id)
);
create index if not exists usrah_kawasan_admins_member_idx on public.usrah_kawasan_admins (member_id);

alter table public.usrah_kawasan_admins enable row level security;
revoke all on table public.usrah_kawasan_admins from anon;

-- Tulisan HANYA melalui RPC di bawah. Bacaan: pemilik baris sendiri atau Lajnah Tarbiah/Super Admin.
drop policy if exists usrah_kawasan_admins_select on public.usrah_kawasan_admins;
create policy usrah_kawasan_admins_select on public.usrah_kawasan_admins
  for select to authenticated
  using (member_id = public.my_member_id() or public.can_view_usrah());


-- 2. FUNGSI KEBENARAN SEMPIT ------------------------------------------------

-- Kawasan yang ditadbir pemanggil (tatasusunan kosong jika bukan admin kawasan / akaun disekat).
create or replace function public.my_usrah_kawasan()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(a.kawasan_usrah order by a.kawasan_usrah), '{}'::text[])
  from public.usrah_kawasan_admins a
  where a.member_id = public.my_member_id()
    and not public.my_account_suspended();
$$;

create or replace function public.can_view_kawasan_usrah(p_kawasan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.can_view_usrah(), false)
      or (p_kawasan is not null and p_kawasan = any (public.my_usrah_kawasan()));
$$;

create or replace function public.can_edit_kawasan_usrah(p_kawasan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.can_edit_usrah(), false)
      or (p_kawasan is not null and p_kawasan = any (public.my_usrah_kawasan()));
$$;

-- Versi acara: hanya jenis 'usrah' dan hanya kawasan acara itu. Jenis 'program' TIDAK terjejas.
create or replace function public.can_view_event_at(p_event_type text, p_kawasan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_event(p_event_type)
      or (p_event_type = 'usrah' and p_kawasan is not null and p_kawasan = any (public.my_usrah_kawasan()));
$$;

create or replace function public.can_edit_event_at(p_event_type text, p_kawasan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_event(p_event_type)
      or (p_event_type = 'usrah' and p_kawasan is not null and p_kawasan = any (public.my_usrah_kawasan()));
$$;

revoke all on function public.my_usrah_kawasan() from public, anon;
revoke all on function public.can_view_kawasan_usrah(text) from public, anon;
revoke all on function public.can_edit_kawasan_usrah(text) from public, anon;
revoke all on function public.can_view_event_at(text, text) from public, anon;
revoke all on function public.can_edit_event_at(text, text) from public, anon;
grant execute on function public.my_usrah_kawasan() to authenticated;
grant execute on function public.can_view_kawasan_usrah(text) to authenticated;
grant execute on function public.can_edit_kawasan_usrah(text) to authenticated;
grant execute on function public.can_view_event_at(text, text) to authenticated;
grant execute on function public.can_edit_event_at(text, text) to authenticated;


-- 3. RPC PELANTIKAN (Super Admin / admin LAJNAH TARBIAH) ---------------------

create or replace function public.list_usrah_kawasan_admins()
returns table (id uuid, kawasan_usrah text, member_id uuid, full_name text, generasi text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.kawasan_usrah, a.member_id, m.full_name, m.generasi
  from public.usrah_kawasan_admins a
  join public.members m on m.id = a.member_id
  where public.can_view_usrah()
  order by a.kawasan_usrah, m.full_name;
$$;

create or replace function public.add_usrah_kawasan_admin(p_kawasan text, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Hanya Super Admin atau admin LAJNAH TARBIAH boleh melantik admin kawasan.' using errcode = '42501';
  end if;
  if p_kawasan is null or p_kawasan not in ('US','ULK','UU','UPT','UT','UTS','UA-UB','UP') then
    raise exception 'Kawasan usrah tidak sah.' using errcode = '22023';
  end if;
  if p_member_id is null or not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Ahli tidak dijumpai.' using errcode = 'P0002';
  end if;

  insert into public.usrah_kawasan_admins (kawasan_usrah, member_id, created_by)
  values (p_kawasan, p_member_id, auth.uid())
  on conflict (kawasan_usrah, member_id) do nothing;
end;
$$;

create or replace function public.remove_usrah_kawasan_admin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_edit_usrah(), false) then
    raise exception 'Hanya Super Admin atau admin LAJNAH TARBIAH boleh membuang admin kawasan.' using errcode = '42501';
  end if;
  delete from public.usrah_kawasan_admins where id = p_id;
end;
$$;

revoke all on function public.list_usrah_kawasan_admins() from public, anon;
revoke all on function public.add_usrah_kawasan_admin(text, uuid) from public, anon;
revoke all on function public.remove_usrah_kawasan_admin(uuid) from public, anon;
grant execute on function public.list_usrah_kawasan_admins() to authenticated;
grant execute on function public.add_usrah_kawasan_admin(text, uuid) to authenticated;
grant execute on function public.remove_usrah_kawasan_admin(uuid) to authenticated;


-- 4. KUMPULAN USRAH — policy mengikut kawasan --------------------------------

drop policy if exists kumpulan_usrah_select on public.kumpulan_usrah;
create policy kumpulan_usrah_select on public.kumpulan_usrah
  for select to authenticated using (public.can_view_kawasan_usrah(kawasan_usrah));
drop policy if exists kumpulan_usrah_insert on public.kumpulan_usrah;
create policy kumpulan_usrah_insert on public.kumpulan_usrah
  for insert to authenticated with check (public.can_edit_kawasan_usrah(kawasan_usrah));
drop policy if exists kumpulan_usrah_update on public.kumpulan_usrah;
create policy kumpulan_usrah_update on public.kumpulan_usrah
  for update to authenticated
  using (public.can_edit_kawasan_usrah(kawasan_usrah))
  with check (public.can_edit_kawasan_usrah(kawasan_usrah));
drop policy if exists kumpulan_usrah_delete on public.kumpulan_usrah;
create policy kumpulan_usrah_delete on public.kumpulan_usrah
  for delete to authenticated using (public.can_edit_kawasan_usrah(kawasan_usrah));

drop policy if exists kumpulan_usrah_members_select on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_select on public.kumpulan_usrah_members
  for select to authenticated
  using (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_view_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_members_insert on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_insert on public.kumpulan_usrah_members
  for insert to authenticated
  with check (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_members_update on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_update on public.kumpulan_usrah_members
  for update to authenticated
  using (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)))
  with check (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_members_delete on public.kumpulan_usrah_members;
create policy kumpulan_usrah_members_delete on public.kumpulan_usrah_members
  for delete to authenticated
  using (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_naqib_select on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_select on public.kumpulan_usrah_naqib
  for select to authenticated
  using (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_view_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_naqib_insert on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_insert on public.kumpulan_usrah_naqib
  for insert to authenticated
  with check (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)));

drop policy if exists kumpulan_usrah_naqib_delete on public.kumpulan_usrah_naqib;
create policy kumpulan_usrah_naqib_delete on public.kumpulan_usrah_naqib
  for delete to authenticated
  using (exists (select 1 from public.kumpulan_usrah ku where ku.id = kumpulan_id and public.can_edit_kawasan_usrah(ku.kawasan_usrah)));

-- kumpulan_usrah_overview(): hanya kawasan yang boleh dilihat pemanggil (asal: 20261004000112_kumpulan_usrah.sql)
create or replace function public.kumpulan_usrah_overview()
returns table (
  id            uuid,
  kawasan_usrah text,
  nama          text,
  created_at    timestamptz,
  ahli          jsonb,
  naqib         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ku.id, ku.kawasan_usrah, ku.nama, ku.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', kum.id, 'member_id', m.id, 'full_name', m.full_name, 'generasi', m.generasi) order by m.full_name)
      from public.kumpulan_usrah_members kum
      join public.members m on m.id = kum.member_id
      where kum.kumpulan_id = ku.id
    ), '[]'::jsonb) as ahli,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', kn.id, 'member_id', m.id, 'full_name', m.full_name, 'generasi', m.generasi) order by m.full_name)
      from public.kumpulan_usrah_naqib kn
      join public.members m on m.id = kn.member_id
      where kn.kumpulan_id = ku.id
    ), '[]'::jsonb) as naqib
  from public.kumpulan_usrah ku
  where public.can_view_kawasan_usrah(ku.kawasan_usrah)
  order by ku.kawasan_usrah, ku.nama;
$$;


-- 5. ACARA USRAH — policy mengikut kawasan ------------------------------------

drop policy if exists usrah_events_select on public.usrah_events;
create policy usrah_events_select on public.usrah_events
  for select to authenticated
  using (public.can_view_event_at(event_type, kawasan_usrah));

drop policy if exists usrah_events_insert on public.usrah_events;
create policy usrah_events_insert on public.usrah_events
  for insert to authenticated
  with check (public.can_edit_event_at(event_type, kawasan_usrah));

drop policy if exists usrah_events_update on public.usrah_events;
create policy usrah_events_update on public.usrah_events
  for update to authenticated
  using (public.can_edit_event_at(event_type, kawasan_usrah))
  with check (public.can_edit_event_at(event_type, kawasan_usrah));

drop policy if exists usrah_events_delete on public.usrah_events;
create policy usrah_events_delete on public.usrah_events
  for delete to authenticated
  using (public.can_edit_event_at(event_type, kawasan_usrah));

drop policy if exists usrah_scans_select on public.usrah_attendance_scans;
create policy usrah_scans_select on public.usrah_attendance_scans
  for select to authenticated
  using (
    exists (
      select 1 from public.usrah_events e
      where e.id = event_id and public.can_view_event_at(e.event_type, e.kawasan_usrah)
    )
    or (not public.my_account_suspended() and member_id = public.my_member_id())
  );

drop policy if exists usrah_scans_update on public.usrah_attendance_scans;
create policy usrah_scans_update on public.usrah_attendance_scans
  for update to authenticated
  using (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah))
  )
  with check (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah))
  );

drop policy if exists usrah_scans_delete on public.usrah_attendance_scans;
create policy usrah_scans_delete on public.usrah_attendance_scans
  for delete to authenticated
  using (
    exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah))
  );

-- Maklumat tambahan acara (migration 144).
drop policy if exists event_extra_info_insert on public.event_extra_info;
create policy event_extra_info_insert on public.event_extra_info
  for insert to authenticated
  with check (exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah)));

drop policy if exists event_extra_info_update on public.event_extra_info;
create policy event_extra_info_update on public.event_extra_info
  for update to authenticated
  using (exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah)))
  with check (exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah)));

drop policy if exists event_extra_info_delete on public.event_extra_info;
create policy event_extra_info_delete on public.event_extra_info
  for delete to authenticated
  using (exists (select 1 from public.usrah_events e where e.id = event_id and public.can_edit_event_at(e.event_type, e.kawasan_usrah)));

-- Poster (storage): bucket tidak tahu acara pemiliknya (nama fail = '<event_id>.jpg' / '<event_id>-info-...'),
-- jadi admin kawasan diberi kebenaran menulis ke bucket ini secara umum — sama kompromi seperti
-- yang sedia ada untuk can_edit_usrah() OR can_edit_program() (lihat 20260907000011). Fail yang
-- dimuat naik hanya berguna jika baris acara (dijaga RLS di atas) merujuknya.
drop policy if exists event_posters_insert on storage.objects;
create policy event_posters_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-posters'
    and public.storage_name_ok(bucket_id, name)
    and (public.can_edit_usrah() or public.can_edit_program() or cardinality(public.my_usrah_kawasan()) > 0)
  );

drop policy if exists event_posters_update on storage.objects;
create policy event_posters_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program() or cardinality(public.my_usrah_kawasan()) > 0))
  with check (
    bucket_id = 'event-posters'
    and public.storage_name_ok(bucket_id, name)
    and (public.can_edit_usrah() or public.can_edit_program() or cardinality(public.my_usrah_kawasan()) > 0)
  );

drop policy if exists event_posters_delete on storage.objects;
create policy event_posters_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-posters' and (public.can_edit_usrah() or public.can_edit_program() or cardinality(public.my_usrah_kawasan()) > 0));

-- Gambar album acara.
create or replace function public.can_manage_event_photo(p_event_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usrah_events e
    where e.id = p_event_id
      and (public.can_edit_event(e.event_type, uid) or public.can_edit_event_at(e.event_type, e.kawasan_usrah))
  );
$$;

-- 6. RPC ACARA — salinan penuh versi terkini, hanya semakan kebenaran diubah ----

-- event_attendance_live() (asal: 20260915000030_hybrid_attendance.sql)
create or replace function public.event_attendance_live(p_event_id uuid)
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
    and public.can_view_event_at(e.event_type, e.kawasan_usrah)
  order by s.scanned_at desc;
$$;

-- event_attendance_export() (asal: 20260918000048_export_audit_fixes.sql)
create or replace function public.event_attendance_export(p_event_id uuid)
returns table (
  nombor_ahli      text,
  full_name        text,
  generasi         text,
  scanned_at       timestamptz,
  method           text,
  attendance_mode  text,
  distance_meters  numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    m.nombor_ahli,
    m.full_name,
    m.generasi,
    s.scanned_at,
    s.method,
    s.attendance_mode,
    s.distance_meters
  from public.usrah_attendance_scans s
  join public.members m on m.id = s.member_id
  join public.usrah_events e on e.id = s.event_id
  where s.event_id = p_event_id
    and public.can_view_event_at(e.event_type, e.kawasan_usrah)
  order by s.scanned_at;
$$;

-- event_rsvp_summary() (asal: 20261005000141_rsvp_bermalam_anak.sql)
create or replace function public.event_rsvp_summary(p_event_id uuid)
returns table (
  hadir integer, tidak_hadir integer, belum integer,
  anak integer, ahli_bermalam integer, anak_bermalam integer
)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      count(*) filter (where r.response = 'hadir')::integer       as hadir,
      count(*) filter (where r.response = 'tidak_hadir')::integer as tidak_hadir,
      coalesce(sum(r.bil_anak) filter (where r.response = 'hadir'), 0)::integer as anak,
      count(*) filter (where r.response = 'hadir' and r.bermalam)::integer as ahli_bermalam,
      coalesce(sum(r.bil_anak) filter (where r.response = 'hadir' and r.bermalam), 0)::integer as anak_bermalam
    from public.event_rsvp r
    join public.members m on m.id = r.member_id and not m.disekat
    where r.event_id = p_event_id
  ),
  eligible as (
    select count(*)::integer as total
    from public.members m
    where m.user_id is not null and not m.disekat
  )
  select c.hadir, c.tidak_hadir, greatest(el.total - c.hadir - c.tidak_hadir, 0),
         c.anak, c.ahli_bermalam, c.anak_bermalam
  from counts c, eligible el
  where exists (
    select 1 from public.usrah_events e
    where e.id = p_event_id and public.can_view_event_at(e.event_type, e.kawasan_usrah)
  );
$$;

-- event_rsvp_export() (asal: 20261005000141_rsvp_bermalam_anak.sql)
create or replace function public.event_rsvp_export(p_event_id uuid)
returns table (
  nombor_ahli  text,
  full_name    text,
  generasi     text,
  response     text,
  responded_at timestamptz,
  bil_anak     integer,
  bermalam     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.nombor_ahli, m.full_name, m.generasi, r.response, r.responded_at,
    r.bil_anak, r.bermalam
  from public.event_rsvp r
  join public.members m on m.id = r.member_id
  join public.usrah_events e on e.id = r.event_id
  where r.event_id = p_event_id
    and public.can_view_event_at(e.event_type, e.kawasan_usrah)
  order by r.response, m.full_name;
$$;

-- delete_or_archive_event() (asal: 20260915000028_event_delete_archive.sql)
create or replace function public.delete_or_archive_event(p_event_id uuid)
returns table (outcome text, attendance_count integer, rsvp_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_kawasan text;
  v_scans integer;
  v_rsvps integer;
begin
  select e.event_type, e.kawasan_usrah into v_type, v_kawasan
  from public.usrah_events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'Program tidak dijumpai.' using errcode = 'P0002';
  end if;

  if not public.can_edit_event_at(v_type, v_kawasan) then
    raise exception 'Anda tiada kebenaran memadam program ini.' using errcode = '42501';
  end if;

  select count(*)::integer into v_scans from public.usrah_attendance_scans s where s.event_id = p_event_id;
  select count(*)::integer into v_rsvps from public.event_rsvp r where r.event_id = p_event_id;

  if v_scans > 0 or v_rsvps > 0 then
    update public.usrah_events e
    set is_active = false,
        archived_at = coalesce(e.archived_at, now())
    where e.id = p_event_id;

    return query select 'archived'::text, v_scans, v_rsvps;
  else
    delete from public.usrah_events e where e.id = p_event_id;

    return query select 'deleted'::text, 0, 0;
  end if;
end;
$$;

-- stat_tarbiah(): admin kawasan nampak kawasannya sahaja (asal: 20261004000113_stat_tarbiah_kumpulan.sql)
create or replace function public.stat_tarbiah(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (coalesce(public.can_view_usrah(), false) or cardinality(public.my_usrah_kawasan()) > 0) then
    perform public._stat_deny();
  end if;

  with m as (
    select
      id,
      coalesce(upper(nullif(trim(kawasan_usrah), '')), 'Tiada Rekod') as kawasan,
      coalesce(generasi, 'Tiada Rekod') as generasi
    from public.members
    where public.can_view_kawasan_usrah(upper(nullif(trim(kawasan_usrah), '')))
  ),
  a as (
    select u.month, m.kawasan, m.generasi,
           (u.attended is true) as hadir,
           (u.attended is not null) as direkod
    from public.usrah_monthly_attendance u
    join m on m.id = u.member_id
    where u.year = p_year
  ),
  kaw as (select distinct kawasan from m),
  gen as (
    select distinct m.generasi,
           coalesce(nullif(regexp_replace(m.generasi, '\D', '', 'g'), '')::int, 9999) as ord
    from m
  )
  select jsonb_build_object(
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb) from (
        select distinct year as y from public.usrah_monthly_attendance where attended is not null
        union select extract(year from now())::int
      ) s
    ),
    'jumlah_ahli', (select count(*) from m),
    'kawasan_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', k.kawasan, 'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by k.kawasan, mo), '[]'::jsonb)
      from kaw k cross join generate_series(1, 12) mo
      left join (
        select kawasan, month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1, 2
      ) x on x.kawasan = k.kawasan and x.month = mo
    ),
    'semua_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by mo), '[]'::jsonb)
      from generate_series(1, 12) mo
      left join (
        select month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) x on x.month = mo
    ),
    'generasi_bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', g.generasi, 'bulan', mo,
        'hadir', coalesce(x.hadir, 0), 'direkod', coalesce(x.direkod, 0),
        'peratus', case when coalesce(x.direkod, 0) = 0 then null else round(x.hadir * 100.0 / x.direkod, 1) end
      ) order by g.ord, g.generasi, mo), '[]'::jsonb)
      from gen g cross join generate_series(1, 12) mo
      left join (
        select generasi, month, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1, 2
      ) x on x.generasi = g.generasi and x.month = mo
    ),
    'kawasan_tahunan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', kawasan, 'hadir', hadir, 'direkod', direkod,
        'peratus', case when direkod = 0 then null else round(hadir * 100.0 / direkod, 1) end
      ) order by kawasan), '[]'::jsonb)
      from (
        select kawasan, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) t
    ),
    'generasi_tahunan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'generasi', t.generasi, 'hadir', t.hadir, 'direkod', t.direkod,
        'peratus', case when t.direkod = 0 then null else round(t.hadir * 100.0 / t.direkod, 1) end
      ) order by coalesce(nullif(regexp_replace(t.generasi, '\D', '', 'g'), '')::int, 9999), t.generasi), '[]'::jsonb)
      from (
        select generasi, count(*) filter (where hadir) as hadir, count(*) filter (where direkod) as direkod
        from a group by 1
      ) t
    ),
    'kawasan_ahli', (
      select coalesce(jsonb_agg(jsonb_build_object('label', kawasan, 'count', n) order by n desc, kawasan), '[]'::jsonb)
      from (select kawasan, count(*) as n from m group by 1) s
    ),
    'kumpulan_usrah', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', ku.kawasan_usrah,
        'nama', ku.nama,
        'jumlah_ahli', coalesce(mc.n, 0),
        'naqib', coalesce(nq.names, '[]'::jsonb)
      ) order by ku.kawasan_usrah, ku.nama), '[]'::jsonb)
      from public.kumpulan_usrah ku
      left join (
        select kumpulan_id, count(*) as n from public.kumpulan_usrah_members group by 1
      ) mc on mc.kumpulan_id = ku.id
      left join (
        select kn.kumpulan_id, jsonb_agg(mm.full_name order by mm.full_name) as names
        from public.kumpulan_usrah_naqib kn
        join public.members mm on mm.id = kn.member_id
        group by 1
      ) nq on nq.kumpulan_id = ku.id
      where public.can_view_kawasan_usrah(ku.kawasan_usrah)
    ),
    'kumpulan_usrah_liputan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kawasan', s.kawasan,
        'jumlah_ahli', s.jumlah_ahli,
        'ahli_berkumpulan', s.ahli_berkumpulan,
        'jumlah_kumpulan', s.jumlah_kumpulan
      ) order by s.kawasan), '[]'::jsonb)
      from (
        select
          m.kawasan,
          count(*) as jumlah_ahli,
          count(*) filter (where kum.member_id is not null) as ahli_berkumpulan,
          (select count(*) from public.kumpulan_usrah ku2 where ku2.kawasan_usrah = m.kawasan) as jumlah_kumpulan
        from m
        left join public.kumpulan_usrah_members kum on kum.member_id = m.id
        group by m.kawasan
      ) s
    )
  ) into v_result;

  return v_result;
end;
$$;


notify pgrst, 'reload schema';
