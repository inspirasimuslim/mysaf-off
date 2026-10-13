-- =============================================================================
-- mysaf-off — Maklum Balas gaya CHAT (ahli <-> department) — 2026-10-13
--
-- Ahli memilih department (dropdown senarai department aktif) dan memulakan
-- perbualan; admin department itu (dan Super Admin) membalas, kedua-dua pihak
-- melihat sejarah penuh. Maklum balas lama (`app_feedback`) KEKAL sebagai arkib
-- baca-sahaja (Super Admin) — tidak disentuh, tiada snapshot diperlukan.
-- Migration ini HANYA menambah (2 table, fungsi, polisi) dan menulis semula
-- `admin_notifications()` (+ blok ke-4; salinan tepat versi 148 selainnya).
--
--   * Semua TULISAN melalui RPC `security definer`; `authenticated` hanya SELECT.
--   * Lihat = pemilik perbualan ATAU admin department (can_view) / Super Admin.
--     Balas sebagai admin = can_edit pada department itu.
--   * Perbualan sendiri dikecualikan daripada senarai/notifikasi admin.
--   * Status baca dikongsi per perbualan: `admin_read_at` (mana-mana admin
--     department membuka = dibaca) dan `member_read_at` (ahli).
--   * Had kadar: maksimum 30 mesej ahli sejam.
-- =============================================================================

create table if not exists public.feedback_threads (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,
  department_id   uuid not null references public.departments(id) on delete restrict,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_sender     text not null check (last_sender in ('ahli', 'admin')),
  member_read_at  timestamptz,
  admin_read_at   timestamptz
);
create index if not exists feedback_threads_member_idx on public.feedback_threads (member_id, last_message_at desc);
create index if not exists feedback_threads_dept_idx on public.feedback_threads (department_id, last_message_at desc);

create table if not exists public.feedback_messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.feedback_threads(id) on delete cascade,
  sender           text not null check (sender in ('ahli', 'admin')),
  sender_member_id uuid references public.members(id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index if not exists feedback_messages_thread_idx on public.feedback_messages (thread_id, created_at);

create or replace function public.feedback_can_admin(p_department uuid, p_need_edit boolean default false)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.departments d
    where d.id = p_department and public.has_department_access(d.name, p_need_edit)
  );
$$;

revoke all on function public.feedback_can_admin(uuid, boolean) from public, anon;
grant execute on function public.feedback_can_admin(uuid, boolean) to authenticated;

alter table public.feedback_threads enable row level security;
alter table public.feedback_messages enable row level security;

drop policy if exists feedback_threads_select on public.feedback_threads;
create policy feedback_threads_select on public.feedback_threads
  for select to authenticated
  using (member_id = public.my_member_id() or public.feedback_can_admin(department_id));

drop policy if exists feedback_messages_select on public.feedback_messages;
create policy feedback_messages_select on public.feedback_messages
  for select to authenticated
  using (exists (select 1 from public.feedback_threads t where t.id = thread_id));

revoke all on public.feedback_threads from anon, authenticated;
revoke all on public.feedback_messages from anon, authenticated;
grant select on public.feedback_threads to authenticated;
grant select on public.feedback_messages to authenticated;

-- Senarai department aktif untuk dropdown ahli.
create or replace function public.feedback_departments()
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select d.id, d.name from public.departments d
  where d.is_active and auth.uid() is not null and not public.account_suspended(auth.uid())
  order by d.name;
$$;

-- Mulakan perbualan baharu (ahli).
create or replace function public.feedback_start(p_department uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  v_body   text := btrim(coalesce(p_body, ''));
  v_id     uuid;
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) then
    raise exception 'Akaun anda tidak dibenarkan.' using errcode = '42501';
  end if;
  if v_member is null then
    raise exception 'Akaun anda belum dipautkan kepada rekod ahli.' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Mesej mesti antara 1 hingga 2000 aksara.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.departments d where d.id = p_department and d.is_active) then
    raise exception 'Department tidak sah.' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback_messages m
      where m.sender = 'ahli' and m.sender_member_id = v_member
        and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Terlalu banyak mesej dalam masa singkat. Cuba lagi sebentar.' using errcode = 'P0001';
  end if;

  insert into public.feedback_threads (member_id, department_id, last_sender, member_read_at)
  values (v_member, p_department, 'ahli', now())
  returning id into v_id;

  insert into public.feedback_messages (thread_id, sender, sender_member_id, body)
  values (v_id, 'ahli', v_member, v_body);

  return v_id;
