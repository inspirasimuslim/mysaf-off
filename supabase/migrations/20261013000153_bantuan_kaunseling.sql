-- =============================================================================
-- mysaf-off — Bantuan Kaunseling — 2026-10-13
--
-- Ahli melihat senarai kaunselor yang dilantik, menghubungi mereka melalui
-- WhatsApp / telefon / mesej dalam app. Kaunselor dilantik oleh admin LAJNAH
-- KEBAJIKAN (can_edit). KEPRIVASIAN ialah syarat utama:
--
--   * Semua table KUNCI sepenuhnya (tiada GRANT kepada authenticated/anon, RLS
--     hidup tanpa polisi) — akses HANYA melalui RPC `security definer`. Maka
--     tiada jalan REST langsung ke identiti ahli yang menghubungi kaunselor.
--   * LAJNAH KEBAJIKAN (dan Super Admin dalam app) hanya melihat BILANGAN ahli
--     berbeza yang menghubungi setiap kaunselor (`counseling_admin_list`), tidak
--     pernah siapa. Hanya kaunselor yang dihubungi nampak perbualannya.
--   * "Menghubungi" = ketik WhatsApp / Telefon (dicatat ketika ketikan — app tidak
--     dapat mengesahkan panggilan benar-benar berlaku) atau hantar mesej dalam app.
--   * Kaunselor yang dibuang (`aktif = false`) kehilangan akses perbualan dan
--     lencana; sejarah + bilangan kekal untuk LK; ahli masih melihat sejarahnya.
-- Hanya menambah (4 table + fungsi) dan menulis semula `admin_notifications()`
-- (+ blok ke-5; salinan tepat versi 152 selainnya). Tiada data sedia ada disentuh.
-- =============================================================================

create table if not exists public.counselors (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null unique references public.members(id) on delete restrict,
  aktif        boolean not null default true,
  appointed_at timestamptz not null default now(),
  appointed_by uuid references auth.users(id) on delete set null,
  removed_at   timestamptz,
  removed_by   uuid references auth.users(id) on delete set null
);

