-- Panel MBM: hanya panel yang dipilih ahli menerima permohonan itu (migration 173).
-- Panel = ahli yang dilantik admin MAJLIS BAITUL MUSLIM; senarai boleh bertambah/berkurang.
-- Panel hanya nampak permohonan yang memilihnya (RPC `mbm_panel_*`); admin MBM kekal nampak semua.

create table if not exists public.mbm_panels (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  aktif        boolean not null default true,
  appointed_at timestamptz not null default now(),
  appointed_by uuid references auth.users(id) on delete set null,
  removed_at   timestamptz,
  removed_by   uuid references auth.users(id) on delete set null
);
create unique index if not exists mbm_panels_member_uniq on public.mbm_panels (member_id);
alter table public.mbm_panels enable row level security;
revoke all on public.mbm_panels from anon, authenticated;

alter table public.mbm_applications
  add column if not exists panel_id uuid references public.mbm_panels(id) on delete set null;
create index if not exists mbm_applications_panel_idx on public.mbm_applications (panel_id, status, created_at desc);

create or replace function public.my_mbm_panel_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select p.id from public.mbm_panels p where p.member_id = public.my_member_id() and p.aktif limit 1;
$$;

create or replace function public.is_active_mbm_panel()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.my_mbm_panel_id() is not null;
$$;

-- Senarai panel aktif untuk borang ahli (tanpa diri sendiri).
create or replace function public.mbm_panel_options()
returns table (id uuid, nama text, generasi text)
language sql stable security definer set search_path to 'public' as $$
  select p.id, m.full_name, m.generasi
    from public.mbm_panels p join public.members m on m.id = p.member_id
   where p.aktif and p.member_id is distinct from public.my_member_id()
   order by m.full_name;
$$;

