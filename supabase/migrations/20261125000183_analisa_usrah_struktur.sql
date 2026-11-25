-- Analisa usrah: tambah tingkatan, no. kumpulan dan nama naqib (2026-11-25)
create or replace function public.perkaderan_analisa_usrah(p_dari date default null, p_hingga date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        'naqib2', (select n.full_name from public.sekolah_usrah_groups x join public.members n on n.id = x.default_partner_naqib_member_id where x.id = g.id),
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
end $$;
revoke all on function public.perkaderan_analisa_usrah(date, date) from public, anon;
grant execute on function public.perkaderan_analisa_usrah(date, date) to authenticated;
