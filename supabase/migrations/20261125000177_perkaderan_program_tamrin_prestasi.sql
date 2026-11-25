-- =============================================================================
-- Perkaderan: program pra-keahlian, tamrin berjadual, prestasi mad'u  (2026-11-25)
--
--  * `perkaderan_program` : struktur ditetapkan admin LAJNAH PERKADERAN (nama, sasaran bilangan usrah).
--  * `perkaderan_tamrin`  : tamrin bertarikh tetap untuk SEMUA mad'u dalam program.
--  * `perkaderan_tamrin_attendance` : kehadiran tamrin (naqib untuk kumpulan sendiri, admin untuk semua).
--  * `sekolah_usrah_groups.program_id` : kumpulan baharu mengikut program aktif terkini secara lalai.
--  * Prestasi (RPC) : HANYA admin LAJNAH PERKADERAN (can_view) dan Super Admin. Naqib TIDAK dapat
--    ringkasan/peratus prestasi; mereka hanya merekod kehadiran. Ujian: belum (mekanisme menyusul).
-- =============================================================================

create table if not exists public.perkaderan_program (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null check (char_length(nama) between 1 and 120),
  sasaran_usrah  integer not null default 0 check (sasaran_usrah between 0 and 200),
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.perkaderan_tamrin (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.perkaderan_program (id) on delete cascade,
  nama        text not null check (char_length(nama) between 1 and 120),
  tarikh      date not null,
  lokasi      text check (lokasi is null or char_length(lokasi) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists perkaderan_tamrin_program_idx on public.perkaderan_tamrin (program_id, tarikh);

create table if not exists public.perkaderan_tamrin_attendance (
  tamrin_id  uuid not null references public.perkaderan_tamrin (id) on delete cascade,
  mad_u_id   uuid not null references public.sekolah_usrah_mad_u (id) on delete cascade,
  primary key (tamrin_id, mad_u_id)
);

alter table public.sekolah_usrah_groups
  add column if not exists program_id uuid references public.perkaderan_program (id) on delete set null;

-- Kumpulan baharu tanpa program -> program aktif terkini.
create or replace function public.sekolah_usrah_groups_default_program()
returns trigger language plpgsql as $$
begin
  if new.program_id is null then
    select p.id into new.program_id from public.perkaderan_program p where p.aktif order by p.created_at desc limit 1;
  end if;
  return new;
end $$;

drop trigger if exists sekolah_usrah_groups_default_program on public.sekolah_usrah_groups;
create trigger sekolah_usrah_groups_default_program
  before insert on public.sekolah_usrah_groups
  for each row execute function public.sekolah_usrah_groups_default_program();

drop trigger if exists perkaderan_program_set_updated_at on public.perkaderan_program;
create trigger perkaderan_program_set_updated_at
  before update on public.perkaderan_program
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Kebenaran
-- ---------------------------------------------------------------------------
create or replace function public.is_own_naqib_mad_u(p_mad_u uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sekolah_usrah_mad_u m
     where m.id = p_mad_u and public.is_own_naqib_group(m.group_id, uid)
  );
$$;
revoke all on function public.is_own_naqib_mad_u(uuid, uuid) from public, anon;
grant execute on function public.is_own_naqib_mad_u(uuid, uuid) to authenticated;

alter table public.perkaderan_program enable row level security;
alter table public.perkaderan_tamrin enable row level security;
alter table public.perkaderan_tamrin_attendance enable row level security;

drop policy if exists perkaderan_program_select on public.perkaderan_program;
create policy perkaderan_program_select on public.perkaderan_program for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_active_naqib());
drop policy if exists perkaderan_program_write on public.perkaderan_program;
create policy perkaderan_program_write on public.perkaderan_program for all to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan())
  with check (public.is_super_admin() or public.can_edit_perkaderan());

drop policy if exists perkaderan_tamrin_select on public.perkaderan_tamrin;
create policy perkaderan_tamrin_select on public.perkaderan_tamrin for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_active_naqib());
drop policy if exists perkaderan_tamrin_write on public.perkaderan_tamrin;
create policy perkaderan_tamrin_write on public.perkaderan_tamrin for all to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan())
  with check (public.is_super_admin() or public.can_edit_perkaderan());

