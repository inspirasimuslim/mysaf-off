-- Perkaderan: ujian (banyak ujian bagi satu program, markah angka, naqib masukkan, admin tetapkan markah lulus)  (2026-11-25)
create table if not exists public.perkaderan_ujian (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.perkaderan_program (id) on delete cascade,
  nama         text not null check (char_length(nama) between 1 and 120),
  tarikh       date not null,
  markah_penuh numeric(6,2) not null default 100 check (markah_penuh > 0 and markah_penuh <= 1000),
  markah_lulus numeric(6,2) not null default 50 check (markah_lulus >= 0),
  created_at   timestamptz not null default now(),
  check (markah_lulus <= markah_penuh)
);
create index if not exists perkaderan_ujian_program_idx on public.perkaderan_ujian (program_id, tarikh);

create table if not exists public.perkaderan_ujian_markah (
  ujian_id uuid not null references public.perkaderan_ujian (id) on delete cascade,
  mad_u_id uuid not null references public.sekolah_usrah_mad_u (id) on delete cascade,
  markah   numeric(6,2) not null check (markah >= 0),
  primary key (ujian_id, mad_u_id)
);

alter table public.perkaderan_ujian enable row level security;
alter table public.perkaderan_ujian_markah enable row level security; -- tiada polisi: akses melalui RPC sahaja

create policy perkaderan_ujian_select on public.perkaderan_ujian for select to authenticated
  using (public.is_super_admin() or public.can_view_perkaderan() or public.is_active_naqib());
create policy perkaderan_ujian_write on public.perkaderan_ujian for all to authenticated
  using (public.is_super_admin() or public.can_edit_perkaderan())
  with check (public.is_super_admin() or public.can_edit_perkaderan());

revoke all on public.perkaderan_ujian, public.perkaderan_ujian_markah from anon;
revoke all on public.perkaderan_ujian_markah from authenticated;
revoke truncate, references, trigger on public.perkaderan_ujian from authenticated;

create or replace function public.perkaderan_ujian_roster(p_ujian uuid)
returns table (mad_u_id uuid, nama text, tingkatan text, sekolah text, group_name text, markah numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_prog uuid; v_admin boolean := public.is_super_admin() or public.can_view_perkaderan();
begin
  select u.program_id into v_prog from public.perkaderan_ujian u where u.id = p_ujian;
  if v_prog is null then return; end if;
  if not (v_admin or public.is_active_naqib()) then raise exception 'Tiada kebenaran.' using errcode='42501'; end if;
  return query
  select m.id, m.nama, m.tingkatan, g.sekolah, g.group_name,
         (select k.markah from public.perkaderan_ujian_markah k where k.ujian_id = p_ujian and k.mad_u_id = m.id)
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
   where m.is_active and g.is_active and g.program_id is not distinct from v_prog
     and (v_admin or public.is_own_naqib_group(g.id))
   order by g.sekolah, g.group_name, m.nama;
end $$;
revoke all on function public.perkaderan_ujian_roster(uuid) from public, anon;
grant execute on function public.perkaderan_ujian_roster(uuid) to authenticated;

-- p_markah[i] null = tiada markah (padam). Naqib: kumpulan sendiri sahaja; admin edit: semua.
create or replace function public.perkaderan_ujian_set(p_ujian uuid, p_ids uuid[], p_markah numeric[])
returns void language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.is_super_admin() or public.can_edit_perkaderan(); v_penuh numeric; i int;
begin
  select markah_penuh into v_penuh from public.perkaderan_ujian where id = p_ujian;
  if v_penuh is null then raise exception 'Ujian tidak dijumpai.'; end if;
  if coalesce(array_length(p_ids,1),0) <> coalesce(array_length(p_markah,1),0) then raise exception 'Data tidak sepadan.'; end if;
  for i in 1 .. coalesce(array_length(p_ids,1),0) loop
    if not (v_admin or public.is_own_naqib_mad_u(p_ids[i])) then
      raise exception 'Tiada kebenaran memasukkan markah mad''u ini.' using errcode='42501';
    end if;
    if p_markah[i] is null then
      delete from public.perkaderan_ujian_markah where ujian_id = p_ujian and mad_u_id = p_ids[i];
    else
      if p_markah[i] < 0 or p_markah[i] > v_penuh then raise exception 'Markah mesti antara 0 dan %.', v_penuh; end if;
      insert into public.perkaderan_ujian_markah(ujian_id, mad_u_id, markah) values (p_ujian, p_ids[i], p_markah[i])
        on conflict (ujian_id, mad_u_id) do update set markah = excluded.markah;
    end if;
  end loop;
end $$;
revoke all on function public.perkaderan_ujian_set(uuid, uuid[], numeric[]) from public, anon;
grant execute on function public.perkaderan_ujian_set(uuid, uuid[], numeric[]) to authenticated;

-- Prestasi (admin Lajnah / Super Admin sahaja)
create or replace function public.perkaderan_prestasi_ujian(p_program uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prog uuid;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then raise exception 'Tiada kebenaran melihat prestasi.' using errcode='42501'; end if;
  v_prog := public.perkaderan_program_resolve(p_program);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'nama',u.nama,'tarikh',u.tarikh,'penuh',u.markah_penuh,'lulus',u.markah_lulus,
      'dinilai', s.n, 'bil_lulus', s.l, 'purata', s.p, 'aktif', s.a) order by u.tarikh)
    from public.perkaderan_ujian u
    cross join lateral (
      select count(k.*)::int n, count(*) filter (where k.markah >= u.markah_lulus)::int l, round(avg(k.markah),1) p,
             (select count(*) from public.sekolah_usrah_mad_u m join public.sekolah_usrah_groups g on g.id=m.group_id
               where m.is_active and g.is_active and g.program_id is not distinct from v_prog)::int a
        from public.perkaderan_ujian_markah k
        join public.sekolah_usrah_mad_u m on m.id = k.mad_u_id and m.is_active
       where k.ujian_id = u.id) s
    where u.program_id = v_prog), '[]'::jsonb);
end $$;
revoke all on function public.perkaderan_prestasi_ujian(uuid) from public, anon;
grant execute on function public.perkaderan_prestasi_ujian(uuid) to authenticated;

create or replace function public.perkaderan_prestasi_ujian_madu(p_mad_u uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then raise exception 'Tiada kebenaran melihat prestasi.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('nama',u.nama,'tarikh',u.tarikh,'penuh',u.markah_penuh,'lulus_markah',u.markah_lulus,
      'markah', k.markah, 'lulus', case when k.markah is null then null else k.markah >= u.markah_lulus end) order by u.tarikh)
    from public.sekolah_usrah_mad_u m
    join public.sekolah_usrah_groups g on g.id = m.group_id
    join public.perkaderan_ujian u on u.program_id = g.program_id
    left join public.perkaderan_ujian_markah k on k.ujian_id = u.id and k.mad_u_id = m.id
    where m.id = p_mad_u), '[]'::jsonb);
end $$;
revoke all on function public.perkaderan_prestasi_ujian_madu(uuid) from public, anon;
grant execute on function public.perkaderan_prestasi_ujian_madu(uuid) to authenticated;