drop function if exists public.mbm_submit(text, text, text, text);
create or replace function public.mbm_submit(
  p_nama text, p_generasi text, p_no_telefon text, p_panel_id uuid
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_member uuid := public.my_member_id();
  v_panel_nama text;
  v_id uuid;
begin
  if v_member is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = 'MS001';
  end if;
  if coalesce(btrim(p_nama), '') = '' or coalesce(btrim(p_no_telefon), '') = '' or p_panel_id is null then
    raise exception 'Sila lengkapkan nama, nombor telefon dan panel pilihan.' using errcode = '22023';
  end if;
  select m.full_name into v_panel_nama
    from public.mbm_panels p join public.members m on m.id = p.member_id
   where p.id = p_panel_id and p.aktif and p.member_id <> v_member;
  if v_panel_nama is null then
    raise exception 'Panel pilihan tidak sah atau tidak lagi bertugas.' using errcode = '22023';
  end if;

  insert into public.mbm_applications (member_id, nama, generasi, no_telefon, panel_pilihan, panel_id)
  values (v_member, btrim(p_nama), nullif(btrim(coalesce(p_generasi, '')), ''), btrim(p_no_telefon), v_panel_nama, p_panel_id)
  on conflict (member_id) where status = 'baharu'
  do update set nama = excluded.nama, generasi = excluded.generasi, no_telefon = excluded.no_telefon,
                panel_pilihan = excluded.panel_pilihan, panel_id = excluded.panel_id,
                created_at = now(), updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

drop function if exists public.mbm_my_application();
create or replace function public.mbm_my_application()
returns table (id uuid, panel_pilihan text, panel_id uuid, status text, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.panel_pilihan, a.panel_id, a.status, a.created_at
  from public.mbm_applications a
  where a.member_id = public.my_member_id()
  order by a.created_at desc
  limit 1;
$$;

-- Admin MBM: semua permohonan (lihat + tanda selesai + Excel) — tambah panel_id.
drop function if exists public.mbm_admin_list();
create or replace function public.mbm_admin_list()
returns table (
  id uuid, nombor_ahli text, nama text, generasi text, no_telefon text,
  panel_pilihan text, panel_id uuid, status text, created_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran melihat permohonan MBM.' using errcode = 'MS001';
  end if;
  return query
  select a.id, m.nombor_ahli, a.nama, a.generasi, a.no_telefon, a.panel_pilihan, a.panel_id, a.status, a.created_at
  from public.mbm_applications a
  left join public.members m on m.id = a.member_id
  where a.member_id is distinct from public.my_member_id()
  order by (a.status = 'baharu') desc, a.created_at desc, a.id;
end;
$$;

-- Pengurusan panel (admin MBM).
create or replace function public.mbm_panel_list()
returns table (id uuid, member_id uuid, nama text, generasi text, aktif boolean, baharu integer, jumlah integer)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran melihat panel MBM.' using errcode = 'MS001';
  end if;
  return query
  select p.id, p.member_id, m.full_name, m.generasi, p.aktif,
         (select count(*)::int from public.mbm_applications a where a.panel_id = p.id and a.status = 'baharu'),
         (select count(*)::int from public.mbm_applications a where a.panel_id = p.id)
    from public.mbm_panels p join public.members m on m.id = p.member_id
   order by p.aktif desc, m.full_name;
end;
$$;

create or replace function public.mbm_panel_add(p_member uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(public.can_edit_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran melantik panel MBM.' using errcode = 'MS001';
  end if;
  if not exists (select 1 from public.members where id = p_member) then
    raise exception 'Ahli tidak dijumpai.' using errcode = '22023';
  end if;
  insert into public.mbm_panels (member_id, appointed_by) values (p_member, auth.uid())
  on conflict (member_id) do update
    set aktif = true, appointed_at = now(), appointed_by = auth.uid(), removed_at = null, removed_by = null;
end;
$$;

create or replace function public.mbm_panel_remove(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(public.can_edit_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran mengubah panel MBM.' using errcode = 'MS001';
  end if;
  update public.mbm_panels set aktif = false, removed_at = now(), removed_by = auth.uid() where id = p_id;
end;
$$;

-- Panel: HANYA permohonan yang memilihnya.
create or replace function public.mbm_panel_inbox()
returns table (
  id uuid, nombor_ahli text, nama text, generasi text, no_telefon text, status text, created_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_panel uuid := public.my_mbm_panel_id();
begin
  if v_panel is null then
    raise exception 'Anda bukan panel MBM yang aktif.' using errcode = 'MS001';
  end if;
  return query
  select a.id, m.nombor_ahli, a.nama, a.generasi, a.no_telefon, a.status, a.created_at
  from public.mbm_applications a
  left join public.members m on m.id = a.member_id
  where a.panel_id = v_panel and a.member_id is distinct from public.my_member_id()
  order by (a.status = 'baharu') desc, a.created_at desc, a.id;
end;
$$;

create or replace function public.mbm_panel_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_panel uuid := public.my_mbm_panel_id();
begin
  if v_panel is null then
    raise exception 'Anda bukan panel MBM yang aktif.' using errcode = 'MS001';
  end if;
  if p_status not in ('baharu', 'selesai') then
    raise exception 'Status tidak sah.' using errcode = '22023';
  end if;
  update public.mbm_applications set status = p_status, updated_at = now()
   where id = p_id and panel_id = v_panel and member_id is distinct from public.my_member_id();
end;
$$;

revoke all on function public.my_mbm_panel_id(), public.is_active_mbm_panel(), public.mbm_panel_options(),
  public.mbm_submit(text, text, text, uuid), public.mbm_my_application(), public.mbm_admin_list(),
  public.mbm_panel_list(), public.mbm_panel_add(uuid), public.mbm_panel_remove(uuid),
  public.mbm_panel_inbox(), public.mbm_panel_set_status(uuid, text) from public, anon;
grant execute on function public.is_active_mbm_panel(), public.mbm_panel_options(),
  public.mbm_submit(text, text, text, uuid), public.mbm_my_application(), public.mbm_admin_list(),
  public.mbm_panel_list(), public.mbm_panel_add(uuid), public.mbm_panel_remove(uuid),
  public.mbm_panel_inbox(), public.mbm_panel_set_status(uuid, text) to authenticated;

-- Notifikasi: jenis baharu 'mbm_panel' (bilangan permohonan baharu untuk panel itu sahaja).
alter table public.admin_notification_seen drop constraint if exists admin_notification_seen_kind;
alter table public.admin_notification_seen add constraint admin_notification_seen_kind
  check (kind in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu', 'mbm_permohonan', 'mbm_panel'));

create or replace function public.admin_notification_mark_seen(p_kinds text[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk.' using errcode = '28000';
  end if;
  insert into public.admin_notification_seen (user_id, kind, seen_at)
  select auth.uid(), k, now()
  from unnest(p_kinds) as k
  where k in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu', 'mbm_permohonan', 'mbm_panel')
  on conflict (user_id, kind) do update set seen_at = excluded.seen_at;
end;
$$;

-- Push: panel yang dipilih (bukan semua panel) + admin MBM.
create or replace function public.push_on_mbm_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dept uuid;
  v_member_user uuid;
  v_panel_user uuid;
begin
  select id into v_dept from public.departments where name = 'MAJLIS BAITUL MUSLIM';
  select m.user_id into v_member_user from public.members m where m.id = new.member_id;
  perform public.push_enqueue(array_remove(public.push_department_users(v_dept), v_member_user),
    'Permohonan Majlis Baitul Muslim', 'Ada permohonan MBM baharu.', '/(app)/admin/mbm');
  if new.panel_id is not null then
    select m.user_id into v_panel_user
      from public.mbm_panels p join public.members m on m.id = p.member_id
     where p.id = new.panel_id and p.aktif;
    perform public.push_enqueue(array[v_panel_user], 'Permohonan Majlis Baitul Muslim',
      'Ada permohonan MBM baharu untuk anda.', '/(app)/admin/mbm-panel');
  end if;
  return null;
end $$;
drop trigger if exists push_mbm_application on public.mbm_applications;
create trigger push_mbm_application after insert or update of created_at on public.mbm_applications
  for each row execute function public.push_on_mbm_application();

-- Notifikasi admin: blok ke-7 (panel).
CREATE OR REPLACE FUNCTION public.admin_notifications_raw()
 RETURNS TABLE(kind text, title text, preview text, jumlah integer, terbaru timestamp with time zone, route text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jumlah  integer;
  v_nama    text;
  v_bisnes  text;
  v_terbaru timestamptz;
  r         record;
begin
  -- 1. Iklan perniagaan menunggu semakan — LAJNAH EKONOMI DAN ASET (+ Super Admin).
  if public.can_view_business_ads_admin() then
    select count(*) into v_jumlah
    from public.member_business_ads a
    where a.status = 'menunggu';

    if v_jumlah > 0 then
      select m.full_name, a.nama_bisnes, a.submitted_at
        into v_nama, v_bisnes, v_terbaru
      from public.member_business_ads a
      join public.members m on m.id = a.member_id
      where a.status = 'menunggu'
      order by a.submitted_at desc, a.id
      limit 1;

      kind := 'iklan_menunggu';
      title := 'Iklan bisnes menunggu semakan';
      preview := v_nama || ' menghantar iklan "' || v_bisnes || '"'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/semakan-iklan';
      return next;
    end if;
  end if;

  -- 2. Permintaan padam akaun — Super Admin sahaja (sama dengan list_account_deletion_requests()).
  if public.is_super_admin() then
    select count(*), max(r2.created_at) into v_jumlah, v_terbaru
    from public.account_deletion_requests r2
    where r2.status = 'pending';

    if v_jumlah > 0 then
      select m.full_name into v_nama
      from public.account_deletion_requests r2
      join public.members m on m.id = r2.member_id
      where r2.status = 'pending'
      order by r2.created_at desc
      limit 1;

      kind := 'padam_akaun';
      title := 'Permintaan padam akaun';
      preview := v_nama || ' memohon padam akaun'
                 || case when v_jumlah > 1 then ' dan ' || (v_jumlah - 1) || ' lagi' else '' end
                 || '.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/permintaan-padam-akaun';
      return next;
    end if;
  end if;

  -- 3. Permohonan bantuan menunggu semakan — TABUNG ZAKAT (+ Super Admin).
  if public.can_view_bantuan_admin() then
    select count(*), max(a.dihantar_at) into v_jumlah, v_terbaru
    from public.bantuan_applications a
    where a.status = 'submitted'
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'bantuan_menunggu';
      title := 'Permohonan bantuan menunggu semakan';
      preview := v_jumlah || ' permohonan bantuan menunggu semakan.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/bantuan';
      return next;
    end if;
  end if;

  -- 4. Maklum balas ahli (chat) belum dibaca — SATU baris setiap department yang
  --    pemanggil boleh lihat (Super Admin: semua). Sembang sendiri dikecualikan.
  --    Hilang bila perbualan dibuka (admin_read_at).
  for r in
    select d.id as dept_id, d.name as dept_name, count(*)::integer as jml, max(t.last_message_at) as terbaru
    from public.feedback_threads t
    join public.departments d on d.id = t.department_id
    where t.last_sender = 'ahli'
      and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)
      and t.member_id is distinct from public.my_member_id()
      and public.has_department_access(d.name, false)
    group by d.id, d.name
    order by max(t.last_message_at) desc
  loop
    kind := 'maklum_balas_chat:' || r.dept_id::text;
    title := 'Maklum balas ahli — ' || public.feedback_department_label(r.dept_name);
    preview := r.jml || ' perbualan belum dibaca.';
    jumlah := r.jml;
    terbaru := r.terbaru;
    route := '/(app)/admin/maklum-balas-chat?dept=' || r.dept_id::text;
    return next;
  end loop;

  -- 5. Sesi kaunseling belum dibaca — hanya KAUNSELOR aktif, hanya perbualan sendiri.
  --    Tiada nama ahli dalam notifikasi.
  v_jumlah := coalesce(public.counseling_counselor_unread(), 0);
  if v_jumlah > 0 then
    select max(t.last_message_at) into v_terbaru
    from public.counseling_threads t where t.counselor_id = public.my_counselor_id();
    kind := 'kaunseling';
    title := 'Sesi kaunseling baharu';
    preview := v_jumlah || ' perbualan kaunseling belum dibaca.';
    jumlah := v_jumlah;
    terbaru := v_terbaru;
    route := '/(app)/admin/kaunseling-peti';
    return next;
  end if;

  -- 6. Permohonan MBM baharu — MAJLIS BAITUL MUSLIM (+ Super Admin). Tiada nama dalam notifikasi.
  if public.can_view_mbm_admin() then
    select count(*), max(a.created_at) into v_jumlah, v_terbaru
    from public.mbm_applications a
    where a.status = 'baharu'
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'mbm_permohonan';
      title := 'Permohonan Majlis Baitul Muslim';
      preview := v_jumlah || ' permohonan MBM baharu.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/mbm';
      return next;
    end if;
  end if;

  -- 7. Permohonan MBM untuk panel yang dipilih sahaja. Tiada nama dalam notifikasi.
  if public.is_active_mbm_panel() then
    select count(*), max(a.created_at) into v_jumlah, v_terbaru
    from public.mbm_applications a
    where a.status = 'baharu'
      and a.panel_id = public.my_mbm_panel_id()
      and a.member_id is distinct from public.my_member_id();

    if v_jumlah > 0 then
      kind := 'mbm_panel';
      title := 'Permohonan Majlis Baitul Muslim';
      preview := v_jumlah || ' permohonan MBM baharu untuk anda.';
      jumlah := v_jumlah;
      terbaru := v_terbaru;
      route := '/(app)/admin/mbm-panel';
      return next;
    end if;
  end if;

  return;
end;
$function$;

revoke all on function public.admin_notifications_raw() from public, anon, authenticated;