drop policy if exists perkaderan_tamrin_att_select on public.perkaderan_tamrin_attendance;
create policy perkaderan_tamrin_att_select on public.perkaderan_tamrin_attendance for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_own_naqib_mad_u(mad_u_id));
drop policy if exists perkaderan_tamrin_att_insert on public.perkaderan_tamrin_attendance;
create policy perkaderan_tamrin_att_insert on public.perkaderan_tamrin_attendance for insert to authenticated
  with check (public.is_super_admin() or public.can_edit_perkaderan() or public.is_own_naqib_mad_u(mad_u_id));
drop policy if exists perkaderan_tamrin_att_delete on public.perkaderan_tamrin_attendance;
create policy perkaderan_tamrin_att_delete on public.perkaderan_tamrin_attendance for delete to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan() or public.is_own_naqib_mad_u(mad_u_id));

revoke all on public.perkaderan_program, public.perkaderan_tamrin, public.perkaderan_tamrin_attendance from anon;
revoke truncate, references, trigger on
  public.perkaderan_program, public.perkaderan_tamrin, public.perkaderan_tamrin_attendance from authenticated;
-- Kehadiran tamrin: tiada UPDATE (baris wujud = hadir).
revoke update on public.perkaderan_tamrin_attendance from authenticated;

-- ---------------------------------------------------------------------------
-- Prestasi (admin LAJNAH PERKADERAN / Super Admin sahaja)
-- ---------------------------------------------------------------------------
create or replace function public.perkaderan_program_resolve(p_program uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(p_program, (select id from public.perkaderan_program where aktif order by created_at desc limit 1));
$$;
revoke all on function public.perkaderan_program_resolve(uuid) from public, anon, authenticated;

create or replace function public.perkaderan_prestasi_madu(p_program uuid default null)
returns table (
  mad_u_id uuid, nama text, tingkatan text, kelas text, sekolah text, group_name text, naqib_nama text,
  usrah_hadir integer, usrah_jumlah integer, tamrin_hadir integer, tamrin_jumlah integer, sasaran_usrah integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_prog   uuid;
  v_today  date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_target integer;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran melihat prestasi.' using errcode = '42501';
  end if;
  v_prog := public.perkaderan_program_resolve(p_program);
  select p.sasaran_usrah into v_target from public.perkaderan_program p where p.id = v_prog;

  return query
  select m.id, m.nama, m.tingkatan, m.kelas, g.sekolah, g.group_name, nq.full_name,
    (select count(*)::integer from public.sekolah_usrah_attendance a
       join public.sekolah_usrah_sessions s on s.id = a.session_id
      where a.mad_u_id = m.id and s.group_id = g.id),
    (select count(*)::integer from public.sekolah_usrah_sessions s
      where s.group_id = g.id and s.session_date >= m.added_at::date and s.session_date <= v_today),
    (select count(*)::integer from public.perkaderan_tamrin_attendance ta
       join public.perkaderan_tamrin t on t.id = ta.tamrin_id
      where ta.mad_u_id = m.id and t.program_id = v_prog),
    (select count(*)::integer from public.perkaderan_tamrin t
      where t.program_id = v_prog and t.tarikh >= m.added_at::date and t.tarikh <= v_today),
    coalesce(v_target, 0)
  from public.sekolah_usrah_mad_u m
  join public.sekolah_usrah_groups g on g.id = m.group_id
  left join public.members nq on nq.id = g.naqib_member_id
  where m.is_active and g.is_active and g.program_id is not distinct from v_prog
  order by g.sekolah, m.nama;
end $$;
revoke all on function public.perkaderan_prestasi_madu(uuid) from public, anon;
grant execute on function public.perkaderan_prestasi_madu(uuid) to authenticated;

create or replace function public.perkaderan_prestasi_ringkasan(p_program uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_prog  uuid;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_out   jsonb;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran melihat prestasi.' using errcode = '42501';
  end if;
  v_prog := public.perkaderan_program_resolve(p_program);

  with r as (select * from public.perkaderan_prestasi_madu(v_prog)),
  aktif as (
    select m.id, m.added_at::date as ditambah, g.id as gid
      from public.sekolah_usrah_mad_u m
      join public.sekolah_usrah_groups g on g.id = m.group_id
     where m.is_active and g.is_active and g.program_id is not distinct from v_prog
  )
  select jsonb_build_object(
    'program', (select to_jsonb(p) from (select id, nama, sasaran_usrah from public.perkaderan_program where id = v_prog) p),
    'jumlah_madu', (select count(*) from r),
    'usrah_pct', (select case when sum(usrah_jumlah) > 0 then round(100.0 * sum(usrah_hadir) / sum(usrah_jumlah), 1) end from r),
    'tamrin_pct', (select case when sum(tamrin_jumlah) > 0 then round(100.0 * sum(tamrin_hadir) / sum(tamrin_jumlah), 1) end from r),
    'sekolah', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sekolah', x.sekolah, 'madu', x.n,
        'usrah_pct', case when x.uj > 0 then round(100.0 * x.uh / x.uj, 1) end,
        'tamrin_pct', case when x.tj > 0 then round(100.0 * x.th / x.tj, 1) end) order by x.sekolah)
      from (select sekolah, count(*) n, sum(usrah_hadir) uh, sum(usrah_jumlah) uj, sum(tamrin_hadir) th, sum(tamrin_jumlah) tj
              from r group by sekolah) x), '[]'::jsonb),
    'tamrin', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nama', t.nama, 'tarikh', t.tarikh,
        'hadir', (select count(*) from public.perkaderan_tamrin_attendance ta where ta.tamrin_id = t.id and ta.mad_u_id in (select id from aktif)),
        'jumlah', (select count(*) from aktif a where a.ditambah <= t.tarikh)) order by t.tarikh)
      from public.perkaderan_tamrin t where t.program_id = v_prog and t.tarikh <= v_today), '[]'::jsonb),
    'bulanan', coalesce((
      select jsonb_agg(jsonb_build_object('bulan', y.bulan, 'sesi', y.sesi, 'hadir', y.hadir, 'peluang', y.peluang) order by y.bulan)
      from (
        select to_char(s.session_date, 'YYYY-MM') as bulan, count(*) as sesi,
               sum((select count(*) from public.sekolah_usrah_attendance a where a.session_id = s.id)) as hadir,
               sum((select count(*) from aktif k where k.gid = s.group_id and k.ditambah <= s.session_date)) as peluang
          from public.sekolah_usrah_sessions s
          join public.sekolah_usrah_groups g on g.id = s.group_id
         where g.program_id is not distinct from v_prog and s.session_date <= v_today
         group by 1) y), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.perkaderan_prestasi_ringkasan(uuid) from public, anon;
grant execute on function public.perkaderan_prestasi_ringkasan(uuid) to authenticated;

create or replace function public.perkaderan_prestasi_detail(p_mad_u uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  m       public.sekolah_usrah_mad_u%rowtype;
  g       public.sekolah_usrah_groups%rowtype;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran melihat prestasi.' using errcode = '42501';
  end if;
  select * into m from public.sekolah_usrah_mad_u where id = p_mad_u;
  if not found then return null; end if;
  select * into g from public.sekolah_usrah_groups where id = m.group_id;

  return jsonb_build_object(
    'mad_u', jsonb_build_object('id', m.id, 'nama', m.nama, 'tingkatan', m.tingkatan, 'kelas', m.kelas,
                                'sekolah', g.sekolah, 'group_name', g.group_name, 'is_active', m.is_active),
    'sasaran_usrah', (select coalesce(sasaran_usrah, 0) from public.perkaderan_program where id = g.program_id),
    'usrah', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarikh', s.session_date, 'topik', s.topik,
        'hadir', exists (select 1 from public.sekolah_usrah_attendance a where a.session_id = s.id and a.mad_u_id = m.id))
        order by s.session_date)
      from public.sekolah_usrah_sessions s
      where s.group_id = g.id and s.session_date >= m.added_at::date and s.session_date <= v_today), '[]'::jsonb),
    'tamrin', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarikh', t.tarikh, 'nama', t.nama,
        'hadir', exists (select 1 from public.perkaderan_tamrin_attendance ta where ta.tamrin_id = t.id and ta.mad_u_id = m.id))
        order by t.tarikh)
      from public.perkaderan_tamrin t
      where t.program_id = g.program_id and t.tarikh >= m.added_at::date and t.tarikh <= v_today), '[]'::jsonb)
  );
