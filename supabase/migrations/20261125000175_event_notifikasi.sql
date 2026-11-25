-- =============================================================================
-- Notifikasi program / usrah / pengumuman (2026-11-25)
--
-- Setiap program, usrah dan pengumuman ada suis noti yang ditetapkan admin:
--   usrah_events  : noti_baharu, noti_peringatan, noti_perubahan (kemas kini + batal)
--   announcements : noti_baharu, noti_perubahan
-- Penerima = semua ahli aktif (tidak disekat) yang mempunyai akaun. Usrah yang ada
-- kawasan_usrah dihantar kepada ahli kawasan itu sahaja (supaya tidak menghujani 300 ahli).
-- Hantaran guna paip push sedia ada (push_enqueue -> push_outbox -> send-push).
-- Peti masuk dalam app membaca push_outbox milik pengguna sendiri (read_at baharu).
-- Peringatan: pg_cron setiap 10 minit -> event_send_reminders() (24 jam dan 2 jam sebelum).
-- =============================================================================

alter table public.usrah_events
  add column if not exists noti_baharu     boolean not null default true,
  add column if not exists noti_peringatan boolean not null default true,
  add column if not exists noti_perubahan  boolean not null default true,
  add column if not exists peringatan_1_at timestamptz,
  add column if not exists peringatan_2_at timestamptz;

alter table public.announcements
  add column if not exists noti_baharu    boolean not null default true,
  add column if not exists noti_perubahan boolean not null default true;

alter table public.push_outbox add column if not exists read_at timestamptz;
create index if not exists push_outbox_user_idx on public.push_outbox (user_id, id desc);