end;
$$;

-- Hantar mesej dalam perbualan (ahli pemilik, atau admin department yang boleh sunting).
create or replace function public.feedback_send(p_thread uuid, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  v_body   text := btrim(coalesce(p_body, ''));
  t        public.feedback_threads%rowtype;
  v_sender text;
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) then
    raise exception 'Akaun anda tidak dibenarkan.' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Mesej mesti antara 1 hingga 2000 aksara.' using errcode = '22023';
  end if;

  select * into t from public.feedback_threads where id = p_thread for update;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;

  if v_member is not null and t.member_id = v_member then
    v_sender := 'ahli';
    if (select count(*) from public.feedback_messages m
        where m.sender = 'ahli' and m.sender_member_id = v_member
          and m.created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Terlalu banyak mesej dalam masa singkat. Cuba lagi sebentar.' using errcode = 'P0001';
    end if;
  elsif public.feedback_can_admin(t.department_id, true) then
    v_sender := 'admin';
  else
    raise exception 'Anda tidak boleh membalas perbualan ini.' using errcode = '42501';
  end if;

  insert into public.feedback_messages (thread_id, sender, sender_member_id, body)
  values (p_thread, v_sender, v_member, v_body);

  update public.feedback_threads
     set last_message_at = now(),
         last_sender = v_sender,
         member_read_at = case when v_sender = 'ahli' then now() else member_read_at end,
         admin_read_at  = case when v_sender = 'admin' then now() else admin_read_at end
   where id = p_thread;
end;
$$;

-- Tanda dibaca oleh pihak yang membuka perbualan.
create or replace function public.feedback_mark_read(p_thread uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.feedback_threads%rowtype;
begin
  select * into t from public.feedback_threads where id = p_thread;
  if not found then return; end if;
  if v_member is not null and t.member_id = v_member then
    update public.feedback_threads set member_read_at = now() where id = p_thread;
  elsif public.feedback_can_admin(t.department_id, false) then
    update public.feedback_threads set admin_read_at = now() where id = p_thread;
  end if;
end;
$$;

-- Senarai perbualan ahli sendiri.
create or replace function public.feedback_my_threads()
returns table (id uuid, department_name text, last_message_at timestamptz, last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, d.name, t.last_message_at, t.last_sender,
         (select m.body from public.feedback_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
         (t.last_sender = 'admin' and (t.member_read_at is null or t.member_read_at < t.last_message_at))
  from public.feedback_threads t
  join public.departments d on d.id = t.department_id
  where t.member_id = public.my_member_id() and public.my_member_id() is not null
  order by t.last_message_at desc
  limit 100;
$$;

-- Bilangan perbualan ahli sendiri yang ada balasan belum dibaca.
create or replace function public.feedback_member_unread()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.feedback_threads t
  where t.member_id = public.my_member_id() and public.my_member_id() is not null
    and t.last_sender = 'admin' and (t.member_read_at is null or t.member_read_at < t.last_message_at);
$$;

-- Peti masuk admin: perbualan department yang boleh dilihat (sendiri dikecualikan).
create or replace function public.feedback_admin_threads()
returns table (id uuid, member_name text, generasi text, department_name text,
               last_message_at timestamptz, last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, m.full_name, m.generasi, d.name, t.last_message_at, t.last_sender,
         (select x.body from public.feedback_messages x where x.thread_id = t.id order by x.created_at desc limit 1),
         (t.last_sender = 'ahli' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at))
  from public.feedback_threads t
  join public.departments d on d.id = t.department_id
  join public.members m on m.id = t.member_id
  where public.feedback_can_admin(t.department_id)
    and t.member_id is distinct from public.my_member_id()
  order by (t.last_sender = 'ahli' and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)) desc,
           t.last_message_at desc
  limit 200;
$$;

-- Adakah pemanggil ada peti masuk (Super Admin atau admin mana-mana department)?
create or replace function public.feedback_admin_inbox()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.departments d
    where d.is_active and public.has_department_access(d.name, false)
  );
$$;

-- Maklumat kepala perbualan + sama ada pemanggil boleh membalas.
create or replace function public.feedback_thread_info(p_thread uuid)
returns table (department_name text, member_name text, generasi text, is_owner boolean, can_reply boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.feedback_threads%rowtype;
  v_owner boolean;
  v_admin boolean;
begin
  select * into t from public.feedback_threads where id = p_thread;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;
  v_owner := v_member is not null and t.member_id = v_member;
  v_admin := public.feedback_can_admin(t.department_id, false);
  if not v_owner and not v_admin then
    raise exception 'Anda tidak boleh melihat perbualan ini.' using errcode = '42501';
  end if;
  return query
    select d.name, m.full_name, m.generasi, v_owner,
           (v_owner or public.feedback_can_admin(t.department_id, true))
    from public.departments d, public.members m
    where d.id = t.department_id and m.id = t.member_id;
end;
$$;

-- Mesej perbualan (lama -> baru).
create or replace function public.feedback_thread_messages(p_thread uuid)
returns table (id uuid, sender text, sender_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.feedback_threads%rowtype;
begin
  select * into t from public.feedback_threads ft where ft.id = p_thread;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if not ((v_member is not null and t.member_id = v_member) or public.feedback_can_admin(t.department_id, false)) then
    raise exception 'Anda tidak boleh melihat perbualan ini.' using errcode = '42501';
  end if;
  return query
    select x.id, x.sender, coalesce(m.full_name, case when x.sender = 'admin' then 'Admin' else 'Ahli' end),
           x.body, x.created_at
    from public.feedback_messages x
    left join public.members m on m.id = x.sender_member_id
    where x.thread_id = p_thread
    order by x.created_at, x.id;
end;
$$;

revoke all on function public.feedback_departments() from public, anon;
revoke all on function public.feedback_start(uuid, text) from public, anon;
revoke all on function public.feedback_send(uuid, text) from public, anon;
revoke all on function public.feedback_mark_read(uuid) from public, anon;
revoke all on function public.feedback_my_threads() from public, anon;
revoke all on function public.feedback_member_unread() from public, anon;
revoke all on function public.feedback_admin_threads() from public, anon;
revoke all on function public.feedback_admin_inbox() from public, anon;
revoke all on function public.feedback_thread_info(uuid) from public, anon;
revoke all on function public.feedback_thread_messages(uuid) from public, anon;
grant execute on function public.feedback_departments() to authenticated;
grant execute on function public.feedback_start(uuid, text) to authenticated;
grant execute on function public.feedback_send(uuid, text) to authenticated;
grant execute on function public.feedback_mark_read(uuid) to authenticated;
grant execute on function public.feedback_my_threads() to authenticated;
grant execute on function public.feedback_member_unread() to authenticated;
grant execute on function public.feedback_admin_threads() to authenticated;
grant execute on function public.feedback_admin_inbox() to authenticated;
grant execute on function public.feedback_thread_info(uuid) to authenticated;
grant execute on function public.feedback_thread_messages(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Notifikasi admin: tambah blok ke-4 (salinan versi 148 + maklum balas chat).
-- -----------------------------------------------------------------------------

create or replace function public.admin_notifications()
returns table (
  kind    text,
  title   text,
  preview text,
  jumlah  integer,
  terbaru timestamptz,
  route   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jumlah  integer;
  v_nama    text;
  v_bisnes  text;
  v_terbaru timestamptz;
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
    select count(*), max(r.created_at) into v_jumlah, v_terbaru
    from public.account_deletion_requests r
    where r.status = 'pending';

    if v_jumlah > 0 then
      select m.full_name into v_nama
      from public.account_deletion_requests r
      join public.members m on m.id = r.member_id
      where r.status = 'pending'
      order by r.created_at desc
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
  --    Permohonan sendiri dikecualikan (admin tidak boleh menyemaknya).
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

  -- 4. Maklum balas ahli (chat) menunggu dibaca — department yang pemanggil boleh lihat
  --    (+ Super Admin: semua). Sembang sendiri dikecualikan. Hilang bila dibuka (admin_read_at).
  select count(*), max(t.last_message_at) into v_jumlah, v_terbaru
  from public.feedback_threads t
  where t.last_sender = 'ahli'
    and (t.admin_read_at is null or t.admin_read_at < t.last_message_at)
    and t.member_id is distinct from public.my_member_id()
    and public.feedback_can_admin(t.department_id);

  if coalesce(v_jumlah, 0) > 0 then
    kind := 'maklum_balas_chat';
    title := 'Maklum balas ahli baharu';
    preview := v_jumlah || ' perbualan maklum balas belum dibaca.';
    jumlah := v_jumlah;
    terbaru := v_terbaru;
    route := '/(app)/admin/maklum-balas-chat';
    return next;
  end if;

  return;
end;
$$;

notify pgrst, 'reload schema';