end $$;
revoke all on function public.perkaderan_prestasi_detail(uuid) from public, anon;
grant execute on function public.perkaderan_prestasi_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tamrin: senarai mad'u + kehadiran yang boleh diurus pemanggil (naqib: kumpulan sendiri; admin: semua)
-- ---------------------------------------------------------------------------
create or replace function public.perkaderan_tamrin_roster(p_tamrin uuid)
returns table (mad_u_id uuid, nama text, tingkatan text, sekolah text, group_name text, hadir boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_prog uuid;
  v_admin boolean := public.is_super_admin() or public.can_view_perkaderan();
begin
  select t.program_id into v_prog from public.perkaderan_tamrin t where t.id = p_tamrin;
  if v_prog is null then return; end if;
  if not (v_admin or public.is_active_naqib()) then
    raise exception 'Tiada kebenaran.' using errcode = '42501';
  end if;
  return query
  select m.id, m.nama, m.tingkatan, g.sekolah, g.group_name,
         exists (select 1 from public.perkaderan_tamrin_attendance ta where ta.tamrin_id = p_tamrin and ta.mad_u_id = m.id)
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
   where m.is_active and g.is_active and g.program_id is not distinct from v_prog
     and (v_admin or public.is_own_naqib_group(g.id))
   order by g.sekolah, g.group_name, m.nama;
end $$;
revoke all on function public.perkaderan_tamrin_roster(uuid) from public, anon;
grant execute on function public.perkaderan_tamrin_roster(uuid) to authenticated;

-- Simpan kehadiran tamrin untuk senarai mad'u yang dipaparkan (p_semua); p_hadir ialah yang hadir.
create or replace function public.perkaderan_tamrin_set(p_tamrin uuid, p_semua uuid[], p_hadir uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_super_admin() or public.can_edit_perkaderan();
  v_id uuid;
begin
  if not exists (select 1 from public.perkaderan_tamrin where id = p_tamrin) then
    raise exception 'Tamrin tidak dijumpai.';
  end if;
  foreach v_id in array coalesce(p_semua, '{}') loop
    if not (v_admin or public.is_own_naqib_mad_u(v_id)) then
      raise exception 'Tiada kebenaran mengemas kini kehadiran mad''u ini.' using errcode = '42501';
    end if;
    if v_id = any (coalesce(p_hadir, '{}')) then
      insert into public.perkaderan_tamrin_attendance (tamrin_id, mad_u_id) values (p_tamrin, v_id) on conflict do nothing;
    else
      delete from public.perkaderan_tamrin_attendance where tamrin_id = p_tamrin and mad_u_id = v_id;
    end if;
  end loop;
end $$;
revoke all on function public.perkaderan_tamrin_set(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.perkaderan_tamrin_set(uuid, uuid[], uuid[]) to authenticated;