-- ---------------------------------------------------------------------------
-- Penerima
-- ---------------------------------------------------------------------------
create or replace function public.push_members_for(p_kawasan text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
    from public.members m
   where m.user_id is not null
     and not coalesce(m.disekat, false)
     and (p_kawasan is null or m.kawasan_usrah = p_kawasan);
$$;
revoke all on function public.push_members_for(text) from public, anon, authenticated;

create or replace function public.event_start_ts(p_date date, p_time time)
returns timestamptz language sql immutable as $$
  select (p_date + p_time) at time zone 'Asia/Kuala_Lumpur';
$$;

create or replace function public.event_when_text(p_date date, p_time time)
returns text language sql immutable as $$
  select to_char(p_date, 'DD/MM/YYYY') || ', ' || to_char(p_time, 'HH12:MI AM');
$$;

-- ---------------------------------------------------------------------------
-- Program / usrah baharu
-- ---------------------------------------------------------------------------
create or replace function public.usrah_events_notify_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.noti_baharu and new.is_active and new.archived_at is null then
    perform public.push_enqueue(
      array_remove(public.push_members_for(new.kawasan_usrah), new.created_by),
      case when new.event_type = 'usrah' then 'Usrah baharu' else 'Program baharu' end,
      new.name || ' — ' || public.event_when_text(new.start_date, new.start_time),
      '/(app)/event-info?id=' || new.id::text);
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists usrah_events_notify_new on public.usrah_events;
create trigger usrah_events_notify_new
  after insert on public.usrah_events
  for each row execute function public.usrah_events_notify_new();

-- ---------------------------------------------------------------------------
-- Tetapkan semula tanda peringatan bila masa mula berubah (BEFORE supaya tiada rekursi)
-- ---------------------------------------------------------------------------
create or replace function public.usrah_events_reset_reminders()
returns trigger language plpgsql as $$
begin
  if new.start_date is distinct from old.start_date or new.start_time is distinct from old.start_time then
    new.peringatan_1_at := null;
    new.peringatan_2_at := null;
  end if;
  return new;
end $$;

drop trigger if exists usrah_events_reset_reminders on public.usrah_events;
create trigger usrah_events_reset_reminders
  before update on public.usrah_events
  for each row execute function public.usrah_events_reset_reminders();

-- ---------------------------------------------------------------------------
-- Perubahan / pembatalan (program yang belum bermula sahaja)
-- ---------------------------------------------------------------------------
create or replace function public.usrah_events_notify_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text := case when new.event_type = 'usrah' then 'Usrah' else 'Program' end;
  v_route text := '/(app)/event-info?id=' || new.id::text;
begin
  if not new.noti_perubahan then
    return null;
  end if;
  if public.event_start_ts(new.start_date, new.start_time) < now() then
    return null;
  end if;

  if (old.archived_at is null and new.archived_at is not null)
     or (old.is_active and not new.is_active) then
    perform public.push_enqueue(public.push_members_for(new.kawasan_usrah),
      v_label || ' dibatalkan', new.name || ' telah dibatalkan.', '/(app)/event-info?id=' || new.id::text);
  elsif new.is_active and new.archived_at is null and (
        new.start_date is distinct from old.start_date
     or new.start_time is distinct from old.start_time
     or new.location_text is distinct from old.location_text
     or new.name is distinct from old.name) then
    perform public.push_enqueue(public.push_members_for(new.kawasan_usrah),
      v_label || ' dikemas kini',
      new.name || ' — ' || public.event_when_text(new.start_date, new.start_time)
        || coalesce(', ' || nullif(new.location_text, ''), ''),
      v_route);
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists usrah_events_notify_change on public.usrah_events;
create trigger usrah_events_notify_change
  after update on public.usrah_events
  for each row execute function public.usrah_events_notify_change();

-- ---------------------------------------------------------------------------
-- Pengumuman
-- ---------------------------------------------------------------------------
create or replace function public.announcements_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.noti_baharu and new.is_active then
      perform public.push_enqueue(
        array_remove(public.push_members_for(null), new.created_by),
        'Pengumuman baharu', new.title, '/(app)/announcement-info?id=' || new.id::text);
    end if;
  elsif new.noti_perubahan and new.is_active and old.is_active and (
        new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.poster_url is distinct from old.poster_url) then
    perform public.push_enqueue(public.push_members_for(null),
      'Pengumuman dikemas kini', new.title, '/(app)/announcement-info?id=' || new.id::text);
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify
  after insert or update on public.announcements
  for each row execute function public.announcements_notify();

-- ---------------------------------------------------------------------------
-- Peringatan berjadual
-- ---------------------------------------------------------------------------
create or replace function public.event_send_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_start timestamptz;
  v_count integer := 0;
begin
  for r in
    select * from public.usrah_events
     where noti_peringatan and is_active and archived_at is null
       and (peringatan_1_at is null or peringatan_2_at is null)
       and start_date >= (now() at time zone 'Asia/Kuala_Lumpur')::date - 1
  loop
    v_start := public.event_start_ts(r.start_date, r.start_time);
    if v_start <= now() then
      continue;
    end if;

    -- 2 jam sebelum
    if r.peringatan_2_at is null and now() >= v_start - interval '2 hours' then
      perform public.push_enqueue(public.push_members_for(r.kawasan_usrah),
        'Bermula dalam 2 jam',
        r.name || coalesce(' — ' || nullif(r.location_text, ''), ''),
        '/(app)/event-info?id=' || r.id::text);
      update public.usrah_events set peringatan_2_at = now(), peringatan_1_at = coalesce(peringatan_1_at, now()) where id = r.id;
      v_count := v_count + 1;
    -- 24 jam sebelum (dilangkau jika program dicipta kurang 24 jam sebelum mula; noti baharu sudah memberitahu)
    elsif r.peringatan_1_at is null and now() >= v_start - interval '24 hours' then
      if r.created_at <= v_start - interval '24 hours' then
        perform public.push_enqueue(public.push_members_for(r.kawasan_usrah),
          'Peringatan: ' || r.name,
          'Bermula ' || public.event_when_text(r.start_date, r.start_time),
          '/(app)/event-info?id=' || r.id::text);
        v_count := v_count + 1;
      end if;
      update public.usrah_events set peringatan_1_at = now() where id = r.id;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.event_send_reminders() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  perform cron.unschedule('event-reminders');
exception when others then null;
end $$;
select cron.schedule('event-reminders', '*/10 * * * *', $cron$select public.event_send_reminders()$cron$);

-- ---------------------------------------------------------------------------
-- Peti masuk ahli (membaca push_outbox milik sendiri sahaja)
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(p_limit integer default 50)
returns table (id bigint, title text, body text, route text, created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.body, o.route, o.created_at, o.read_at
    from public.push_outbox o
   where o.user_id = auth.uid() and o.created_at > now() - interval '60 days'
   order by o.id desc
   limit least(coalesce(p_limit, 50), 100);
$$;
revoke all on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;

create or replace function public.my_notifications_unread()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.push_outbox o
   where o.user_id = auth.uid() and o.read_at is null and o.created_at > now() - interval '60 days';
$$;
revoke all on function public.my_notifications_unread() from public, anon;
grant execute on function public.my_notifications_unread() to authenticated;

create or replace function public.my_notifications_mark_read(p_id bigint default null)
returns void language sql security definer set search_path = public as $$
  update public.push_outbox set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;
revoke all on function public.my_notifications_mark_read(bigint) from public, anon;
grant execute on function public.my_notifications_mark_read(bigint) to authenticated;
