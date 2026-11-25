-- Kuota naqib/naqibah setiap kumpulan: 2 -> 4. Naqib ke-3 dan ke-4 disimpan dalam array `naqib_tambahan` (maks 2).
alter table public.sekolah_usrah_groups
  add column if not exists naqib_tambahan uuid[] not null default '{}';
alter table public.sekolah_usrah_groups drop constraint if exists sekolah_usrah_groups_naqib_tambahan_maks2;
alter table public.sekolah_usrah_groups
  add constraint sekolah_usrah_groups_naqib_tambahan_maks2 check (cardinality(naqib_tambahan) <= 2);

create or replace function public.is_own_naqib_group(p_group_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_naqib(uid) and exists (
    select 1 from public.sekolah_usrah_groups g
    where g.id = p_group_id
      and (public.my_member_id(uid) in (g.naqib_member_id, g.default_partner_naqib_member_id)
           or public.my_member_id(uid) = any (g.naqib_tambahan))
  );
$$;

drop policy if exists sekolah_usrah_groups_select on public.sekolah_usrah_groups;
create policy sekolah_usrah_groups_select on public.sekolah_usrah_groups for select to authenticated using (
  public.is_super_admin() or public.can_view_perkaderan()
  or (public.is_active_naqib() and (naqib_member_id = public.my_member_id()
        or default_partner_naqib_member_id = public.my_member_id()
        or public.my_member_id() = any (naqib_tambahan)))
);

drop function if exists public.perkaderan_slot_assign(text, text, integer, uuid, uuid);
create or replace function public.perkaderan_slot_assign(p_sekolah text, p_tingkatan text, p_no integer, p_naqib uuid,
  p_partner uuid default null, p_tambahan uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid(); m uuid; v_extra uuid[];
begin
  if not (public.is_super_admin() or public.can_edit_perkaderan()) then
    raise exception 'Tiada kebenaran melantik naqib.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perkaderan_sekolah where nama = p_sekolah) then
    raise exception 'Sekolah tiada dalam senarai.';
  end if;
  if p_tingkatan not in ('Tingkatan 3','Tingkatan 4','Tingkatan 5') or p_no not between 1 and 10 then
    raise exception 'Tingkatan atau nombor kumpulan tidak sah.';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_extra from unnest(coalesce(p_tambahan, '{}')) x where x is not null;
  if cardinality(v_extra) > 2 then raise exception 'Maksimum 4 naqib setiap kumpulan.'; end if;
  if p_partner is not null and p_partner = p_naqib then raise exception 'Naqib kedua mesti orang lain.'; end if;
  if p_naqib = any (v_extra) or (p_partner is not null and p_partner = any (v_extra)) then
    raise exception 'Seorang naqib tidak boleh dipilih dua kali.';
  end if;
  foreach m in array array[p_naqib, p_partner] || v_extra loop
    if m is not null and not exists (select 1 from public.perkaderan_naqib_assignments where member_id = m and is_active) then
      insert into public.perkaderan_naqib_assignments(member_id, assigned_by) values (m, v_uid);
    end if;
  end loop;
  select id into v_id from public.sekolah_usrah_groups
   where is_active and sekolah = p_sekolah and tingkatan = p_tingkatan and no_kumpulan = p_no;
  if v_id is null then
    insert into public.sekolah_usrah_groups(naqib_member_id, default_partner_naqib_member_id, naqib_tambahan, sekolah, tingkatan, no_kumpulan)
    values (p_naqib, p_partner, v_extra, p_sekolah, p_tingkatan, p_no) returning id into v_id;
  else
    update public.sekolah_usrah_groups set naqib_member_id = p_naqib, default_partner_naqib_member_id = p_partner, naqib_tambahan = v_extra where id = v_id;
  end if;
  return v_id;
end $$;
grant execute on function public.perkaderan_slot_assign(text, text, integer, uuid, uuid, uuid[]) to authenticated;

drop function if exists public.perkaderan_slots(text);
create or replace function public.perkaderan_slots(p_sekolah text)
returns table(group_id uuid, tingkatan text, no_kumpulan integer, naqib_id uuid, naqib_nama text, partner_id uuid, partner_nama text,
              tambahan_ids uuid[], tambahan_nama text, madu integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran.' using errcode = '42501';
  end if;
  return query
  select g.id, g.tingkatan, g.no_kumpulan, g.naqib_member_id, n.full_name,
         g.default_partner_naqib_member_id, p.full_name, g.naqib_tambahan,
         (select string_agg(t.full_name, ' & ') from public.members t where t.id = any (g.naqib_tambahan)),
         (select count(*)::int from public.sekolah_usrah_mad_u m where m.group_id = g.id and m.is_active)
    from public.sekolah_usrah_groups g
    join public.members n on n.id = g.naqib_member_id
    left join public.members p on p.id = g.default_partner_naqib_member_id
   where g.is_active and g.sekolah = p_sekolah
   order by g.tingkatan, g.no_kumpulan;
end $$;
grant execute on function public.perkaderan_slots(text) to authenticated;

-- Analisa: 'naqib2' kini memuatkan naqib kedua + tambahan (dipisah ' & ').
CREATE OR REPLACE FUNCTION public.perkaderan_analisa_usrah(p_dari date DEFAULT NULL::date, p_hingga date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_dari  date := date_trunc('month', coalesce(p_dari, make_date(extract(year from v_today)::int, 1, 1)))::date;
  v_hingga date := least(coalesce(p_hingga, v_today), v_today);
  v_out jsonb;
begin
  if not (public.is_super_admin() or public.can_view_perkaderan()) then
    raise exception 'Tiada kebenaran melihat analisa.' using errcode = '42501';
  end if;
  if v_hingga < v_dari then raise exception 'Julat tarikh tidak sah.'; end if;

  with g as (
    select g.id, g.sekolah, g.group_name,
           greatest(v_dari, date_trunc('month', (g.created_at at time zone 'Asia/Kuala_Lumpur')::date)::date) as mula
      from public.sekolah_usrah_groups g where g.is_active
  ),
  bln as (
    select g.id as gid, to_char(m, 'YYYY-MM') as bulan
      from g, generate_series(g.mula, date_trunc('month', v_hingga)::date, interval '1 month') m
  ),
  s as (
    select s.id, s.group_id as gid, s.session_date, s.jenis, s.hadir_rekod, s.jumlah_rekod,
           greatest(1, coalesce(cardinality(s.silibus_ids), 0)) as unit
      from public.sekolah_usrah_sessions s
      join g on g.id = s.group_id
     where s.session_date between v_dari and v_hingga
  ),
  agg as (
    select g.id as gid,
      (select count(*) from s where s.gid = g.id) as sesi,
      (select count(distinct to_char(s.session_date, 'YYYY-MM')) from s where s.gid = g.id and to_char(s.session_date,'YYYY-MM') in (select bulan from bln where gid = g.id)) as bulan_ada,
      (select count(*) from bln where gid = g.id) as bulan_sepatutnya,
      (select coalesce(sum(unit), 0) from s where s.gid = g.id and s.jenis = 'fikrah') as unit_silibus,
      (select count(*) from s where s.gid = g.id and s.jenis = 'bonding') as sesi_bonding,
      (select coalesce(sum(coalesce(s.hadir_rekod, (select count(*) from public.sekolah_usrah_attendance a
                join public.sekolah_usrah_mad_u m on m.id = a.mad_u_id and m.is_active where a.session_id = s.id))), 0)
         from s where s.gid = g.id and (s.hadir_rekod is not null or exists (select 1 from public.sekolah_usrah_attendance a where a.session_id = s.id))) as hadir,
      (select coalesce(sum(coalesce(s.jumlah_rekod, (select count(*) from public.sekolah_usrah_mad_u m
                where m.group_id = s.gid and m.is_active and m.added_at::date <= s.session_date))), 0)
         from s where s.gid = g.id and (s.hadir_rekod is not null or exists (select 1 from public.sekolah_usrah_attendance a where a.session_id = s.id))) as peluang,
      (select max(session_date) from s where s.gid = g.id) as sesi_terakhir,
      (select coalesce(jsonb_agg(b.bulan order by b.bulan), '[]'::jsonb) from bln b
        where b.gid = g.id and not exists (select 1 from s where s.gid = g.id and to_char(s.session_date,'YYYY-MM') = b.bulan)) as bulan_tiada,
      (select count(*) from public.sekolah_usrah_mad_u m where m.group_id = g.id and m.is_active) as madu
    from g
  )
  select jsonb_build_object(
    'dari', v_dari, 'hingga', v_hingga,
    'kumpulan', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_id', g.id, 'sekolah', g.sekolah, 'group_name', g.group_name, 'madu', a.madu,
        'tingkatan', (select x.tingkatan from public.sekolah_usrah_groups x where x.id = g.id),
        'no_kumpulan', (select x.no_kumpulan from public.sekolah_usrah_groups x where x.id = g.id),
        'naqib', (select n.full_name from public.sekolah_usrah_groups x join public.members n on n.id = x.naqib_member_id where x.id = g.id),
        'naqib2', (select string_agg(n.full_name, ' & ' order by o.ord) from public.sekolah_usrah_groups x
                     cross join lateral unnest(array[x.default_partner_naqib_member_id] || x.naqib_tambahan) with ordinality as o(id, ord)
                     join public.members n on n.id = o.id where x.id = g.id),
        'sesi', a.sesi, 'sesi_bonding', a.sesi_bonding, 'unit_silibus', a.unit_silibus,
        'bulan_ada', a.bulan_ada, 'bulan_sepatutnya', a.bulan_sepatutnya,
        'hadir', a.hadir, 'peluang', a.peluang, 'sesi_terakhir', a.sesi_terakhir, 'bulan_tiada', a.bulan_tiada)
        order by g.sekolah, (select x.tingkatan from public.sekolah_usrah_groups x where x.id = g.id), (select x.no_kumpulan from public.sekolah_usrah_groups x where x.id = g.id), g.group_name)
      from g join agg a on a.gid = g.id), '[]'::jsonb),
    'bulanan', coalesce((
      select jsonb_agg(jsonb_build_object('bulan', y.bulan, 'kumpulan_ada', y.ada, 'kumpulan_sepatutnya', y.perlu) order by y.bulan)
      from (select b.bulan, count(*) as perlu,
                   count(*) filter (where exists (select 1 from s where s.gid = b.gid and to_char(s.session_date,'YYYY-MM') = b.bulan)) as ada
              from bln b group by b.bulan) y), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $function$;
