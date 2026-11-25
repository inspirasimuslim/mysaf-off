-- Prestasi mad'u: sesi import Google Form (bilangan sahaja, tiada nama) tidak dikira sebagai 'tidak hadir' bagi setiap mad'u.
CREATE OR REPLACE FUNCTION public.perkaderan_prestasi_madu(p_program uuid DEFAULT NULL::uuid)
 RETURNS TABLE(mad_u_id uuid, nama text, tingkatan text, kelas text, sekolah text, group_name text, naqib_nama text, usrah_hadir integer, usrah_jumlah integer, tamrin_hadir integer, tamrin_jumlah integer, sasaran_usrah integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      where s.group_id = g.id and s.session_date >= m.added_at::date and s.session_date <= v_today and (s.sumber is distinct from 'import_google_form' or exists (select 1 from public.sekolah_usrah_attendance a0 where a0.session_id = s.id))),
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
end $function$
;

CREATE OR REPLACE FUNCTION public.perkaderan_prestasi_detail(p_mad_u uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      where s.group_id = g.id and s.session_date >= m.added_at::date and s.session_date <= v_today and (s.sumber is distinct from 'import_google_form' or exists (select 1 from public.sekolah_usrah_attendance a0 where a0.session_id = s.id))), '[]'::jsonb),
    'tamrin', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarikh', t.tarikh, 'nama', t.nama,
        'hadir', exists (select 1 from public.perkaderan_tamrin_attendance ta where ta.tamrin_id = t.id and ta.mad_u_id = m.id))
        order by t.tarikh)
      from public.perkaderan_tamrin t
      where t.program_id = g.program_id and t.tarikh >= m.added_at::date and t.tarikh <= v_today), '[]'::jsonb)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.perkaderan_prestasi_ringkasan(p_program uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               sum(coalesce(s.hadir_rekod, (select count(*) from public.sekolah_usrah_attendance a where a.session_id = s.id))) as hadir,
               sum(coalesce(s.jumlah_rekod, (select count(*) from aktif k where k.gid = s.group_id and k.ditambah <= s.session_date))) as peluang
          from public.sekolah_usrah_sessions s
          join public.sekolah_usrah_groups g on g.id = s.group_id
         where g.program_id is not distinct from v_prog and s.session_date <= v_today and (s.hadir_rekod is not null or (s.sumber is distinct from 'import_google_form' or exists (select 1 from public.sekolah_usrah_attendance a0 where a0.session_id = s.id)))
         group by 1) y), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $function$
;