create table if not exists public.counseling_contacts (
  id           uuid primary key default gen_random_uuid(),
  counselor_id uuid not null references public.counselors(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  channel      text not null check (channel in ('whatsapp', 'telefon', 'mesej')),
  created_at   timestamptz not null default now()
);
create index if not exists counseling_contacts_counselor_idx on public.counseling_contacts (counselor_id, member_id);

create table if not exists public.counseling_threads (
  id                uuid primary key default gen_random_uuid(),
  counselor_id      uuid not null references public.counselors(id) on delete cascade,
  member_id         uuid not null references public.members(id) on delete cascade,
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now(),
  last_sender       text not null check (last_sender in ('ahli', 'kaunselor')),
  member_read_at    timestamptz,
  counselor_read_at timestamptz,
  unique (counselor_id, member_id)
);
create index if not exists counseling_threads_member_idx on public.counseling_threads (member_id, last_message_at desc);

create table if not exists public.counseling_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.counseling_threads(id) on delete cascade,
  sender     text not null check (sender in ('ahli', 'kaunselor')),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists counseling_messages_thread_idx on public.counseling_messages (thread_id, created_at);

-- Kunci penuh: RLS hidup, TIADA polisi, TIADA grant.
alter table public.counselors enable row level security;
alter table public.counseling_contacts enable row level security;
alter table public.counseling_threads enable row level security;
alter table public.counseling_messages enable row level security;
revoke all on public.counselors from anon, authenticated;
revoke all on public.counseling_contacts from anon, authenticated;
revoke all on public.counseling_threads from anon, authenticated;
revoke all on public.counseling_messages from anon, authenticated;

-- Id kaunselor AKTIF bagi pengguna semasa (null jika bukan).
create or replace function public.my_counselor_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id from public.counselors c
  where c.aktif and public.my_member_id() is not null and c.member_id = public.my_member_id()
    and auth.uid() is not null and not public.account_suspended(auth.uid());
$$;

create or replace function public.is_active_counselor()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.my_counselor_id() is not null; $$;

-- Senarai kaunselor aktif untuk ahli (tanpa diri sendiri).
create or replace function public.counseling_counselors()
returns table (id uuid, full_name text, generasi text, no_tel text)
language sql stable security definer set search_path = public
as $$
  select c.id, m.full_name, m.generasi, m.no_tel
  from public.counselors c
  join public.members m on m.id = c.member_id
  where c.aktif and not m.disekat
    and auth.uid() is not null and not public.account_suspended(auth.uid())
    and c.member_id is distinct from public.my_member_id()
  order by m.full_name;
$$;

-- Catat ketikan WhatsApp / Telefon (mesej dicatat oleh counseling_start).
create or replace function public.counseling_log_contact(p_counselor uuid, p_channel text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) or v_member is null then
    raise exception 'Akaun anda tidak dibenarkan.' using errcode = '42501';
  end if;
  if p_channel not in ('whatsapp', 'telefon') then
    raise exception 'Saluran tidak sah.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.counselors c where c.id = p_counselor and c.aktif and c.member_id <> v_member) then
    raise exception 'Kaunselor tidak ditemui.' using errcode = 'P0002';
  end if;
  -- Elak catatan berganda daripada ketikan berulang dalam masa singkat.
  if exists (select 1 from public.counseling_contacts x
             where x.counselor_id = p_counselor and x.member_id = v_member and x.channel = p_channel
               and x.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.counseling_contacts (counselor_id, member_id, channel)
  values (p_counselor, v_member, p_channel);
end;
$$;

-- Mulakan / sambung perbualan dengan kaunselor (ahli).
create or replace function public.counseling_start(p_counselor uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  v_body   text := btrim(coalesce(p_body, ''));
  v_id     uuid;
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) or v_member is null then
    raise exception 'Akaun anda tidak dibenarkan.' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Mesej mesti antara 1 hingga 2000 aksara.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.counselors c where c.id = p_counselor and c.aktif and c.member_id <> v_member) then
    raise exception 'Kaunselor ini tidak lagi bertugas.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.counseling_messages m
      join public.counseling_threads t on t.id = m.thread_id
      where t.member_id = v_member and m.sender = 'ahli' and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Terlalu banyak mesej dalam masa singkat. Cuba lagi sebentar.' using errcode = 'P0001';
  end if;

  insert into public.counseling_threads (counselor_id, member_id, last_sender, member_read_at)
  values (p_counselor, v_member, 'ahli', now())
  on conflict (counselor_id, member_id) do update
    set last_message_at = now(), last_sender = 'ahli', member_read_at = now()
  returning id into v_id;

  insert into public.counseling_messages (thread_id, sender, body) values (v_id, 'ahli', v_body);
  insert into public.counseling_contacts (counselor_id, member_id, channel) values (p_counselor, v_member, 'mesej');
  return v_id;
end;
$$;

-- Hantar mesej dalam perbualan sedia ada (ahli pemilik, atau kaunselor aktif perbualan itu).
create or replace function public.counseling_send(p_thread uuid, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  v_body   text := btrim(coalesce(p_body, ''));
  t        public.counseling_threads%rowtype;
  v_sender text;
begin
  if auth.uid() is null or public.account_suspended(auth.uid()) then
    raise exception 'Akaun anda tidak dibenarkan.' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Mesej mesti antara 1 hingga 2000 aksara.' using errcode = '22023';
  end if;
  select * into t from public.counseling_threads where id = p_thread for update;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;

  if v_member is not null and t.member_id = v_member then
    v_sender := 'ahli';
    if not exists (select 1 from public.counselors c where c.id = t.counselor_id and c.aktif) then
      raise exception 'Kaunselor ini tidak lagi bertugas.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.counseling_messages m
        join public.counseling_threads x on x.id = m.thread_id
        where x.member_id = v_member and m.sender = 'ahli' and m.created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Terlalu banyak mesej dalam masa singkat. Cuba lagi sebentar.' using errcode = 'P0001';
    end if;
  elsif public.my_counselor_id() = t.counselor_id then
    v_sender := 'kaunselor';
  else
    raise exception 'Anda tidak boleh membalas perbualan ini.' using errcode = '42501';
  end if;

  insert into public.counseling_messages (thread_id, sender, body) values (p_thread, v_sender, v_body);
  update public.counseling_threads
     set last_message_at = now(),
         last_sender = v_sender,
         member_read_at    = case when v_sender = 'ahli' then now() else member_read_at end,
         counselor_read_at = case when v_sender = 'kaunselor' then now() else counselor_read_at end
   where id = p_thread;
end;
$$;

create or replace function public.counseling_mark_read(p_thread uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.counseling_threads%rowtype;
begin
  select * into t from public.counseling_threads where id = p_thread;
  if not found then return; end if;
  if v_member is not null and t.member_id = v_member then
    update public.counseling_threads set member_read_at = now() where id = p_thread;
  elsif public.my_counselor_id() = t.counselor_id then
    update public.counseling_threads set counselor_read_at = now() where id = p_thread;
  end if;
end;
$$;

-- Perbualan ahli sendiri.
create or replace function public.counseling_my_threads()
returns table (id uuid, counselor_name text, counselor_aktif boolean, last_message_at timestamptz,
               last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, m.full_name, c.aktif, t.last_message_at, t.last_sender,
         (select x.body from public.counseling_messages x where x.thread_id = t.id order by x.created_at desc limit 1),
         (t.last_sender = 'kaunselor' and (t.member_read_at is null or t.member_read_at < t.last_message_at))
  from public.counseling_threads t
  join public.counselors c on c.id = t.counselor_id
  join public.members m on m.id = c.member_id
  where public.my_member_id() is not null and t.member_id = public.my_member_id()
  order by t.last_message_at desc
  limit 100;
$$;

create or replace function public.counseling_member_unread()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.counseling_threads t
  where public.my_member_id() is not null and t.member_id = public.my_member_id()
    and t.last_sender = 'kaunselor' and (t.member_read_at is null or t.member_read_at < t.last_message_at);
$$;

-- Peti masuk kaunselor (hanya kaunselor aktif; hanya perbualan sendiri).
create or replace function public.counseling_counselor_threads()
returns table (id uuid, member_name text, generasi text, last_message_at timestamptz,
               last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, m.full_name, m.generasi, t.last_message_at, t.last_sender,
         (select x.body from public.counseling_messages x where x.thread_id = t.id order by x.created_at desc limit 1),
         (t.last_sender = 'ahli' and (t.counselor_read_at is null or t.counselor_read_at < t.last_message_at))
  from public.counseling_threads t
  join public.members m on m.id = t.member_id
  where public.my_counselor_id() is not null and t.counselor_id = public.my_counselor_id()
  order by (t.last_sender = 'ahli' and (t.counselor_read_at is null or t.counselor_read_at < t.last_message_at)) desc,
           t.last_message_at desc
  limit 200;
$$;

create or replace function public.counseling_counselor_unread()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.counseling_threads t
  where public.my_counselor_id() is not null and t.counselor_id = public.my_counselor_id()
    and t.last_sender = 'ahli' and (t.counselor_read_at is null or t.counselor_read_at < t.last_message_at);
$$;

-- Kepala perbualan: pihak lawan + sama ada pemanggil ahli, + boleh balas.
create or replace function public.counseling_thread_info(p_thread uuid)
returns table (counterpart_name text, counterpart_generasi text, is_member boolean, can_reply boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.counseling_threads%rowtype;
  v_is_member boolean;
  v_is_counselor boolean;
begin
  select * into t from public.counseling_threads where id = p_thread;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;
  v_is_member := v_member is not null and t.member_id = v_member;
  v_is_counselor := coalesce(public.my_counselor_id() = t.counselor_id, false);
  if not v_is_member and not v_is_counselor then
    raise exception 'Anda tidak boleh melihat perbualan ini.' using errcode = '42501';
  end if;
  if v_is_member then
    return query
      select m.full_name, m.generasi, true,
             exists (select 1 from public.counselors c where c.id = t.counselor_id and c.aktif)
      from public.counselors c join public.members m on m.id = c.member_id where c.id = t.counselor_id;
  else
    return query select m.full_name, m.generasi, false, true from public.members m where m.id = t.member_id;
  end if;
end;
$$;

create or replace function public.counseling_thread_messages(p_thread uuid)
returns table (id uuid, sender text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.counseling_threads%rowtype;
begin
  select * into t from public.counseling_threads ct where ct.id = p_thread;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;
  if not ((v_member is not null and t.member_id = v_member)
          or coalesce(public.my_counselor_id() = t.counselor_id, false)) then
    raise exception 'Anda tidak boleh melihat perbualan ini.' using errcode = '42501';
  end if;
  return query
    select x.id, x.sender, x.body, x.created_at
    from public.counseling_messages x where x.thread_id = p_thread order by x.created_at, x.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- LAJNAH KEBAJIKAN: lantik / buang kaunselor + senarai dengan BILANGAN sahaja.
-- ---------------------------------------------------------------------------

create or replace function public.counseling_admin_list()
returns table (id uuid, full_name text, generasi text, aktif boolean, appointed_at timestamptz,
               removed_at timestamptz, ahli_menghubungi integer)
language sql stable security definer set search_path = public
as $$
  select c.id, m.full_name, m.generasi, c.aktif, c.appointed_at, c.removed_at,
         (select count(distinct x.member_id)::integer from public.counseling_contacts x where x.counselor_id = c.id)
  from public.counselors c
  join public.members m on m.id = c.member_id
  where public.has_department_access('LAJNAH KEBAJIKAN', false)
  order by c.aktif desc, m.full_name;
$$;

create or replace function public.counseling_member_search(p_q text)
returns table (id uuid, full_name text, generasi text, nombor_ahli text, sudah_kaunselor boolean)
language sql stable security definer set search_path = public
as $$
  select m.id, m.full_name, m.generasi, m.nombor_ahli::text,
         exists (select 1 from public.counselors c where c.member_id = m.id and c.aktif)
  from public.members m
  where public.has_department_access('LAJNAH KEBAJIKAN', true)
    and not m.disekat
    and char_length(btrim(coalesce(p_q, ''))) >= 2
    and (m.full_name ilike '%' || btrim(p_q) || '%' or m.nombor_ahli::text ilike '%' || btrim(p_q) || '%')
  order by m.full_name
  limit 20;
$$;

create or replace function public.counseling_appoint(p_member uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_department_access('LAJNAH KEBAJIKAN', true) then
    raise exception 'Anda tidak boleh melantik kaunselor.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and not m.disekat) then
    raise exception 'Ahli tidak ditemui.' using errcode = 'P0002';
  end if;
  insert into public.counselors (member_id, appointed_by)
  values (p_member, auth.uid())
  on conflict (member_id) do update
    set aktif = true, appointed_at = now(), appointed_by = auth.uid(), removed_at = null, removed_by = null
    where not public.counselors.aktif
  returning id into v_id;
  if v_id is null then
    raise exception 'Ahli ini sudah menjadi kaunselor.' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create or replace function public.counseling_remove(p_counselor uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_department_access('LAJNAH KEBAJIKAN', true) then
    raise exception 'Anda tidak boleh membuang kaunselor.' using errcode = '42501';
  end if;
  update public.counselors set aktif = false, removed_at = now(), removed_by = auth.uid()
   where id = p_counselor and aktif;
  if not found then
    raise exception 'Kaunselor tidak ditemui.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.my_counselor_id() from public, anon;
revoke all on function public.is_active_counselor() from public, anon;
revoke all on function public.counseling_counselors() from public, anon;
revoke all on function public.counseling_log_contact(uuid, text) from public, anon;
revoke all on function public.counseling_start(uuid, text) from public, anon;
revoke all on function public.counseling_send(uuid, text) from public, anon;
revoke all on function public.counseling_mark_read(uuid) from public, anon;
revoke all on function public.counseling_my_threads() from public, anon;
revoke all on function public.counseling_member_unread() from public, anon;
revoke all on function public.counseling_counselor_threads() from public, anon;
revoke all on function public.counseling_counselor_unread() from public, anon;
revoke all on function public.counseling_thread_info(uuid) from public, anon;
revoke all on function public.counseling_thread_messages(uuid) from public, anon;
revoke all on function public.counseling_admin_list() from public, anon;
revoke all on function public.counseling_member_search(text) from public, anon;
revoke all on function public.counseling_appoint(uuid) from public, anon;
revoke all on function public.counseling_remove(uuid) from public, anon;
grant execute on function public.my_counselor_id() to authenticated;
grant execute on function public.is_active_counselor() to authenticated;
grant execute on function public.counseling_counselors() to authenticated;
grant execute on function public.counseling_log_contact(uuid, text) to authenticated;
grant execute on function public.counseling_start(uuid, text) to authenticated;
grant execute on function public.counseling_send(uuid, text) to authenticated;
grant execute on function public.counseling_mark_read(uuid) to authenticated;
grant execute on function public.counseling_my_threads() to authenticated;
grant execute on function public.counseling_member_unread() to authenticated;
grant execute on function public.counseling_counselor_threads() to authenticated;
grant execute on function public.counseling_counselor_unread() to authenticated;
grant execute on function public.counseling_thread_info(uuid) to authenticated;
grant execute on function public.counseling_thread_messages(uuid) to authenticated;
grant execute on function public.counseling_admin_list() to authenticated;
grant execute on function public.counseling_member_search(text) to authenticated;
grant execute on function public.counseling_appoint(uuid) to authenticated;
grant execute on function public.counseling_remove(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Notifikasi: salinan tepat versi 152 + blok ke-5 (sesi kaunseling untuk kaunselor).
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

  return;
end;
$$;

notify pgrst, 'reload schema';
