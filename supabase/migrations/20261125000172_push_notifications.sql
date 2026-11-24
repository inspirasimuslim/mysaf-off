-- Notifikasi push ke telefon (Expo Push Service -> FCM).
-- Corak: pencetus pada jadual peristiwa -> baris push_outbox -> pg_net memanggil Edge Function `send-push`
-- (service role) yang menghantar dan menanda siap. Jadual TERKUNCI (RLS tanpa polisi, tiada GRANT);
-- ahli hanya mendaftar/membuang token peranti sendiri melalui RPC.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  token       text primary key check (token ~ '^(Exponent|Expo)PushToken\[.+\]$' and length(token) <= 200),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios')),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create table if not exists public.push_outbox (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  route       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists push_outbox_unsent_idx on public.push_outbox (id) where sent_at is null;
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- Ahli mendaftar token peranti sendiri. Token yang sama berpindah kepada pengguna terkini (peranti dikongsi).
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak dibenarkan.' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak dibenarkan.' using errcode = '42501';
  end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_push_token(text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;

-- Dalaman (tidak di-grant): masukkan satu baris setiap penerima.
create or replace function public.push_enqueue(p_users uuid[], p_title text, p_body text, p_route text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_outbox (user_id, title, body, route)
  select distinct u, p_title, p_body, p_route from unnest(p_users) u where u is not null;
$$;
revoke all on function public.push_enqueue(uuid[], text, text, text) from public, anon, authenticated;

-- Pengguna admin sesebuah department (can_view) + Super Admin tidak dimasukkan (hanya yang ditugaskan).
create or replace function public.push_department_users(p_department uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct aa.user_id), '{}')
    from public.admin_assignments aa
   where aa.department_id = p_department and aa.can_view;
$$;
revoke all on function public.push_department_users(uuid) from public, anon, authenticated;

-- Panggil Edge Function bila ada baris baharu (diselaraskan: satu panggilan setiap pernyataan).
create or replace function public.push_outbox_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := 'https://mjxwvlvjmhqhnqprmbps.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  return null; -- menghantar push tidak boleh menggagalkan peristiwa asal
end $$;

drop trigger if exists push_outbox_after_insert on public.push_outbox;
create trigger push_outbox_after_insert
  after insert on public.push_outbox
  for each statement execute function public.push_outbox_notify();

-- 1. Maklum balas ahli <-> department
create or replace function public.push_on_feedback_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.feedback_threads%rowtype;
  v_member_user uuid;
begin
  select * into t from public.feedback_threads where id = new.thread_id;
  if not found then return null; end if;
  select m.user_id into v_member_user from public.members m where m.id = t.member_id;
  if new.sender = 'ahli' then
    perform public.push_enqueue(
      array_remove(public.push_department_users(t.department_id), v_member_user),
      'Maklum balas ahli', 'Ada mesej maklum balas baharu daripada ahli.',
      '/(app)/admin/maklum-balas-chat?dept=' || t.department_id::text);
  else
    perform public.push_enqueue(array[v_member_user], 'Maklum balas anda',
      'Ada balasan baharu untuk maklum balas anda.', '/(app)/maklum-balas-chat?id=' || t.id::text);
  end if;
  return null;
end $$;
drop trigger if exists push_feedback_message on public.feedback_messages;
create trigger push_feedback_message after insert on public.feedback_messages
  for each row execute function public.push_on_feedback_message();

-- 2. Kaunseling — tiada nama atau isi dalam notifikasi (paparan skrin kunci).
create or replace function public.push_on_counseling_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.counseling_threads%rowtype;
  v_user uuid;
begin
  select * into t from public.counseling_threads where id = new.thread_id;
  if not found then return null; end if;
  if new.sender = 'ahli' then
    select m.user_id into v_user from public.counselors c join public.members m on m.id = c.member_id
     where c.id = t.counselor_id and c.aktif;
    perform public.push_enqueue(array[v_user], 'Bantuan Kaunseling', 'Ada mesej baharu.', '/(app)/admin/kaunseling-peti');
  else
    select m.user_id into v_user from public.members m where m.id = t.member_id;
    perform public.push_enqueue(array[v_user], 'Bantuan Kaunseling', 'Ada mesej baharu.', '/(app)/kaunseling');
  end if;
  return null;
end $$;
drop trigger if exists push_counseling_message on public.counseling_messages;
create trigger push_counseling_message after insert on public.counseling_messages
  for each row execute function public.push_on_counseling_message();

-- 3. Permohonan bantuan zakat
create or replace function public.push_on_bantuan_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dept uuid;
  v_member_user uuid;
begin
  if new.status is not distinct from old.status then return null; end if;
  select m.user_id into v_member_user from public.members m where m.id = new.member_id;
  if new.status = 'submitted' then
    select id into v_dept from public.departments where name = 'TABUNG ZAKAT';
    perform public.push_enqueue(array_remove(public.push_department_users(v_dept), v_member_user),
      'Permohonan Zakat', 'Ada permohonan bantuan baharu untuk disemak.', '/(app)/admin/bantuan');
  elsif new.status in ('needs_information', 'approved', 'rejected') then
    perform public.push_enqueue(array[v_member_user], 'Permohonan Bantuan',
      case new.status when 'needs_information' then 'Permohonan anda memerlukan maklumat tambahan.'
                      else 'Ada keputusan untuk permohonan bantuan anda.' end,
      '/(app)/bantuan-info');
  end if;
  return null;
end $$;
drop trigger if exists push_bantuan_status on public.bantuan_applications;
create trigger push_bantuan_status after update of status on public.bantuan_applications
  for each row execute function public.push_on_bantuan_status();

-- 4. Permohonan MBM
create or replace function public.push_on_mbm_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dept uuid;
  v_member_user uuid;
begin
  select id into v_dept from public.departments where name = 'MAJLIS BAITUL MUSLIM';
  select m.user_id into v_member_user from public.members m where m.id = new.member_id;
  perform public.push_enqueue(array_remove(public.push_department_users(v_dept), v_member_user),
    'Permohonan Majlis Baitul Muslim', 'Ada permohonan MBM baharu.', '/(app)/admin/mbm');
  return null;
end $$;
drop trigger if exists push_mbm_application on public.mbm_applications;
create trigger push_mbm_application after insert on public.mbm_applications
  for each row execute function public.push_on_mbm_application();

-- Penghantar: Edge Function (service role) mengambil baris belum dihantar.
create or replace function public.push_claim_batch(p_limit int default 100)
returns table (id bigint, user_id uuid, title text, body text, route text, tokens text[])
language sql security definer set search_path = public as $$
  with picked as (
    update public.push_outbox o set sent_at = now()
     where o.id in (select id from public.push_outbox where sent_at is null order by id limit p_limit for update skip locked)
    returning o.id, o.user_id, o.title, o.body, o.route
  )
  select p.id, p.user_id, p.title, p.body, p.route,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = p.user_id), '{}')
    from picked p;
$$;
revoke all on function public.push_claim_batch(int) from public, anon, authenticated;
grant execute on function public.push_claim_batch(int) to service_role;

-- Pembersihan token yang ditolak (DeviceNotRegistered) dan baris lama.
create or replace function public.push_drop_tokens(p_tokens text[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = any(p_tokens);
$$;
revoke all on function public.push_drop_tokens(text[]) from public, anon, authenticated;
grant execute on function public.push_drop_tokens(text[]) to service_role;

-- Semak rahsia webhook (Vault) untuk Edge Function send-push.
create or replace function public.push_check_secret(p_secret text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(p_secret <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'push_webhook_secret' and decrypted_secret = p_secret
  ), false);
$$;
revoke all on function public.push_check_secret(text) from public, anon, authenticated;
grant execute on function public.push_check_secret(text) to service_role;
