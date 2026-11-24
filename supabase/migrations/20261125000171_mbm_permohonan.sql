-- =============================================================================
-- mysaf-off — Majlis Baitul Muslim (MBM): borang kecenderungan awal dalam app
--
-- Menggantikan Google Form. Ahli menghantar nama/generasi/no telefon + panel
-- pilihan; admin department MAJLIS BAITUL MUSLIM (+ Super Admin) menyemak,
-- menandakan selesai dan memuat turun senarai. Notifikasi admin dalam-app
-- (blok ke-6 admin_notifications_raw) dengan status "dilihat" setiap admin.
--
-- Hanya menambah (department/table/fungsi); `admin_notifications_raw()` ditulis
-- semula dengan satu blok baharu. Tiada data sedia ada diubah.
-- Table terkunci (RLS tanpa polisi, tiada GRANT) — semua akses melalui RPC.
-- =============================================================================

insert into public.departments (name)
select 'MAJLIS BAITUL MUSLIM'
where not exists (select 1 from public.departments where name = 'MAJLIS BAITUL MUSLIM');

create or replace function public.can_view_mbm_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.has_department_access('MAJLIS BAITUL MUSLIM', false, uid); $$;

create or replace function public.can_edit_mbm_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.has_department_access('MAJLIS BAITUL MUSLIM', true, uid); $$;

revoke all on function public.can_view_mbm_admin(uuid) from public, anon;
revoke all on function public.can_edit_mbm_admin(uuid) from public, anon;
grant execute on function public.can_view_mbm_admin(uuid) to authenticated;
grant execute on function public.can_edit_mbm_admin(uuid) to authenticated;

create table if not exists public.mbm_applications (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete cascade,
  nama          text not null,
  generasi      text,
  no_telefon    text not null,
  panel_pilihan text not null,
  status        text not null default 'baharu',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint mbm_applications_status check (status in ('baharu', 'selesai')),
  constraint mbm_applications_len check (
    char_length(nama) between 1 and 150
    and char_length(coalesce(generasi, '')) <= 30
    and char_length(no_telefon) between 5 and 30
    and char_length(panel_pilihan) between 1 and 150
  )
);

-- Satu permohonan 'baharu' bagi setiap ahli: hantar semula mengemas kini, tidak menggandakan.
create unique index if not exists mbm_applications_one_open
  on public.mbm_applications (member_id) where status = 'baharu';
create index if not exists mbm_applications_status_idx on public.mbm_applications (status, created_at desc);

alter table public.mbm_applications enable row level security;
revoke all on public.mbm_applications from anon, authenticated;

-- --- Ahli --------------------------------------------------------------------

create or replace function public.mbm_submit(
  p_nama text, p_generasi text, p_no_telefon text, p_panel text
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_member uuid := public.my_member_id();
  v_id uuid;
begin
  if v_member is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = 'MS001';
  end if;
  if coalesce(btrim(p_nama), '') = '' or coalesce(btrim(p_no_telefon), '') = '' or coalesce(btrim(p_panel), '') = '' then
    raise exception 'Sila lengkapkan nama, nombor telefon dan panel pilihan.' using errcode = '22023';
  end if;

  insert into public.mbm_applications (member_id, nama, generasi, no_telefon, panel_pilihan)
  values (v_member, btrim(p_nama), nullif(btrim(coalesce(p_generasi, '')), ''), btrim(p_no_telefon), btrim(p_panel))
  on conflict (member_id) where status = 'baharu'
  do update set nama = excluded.nama, generasi = excluded.generasi, no_telefon = excluded.no_telefon,
                panel_pilihan = excluded.panel_pilihan, created_at = now(), updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.mbm_my_application()
returns table (id uuid, panel_pilihan text, status text, created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.panel_pilihan, a.status, a.created_at
  from public.mbm_applications a
  where a.member_id = public.my_member_id()
  order by a.created_at desc
  limit 1;
$$;

-- --- Admin -------------------------------------------------------------------

create or replace function public.mbm_admin_list()
returns table (
  id uuid, nombor_ahli text, nama text, generasi text, no_telefon text,
  panel_pilihan text, status text, created_at timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran melihat permohonan MBM.' using errcode = 'MS001';
  end if;
  return query
  select a.id, m.nombor_ahli, a.nama, a.generasi, a.no_telefon, a.panel_pilihan, a.status, a.created_at
  from public.mbm_applications a
  left join public.members m on m.id = a.member_id
  where a.member_id is distinct from public.my_member_id()
  order by (a.status = 'baharu') desc, a.created_at desc, a.id;
end;
$$;

create or replace function public.mbm_admin_set_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not coalesce(public.can_edit_mbm_admin(), false) then
    raise exception 'Anda tiada kebenaran mengemas kini permohonan MBM.' using errcode = 'MS001';
  end if;
  if p_status not in ('baharu', 'selesai') then
    raise exception 'Status tidak sah.' using errcode = '22023';
  end if;
  update public.mbm_applications
     set status = p_status, updated_at = now()
   where id = p_id and member_id is distinct from public.my_member_id();
end;
$$;

revoke all on function public.mbm_submit(text, text, text, text) from public, anon;
revoke all on function public.mbm_my_application() from public, anon;
revoke all on function public.mbm_admin_list() from public, anon;
revoke all on function public.mbm_admin_set_status(uuid, text) from public, anon;
grant execute on function public.mbm_submit(text, text, text, text) to authenticated;
grant execute on function public.mbm_my_application() to authenticated;
grant execute on function public.mbm_admin_list() to authenticated;
grant execute on function public.mbm_admin_set_status(uuid, text) to authenticated;

-- --- Notifikasi: kelulusan "dilihat" untuk jenis baharu -----------------------

alter table public.admin_notification_seen drop constraint if exists admin_notification_seen_kind;
alter table public.admin_notification_seen add constraint admin_notification_seen_kind
  check (kind in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu', 'mbm_permohonan'));

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
  where k in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu', 'mbm_permohonan')
  on conflict (user_id, kind) do update set seen_at = excluded.seen_at;
end;
$$;


-- --- Notifikasi admin: blok ke-6 --------------------------------------------

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

  return;
end;
$function$;

revoke all on function public.admin_notifications_raw() from public, anon, authenticated;

notify pgrst, 'reload schema';
