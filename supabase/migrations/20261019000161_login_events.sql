-- Statistik Log Masuk: sejarah log masuk ahli + RPC statistik (JABATAN DATA & SUMBER MANUSIA).
--
-- Sebelum ini hanya `auth.users.last_sign_in_at` (log masuk TERAKHIR) yang ada, jadi
-- statistik harian/mingguan/bulanan/tahunan tidak boleh dikira. Migration ini:
--   1. Jadual `login_events` — satu baris setiap log masuk berjaya (kata laluan/OTP/OAuth).
--      Diisi oleh trigger pada `auth.users` apabila `last_sign_in_at` berubah, jadi
--      merangkumi SEMUA klien (Android/iOS/web) tanpa kod klien dan tidak boleh dipalsukan.
--   2. Isi semula (best-effort) daripada `auth.audit_log_entries` + `last_sign_in_at` sedia ada.
--   3. Empat RPC baca sahaja, dikawal `can_view_members()`.
--
-- NOTA: "log masuk" = sesi baharu (kata laluan). Membuka app dengan sesi tersimpan
-- (token disegar semula) BUKAN log masuk baharu dan tidak direkod di sini.
-- Hari dikira mengikut waktu Malaysia (Asia/Kuala_Lumpur). Idempotent.

create table if not exists public.login_events (
  id           bigint generated always as identity primary key,
  member_id    uuid not null references public.members (id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

create index if not exists login_events_logged_in_at_idx on public.login_events (logged_in_at);
create index if not exists login_events_member_idx on public.login_events (member_id, logged_in_at desc);

-- Terkunci: tiada polisi, tiada GRANT — akses hanya melalui RPC security definer di bawah.
alter table public.login_events enable row level security;
revoke all on public.login_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger pada auth.users
-- ---------------------------------------------------------------------------

create or replace function public.record_login_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is not null
     and new.last_sign_in_at is distinct from old.last_sign_in_at then
    insert into public.login_events (member_id, logged_in_at)
    select m.id, new.last_sign_in_at
    from public.members m
    where m.user_id = new.id;
  end if;
  return new;
exception when others then
  -- Merekod statistik tidak boleh sekali-kali menggagalkan log masuk.
  return new;
end;
$$;

revoke all on function public.record_login_event() from public, anon, authenticated;

drop trigger if exists on_auth_user_login_event on auth.users;
create trigger on_auth_user_login_event
  after update of last_sign_in_at on auth.users
  for each row execute function public.record_login_event();

-- ---------------------------------------------------------------------------
-- Isi semula (best-effort, hanya jika jadual masih kosong)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.login_events) then
    return;
  end if;

  -- (a) Sejarah sebenar daripada audit log Supabase Auth, jika dihidupkan & belum dibersihkan.
  begin
    insert into public.login_events (member_id, logged_in_at)
    select m.id, a.created_at
    from auth.audit_log_entries a
    join public.members m on m.user_id = nullif(a.payload ->> 'actor_id', '')::uuid
    where a.payload ->> 'action' = 'login';
  exception when others then
    null;
  end;

  -- (b) Sekurang-kurangnya log masuk terakhir setiap ahli, jika belum diwakili.
  insert into public.login_events (member_id, logged_in_at)
  select m.id, u.last_sign_in_at
  from public.members m
  join auth.users u on u.id = m.user_id
  where u.last_sign_in_at is not null
    and not exists (
      select 1 from public.login_events e
      where e.member_id = m.id and e.logged_in_at >= u.last_sign_in_at - interval '1 minute'
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Ringkasan: hari ini / 7 hari / 30 hari (ahli unik), belum pernah login, jumlah ahli.
create or replace function public.login_stats_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v jsonb;
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik log masuk memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  with ev as (
    select e.member_id, (e.logged_in_at at time zone 'Asia/Kuala_Lumpur')::date as d
    from public.login_events e
    join public.members m on m.id = e.member_id
    where not coalesce(m.disekat, false)
  )
  select jsonb_build_object(
    'jumlah_ahli', (select count(*) from public.members where not coalesce(disekat, false)),
    'hari_ini', (select count(distinct member_id) from ev where d = v_today),
    'tujuh_hari', (select count(distinct member_id) from ev where d > v_today - 7),
    'tiga_puluh_hari', (select count(distinct member_id) from ev where d > v_today - 30),
    'belum_pernah', (
      select count(*) from public.members m
      left join auth.users u on u.id = m.user_id
      where not coalesce(m.disekat, false)
        and u.last_sign_in_at is null
        and not exists (select 1 from public.login_events e where e.member_id = m.id)
    ),
    'tahun_terawal', coalesce((select extract(year from min(d))::int from ev), extract(year from v_today)::int)
  ) into v;

  return v;
end;
$$;

-- Siri masa. p_period: harian (bulan p_year/p_month) | mingguan (tahun) | bulanan (tahun) | tahunan (semua).
-- Setiap baris: kunci (tarikh mula bucket), log masuk (jumlah), ahli (unik). Bucket tanpa log
-- masuk dikembalikan dengan 0; bucket SELEPAS hari ini tidak dikembalikan.
create or replace function public.login_stats_series(
  p_period text,
  p_year   int default null,
  p_month  int default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_year  int := coalesce(p_year, extract(year from v_today)::int);
  v_from  date;
  v_to    date;
  v_step  interval;
  v_trunc text;
  v jsonb;
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik log masuk memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  if p_period = 'harian' then
    v_from := make_date(v_year, coalesce(p_month, extract(month from v_today)::int), 1);
    v_to := least(((v_from + interval '1 month')::date) - 1, v_today);
    v_step := interval '1 day'; v_trunc := 'day';
  elsif p_period = 'mingguan' then
    v_from := date_trunc('week', make_date(v_year, 1, 1)::timestamp)::date;
    v_to := least(make_date(v_year, 12, 31), v_today);
    v_step := interval '1 week'; v_trunc := 'week';
  elsif p_period = 'bulanan' then
    v_from := make_date(v_year, 1, 1);
    v_to := least(make_date(v_year, 12, 31), v_today);
    v_step := interval '1 month'; v_trunc := 'month';
  elsif p_period = 'tahunan' then
    v_from := make_date(coalesce(
      (select extract(year from min(logged_in_at at time zone 'Asia/Kuala_Lumpur'))::int from public.login_events),
      extract(year from v_today)::int), 1, 1);
    v_to := v_today;
    v_step := interval '1 year'; v_trunc := 'year';
  else
    raise exception 'Tempoh tidak sah.' using errcode = '22023';
  end if;

  if v_from > v_to then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'kunci', to_char(b.d, 'YYYY-MM-DD'),
           'log_masuk', coalesce(s.log_masuk, 0),
           'ahli', coalesce(s.ahli, 0)
         ) order by b.d), '[]'::jsonb)
  into v
  from generate_series(date_trunc(v_trunc, v_from::timestamp), v_to::timestamp, v_step) as g(d0)
  cross join lateral (select g.d0::date as d) b
  left join (
    select date_trunc(v_trunc, e.logged_in_at at time zone 'Asia/Kuala_Lumpur')::date as d,
           count(*)::int as log_masuk,
           count(distinct e.member_id)::int as ahli
    from public.login_events e
    join public.members m on m.id = e.member_id
    where not coalesce(m.disekat, false)
      and (e.logged_in_at at time zone 'Asia/Kuala_Lumpur')::date between v_from and v_to
    group by 1
  ) s on s.d = b.d;

  return v;
end;
$$;

-- Siapa log masuk dalam julat tarikh (hari, minggu, bulan atau tahun yang diketik pada carta).
create or replace function public.login_period_members(p_from date, p_to date)
returns table (
  member_id     uuid,
  nombor_ahli   text,
  full_name     text,
  generasi      text,
  kali          int,
  pertama       timestamptz,
  terakhir      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik log masuk memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select m.id, m.nombor_ahli, m.full_name, m.generasi,
         count(*)::int, min(e.logged_in_at), max(e.logged_in_at)
  from public.login_events e
  join public.members m on m.id = e.member_id
  where not coalesce(m.disekat, false)
    and (e.logged_in_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  group by m.id, m.nombor_ahli, m.full_name, m.generasi
  order by max(e.logged_in_at) desc;
end;
$$;

-- Log masuk terakhir setiap ahli (bertapis + berhalaman).
-- p_tapis: semua | belum (tidak pernah) | tidak_aktif_30 (tiada log masuk 30 hari lepas, termasuk belum pernah).
create or replace function public.login_last_seen(
  p_search text default null,
  p_tapis  text default 'semua',
  p_limit  int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v jsonb;
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Statistik log masuk memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  with r as (
    select m.id as member_id, m.nombor_ahli, m.full_name, m.generasi,
           greatest(u.last_sign_in_at, (select max(e.logged_in_at) from public.login_events e where e.member_id = m.id)) as terakhir,
           (select count(*) from public.login_events e
             where e.member_id = m.id and e.logged_in_at > now() - interval '30 days')::int as kali_30
    from public.members m
    left join auth.users u on u.id = m.user_id
    where not coalesce(m.disekat, false)
      and (v_q is null or m.full_name ilike '%' || v_q || '%' or m.nombor_ahli ilike '%' || v_q || '%')
  ), f as (
    select * from r
    where case p_tapis
            when 'belum' then terakhir is null
            when 'tidak_aktif_30' then terakhir is null or terakhir < now() - interval '30 days'
            else true
          end
  )
  select jsonb_build_object(
    'jumlah', (select count(*) from f),
    'baris', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', x.member_id, 'nombor_ahli', x.nombor_ahli, 'full_name', x.full_name,
        'generasi', x.generasi, 'terakhir', x.terakhir, 'kali_30', x.kali_30
      ) order by x.terakhir desc nulls last, x.full_name)
      from (
        select * from f
        order by terakhir desc nulls last, full_name
        limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))
      ) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.login_stats_summary() from public, anon;
revoke all on function public.login_stats_series(text, int, int) from public, anon;
revoke all on function public.login_period_members(date, date) from public, anon;
revoke all on function public.login_last_seen(text, text, int, int) from public, anon;
grant execute on function public.login_stats_summary() to authenticated;
grant execute on function public.login_stats_series(text, int, int) to authenticated;
grant execute on function public.login_period_members(date, date) to authenticated;
grant execute on function public.login_last_seen(text, text, int, int) to authenticated;

notify pgrst, 'reload schema';
